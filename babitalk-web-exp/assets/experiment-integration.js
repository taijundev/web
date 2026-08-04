/* ══════════════════════════════════════════════════════════════════════════
   Amplitude Web Experiment — Custom Integration
   문서: https://amplitude.com/docs/web-experiment/implementation#custom-integrations

   IntegrationPlugin 인터페이스 (문서 원문):
     getUser(): object          — experiment user 객체를 반환
     track(): boolean           — 서드파티로 이벤트 전송. 성공 시 true.
                                  false 를 반환하면 Amplitude 가 이벤트를
                                  보관해 두고 일정 간격으로 재시도한다.
     setup(): Promise<void>     — (선택) 비동기 초기화. getUser() 가 유저 정보를
                                  반환할 수 있게 되면 resolve 되는 Promise.

   ── 순서 보장 전략 ──────────────────────────────────────────────────────
   요구사항: "user_id / device_id 를 팝업으로 받은 뒤에 Experiment SDK 초기화".

   문서만 보면 setup() 이 그 훅이다. 실제로 배포 번들(IntegrationManager)은
   이렇게 동작한다 — setup() 을 await 하고, 그 사이 track() 이벤트는 큐에 쌓아
   둔 뒤 resolve 시점에 flush 한다. 내부 타임아웃도 없어서 사람이 팝업을 오래
   붙들고 있어도 안전하다:

       setIntegration(e) {
         e.setup
           ? e.setup(config, client).then(onDone, onDone)   // ← isReady 해제
           : (queue.setTracker(...), resolve())
       }
       ready() { return this.integration ? this.isReady : Promise.resolve() }

   그런데 ready() 를 기다리는 호출 경로가 전부가 아니다:
       원격 플래그 fetch (doFetch/doFlags) → addContextOrWait() → ready() 대기  ✅
       로컬 플래그 평가 (evaluate)         → addContext()      → 대기 안 함    ❌
       start() 전체                       → initialFlags 에 holdout-/mutex-
                                            접두 키가 있을 때만 ready() 대기

   즉 Web Experiment 스크립트를 정적 <script> 태그로 두면, 팝업이 열려 있는
   동안 applyVariants() 가 진행돼 로컬 평가 실험이 user_id/device_id 없이
   버킷팅될 수 있다.

   그래서 이 구현은 스크립트 자체를 ID 확정 후에 주입한다. 문서의 async
   안티 플리커 스니펫과 같은 방식이고, 이러면 모든 평가 경로에서 순서가
   구조적으로 보장된다. setup() 도 명세대로 구현해 두었다 — 이 구조에서는
   호출 시점에 이미 ID 가 있으므로 즉시 resolve 된다.

   ID 는 localStorage 에 저장되고, 저장돼 있으면 팝업을 띄우지 않는다.
   (= 최초 1회만 입력)
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── 설정 ────────────────────────────────────────────────────────────────
  var defaults = {
    apiKey: '',
    dataCenter: 'us',
    storageKey: 'ampExpTest.identity',
    minIdLength: 5,
    maskUntilReady: true,
    maskGraceMs: 250,
    maskTimeoutMs: 3000,
    debugPanel: true,
  };

  var cfg = {};
  var userCfg = window.EXP_CONFIG || {};
  for (var k in defaults) { cfg[k] = (k in userCfg) ? userCfg[k] : defaults[k]; }

  function scriptUrl() {
    var host = cfg.dataCenter === 'eu' ? 'cdn.eu.amplitude.com' : 'cdn.amplitude.com';
    return 'https://' + host + '/script/' + cfg.apiKey + '.experiment.js';
  }

  // HTTP V2 API 수집 엔드포인트
  // https://amplitude.com/docs/apis/analytics/http-v2
  function eventEndpoint() {
    return cfg.dataCenter === 'eu'
      ? 'https://api.eu.amplitude.com/2/httpapi'
      : 'https://api2.amplitude.com/2/httpapi';
  }

  // 디버그 패널에 노출할 상태. 커스텀 인테그레이션이 실제로 호출됐는지
  // 확인하는 게 이 테스트 페이지의 핵심 관찰 포인트다.
  var state = {
    identity: null,
    source: null,          // 'storage' | 'prompt'
    scriptStatus: 'pending',   // pending | loading | loaded | error | no-key
    setupCalls: 0,
    setupResolvedAt: null,
    getUserCalls: 0,
    trackCalls: 0,
    lastTrack: null,
    lastSend: null,            // { ok: true|false|null, text: string }
  };

  // ── localStorage 래퍼 (프라이빗 모드 등에서 throw 하므로 방어) ──────────
  function readStored() {
    try {
      var raw = window.localStorage.getItem(cfg.storageKey);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (o && typeof o.user_id === 'string' && typeof o.device_id === 'string'
          && o.user_id && o.device_id) return o;
      return null;
    } catch (e) { return null; }
  }

  function writeStored(o) {
    try { window.localStorage.setItem(cfg.storageKey, JSON.stringify(o)); }
    catch (e) { warn('localStorage 저장 실패 — 이번 세션에만 유지됩니다.', e); }
  }

  function clearStored() {
    try { window.localStorage.removeItem(cfg.storageKey); } catch (e) {}
  }

  function log()  { try { console.info.apply(console, ['[exp-integration]'].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, ['[exp-integration]'].concat([].slice.call(arguments))); } catch (e) {} }

  // ── 안티 플리커 마스크 ──────────────────────────────────────────────────
  var masking = false;

  function applyMask() {
    if (masking || !cfg.maskUntilReady) return;
    masking = true;
    document.documentElement.classList.add('expid-masking');
    // 최후의 안전장치: 무슨 일이 있어도 페이지가 영구히 숨겨지지 않게 한다.
    window.setTimeout(function () {
      if (masking) { warn('마스크 failsafe 발동 (20s) — 강제 해제합니다.'); releaseMask(); }
    }, 20000);
  }

  function releaseMask() {
    if (!masking) return;
    masking = false;
    document.documentElement.classList.remove('expid-masking');
  }

  // ── 모달 ────────────────────────────────────────────────────────────────
  function whenBodyReady() {
    return new Promise(function (resolve) {
      if (document.body) return resolve();
      document.addEventListener('DOMContentLoaded', function () { resolve(); }, { once: true });
    });
  }

  function uuid() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (e) {}
    var s = '';
    for (var i = 0; i < 32; i++) {
      s += Math.floor(Math.random() * 16).toString(16);
      if (i === 7 || i === 11 || i === 15 || i === 19) s += '-';
    }
    return s;
  }

  /** 팝업을 띄우고 {user_id, device_id} 로 resolve 한다. */
  function promptForIdentity() {
    return whenBodyReady().then(function () {
      return new Promise(function (resolve) {
        var overlay = document.createElement('div');
        overlay.className = 'expid';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'expid-title');

        overlay.innerHTML = [
          '<div class="expid__box">',
            '<p class="expid__eyebrow">Amplitude Web Experiment</p>',
            '<h2 class="expid__title" id="expid-title">테스트 사용자 설정</h2>',
            '<p class="expid__lede">Custom Integration 의 <code>getUser()</code> 가 반환할 값입니다. ',
              '입력을 완료하면 Experiment SDK 를 로드합니다. ',
              '이 값은 브라우저에 저장되어 <b>다음 방문부터는 묻지 않습니다.</b></p>',

            '<div class="expid__field">',
              '<label class="expid__label" for="expid-user">user_id</label>',
              '<input class="expid__input" id="expid-user" type="text" autocomplete="off" ',
                'spellcheck="false" placeholder="예: test-user-001">',
              '<p class="expid__hint">Amplitude 에서 사용자를 식별하는 ID. ',
                cfg.minIdLength, '자 이상 — HTTP V2 API 가 짧은 ID 를 제거한다.</p>',
            '</div>',

            '<div class="expid__field">',
              '<label class="expid__label" for="expid-device">device_id',
                '<button type="button" class="expid__gen" id="expid-gen">랜덤 생성</button>',
              '</label>',
              '<input class="expid__input" id="expid-device" type="text" autocomplete="off" ',
                'spellcheck="false" placeholder="예: 0a1b2c3d-…">',
              '<p class="expid__hint">기기 식별자. 타겟팅·분배 버킷 결정에 쓰입니다.</p>',
            '</div>',

            '<p class="expid__err" id="expid-err" role="alert"></p>',
            '<button type="button" class="expid__submit" id="expid-submit">저장하고 실험 시작</button>',
            '<p class="expid__note">저장 위치: localStorage[&quot;' + cfg.storageKey + '&quot;]<br>',
              '우측 하단 디버그 패널에서 초기화할 수 있습니다.</p>',
          '</div>',
        ].join('');

        document.body.appendChild(overlay);

        var userInput   = overlay.querySelector('#expid-user');
        var deviceInput = overlay.querySelector('#expid-device');
        var errEl       = overlay.querySelector('#expid-err');

        overlay.querySelector('#expid-gen').addEventListener('click', function () {
          deviceInput.value = uuid();
          deviceInput.setAttribute('aria-invalid', 'false');
        });

        function submit() {
          var userId   = userInput.value.trim();
          var deviceId = deviceInput.value.trim();

          userInput.setAttribute('aria-invalid', String(!userId));
          deviceInput.setAttribute('aria-invalid', String(!deviceId));

          if (!userId || !deviceId) {
            errEl.textContent = 'user_id 와 device_id 를 모두 입력하세요.';
            (userId ? deviceInput : userInput).focus();
            return;
          }

          // HTTP V2 API 는 기본적으로 5자 미만 ID 를 이벤트에서 제거한다.
          // 여기서 막지 않으면 유저가 붙지 않은 노출 이벤트가 조용히 쌓인다.
          var shortUser = userId.length < cfg.minIdLength;
          var shortDevice = deviceId.length < cfg.minIdLength;
          if (shortUser || shortDevice) {
            userInput.setAttribute('aria-invalid', String(shortUser));
            deviceInput.setAttribute('aria-invalid', String(shortDevice));
            errEl.textContent = cfg.minIdLength + '자 이상 입력하세요. '
              + '더 짧으면 Amplitude 가 ID 를 이벤트에서 제거합니다.';
            (shortUser ? userInput : deviceInput).focus();
            return;
          }

          overlay.remove();
          resolve({ user_id: userId, device_id: deviceId });
        }

        overlay.querySelector('#expid-submit').addEventListener('click', submit);
        overlay.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });

        userInput.focus();
      });
    });
  }

  // ── identity 확정 ───────────────────────────────────────────────────────
  // 여러 번 호출돼도 팝업은 한 번만 뜨도록 Promise 를 싱글턴으로 둔다.
  var identityPromise = null;

  function ensureIdentity() {
    if (identityPromise) return identityPromise;

    var stored = readStored();
    if (stored) {
      state.identity = stored;
      state.source = 'storage';
      log('저장된 ID 사용 — 팝업 생략', stored);
      identityPromise = Promise.resolve(stored);
      return identityPromise;
    }

    identityPromise = promptForIdentity().then(function (id) {
      state.identity = id;
      state.source = 'prompt';
      writeStored(id);
      log('ID 입력 완료', id);
      renderDebug();
      return id;
    });

    return identityPromise;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 노출 이벤트 전송 — Amplitude HTTP V2 API
  // https://amplitude.com/docs/apis/analytics/http-v2
  //
  // track() 이 받는 객체 (실측):
  //   { eventType: "$impression",
  //     eventProperties: { flag_key, experiment_key, variant, metadata, time } }
  //
  // user_id / device_id 는 들어있지 않다. getUser() 값을 직접 붙여야 한다.
  // ══════════════════════════════════════════════════════════════════════
  function sendImpression(event) {
    var id = state.identity;

    // 보낼 수 없는 상황이면 false 를 반환해 Amplitude 가 보관·재시도하게 한다.
    if (!cfg.apiKey) { warn('apiKey 가 없어 노출 이벤트를 전송할 수 없습니다.'); return false; }
    if (!id)         { warn('identity 가 없어 노출 이벤트를 전송할 수 없습니다.'); return false; }

    var props = (event && event.eventProperties) || {};
    var time = typeof props.time === 'number' ? props.time : Date.now();

    var payload = {
      api_key: cfg.apiKey,

      // user_id / device_id 는 기본 5자 이상이어야 한다. 미달이면 Amplitude 가
      // 해당 ID 를 이벤트에서 제거해 버려서, 유저가 붙지 않은 이벤트가 쌓인다.
      // 팝업에서도 같은 길이로 검증하므로 값을 명시해 일치시킨다.
      options: { min_id_length: cfg.minIdLength },

      events: [{
        event_type: event.eventType,
        user_id: id.user_id,
        device_id: id.device_id,
        time: time,

        // 서버측 중복 제거(7일). 같은 노출이 재시도돼도 한 번만 집계된다.
        insert_id: [event.eventType, props.flag_key, props.variant, id.device_id, time].join(':'),

        // flag_key / variant / experiment_key 가 그대로 들어간다. Amplitude 가
        // 수집 시 [Experiment] Flag Key / Variant / Experiment Key 로 변환한다.
        event_properties: props,

        platform: 'Web',
        user_agent: navigator.userAgent,   // 브라우저·OS 컬럼 파싱용
      }],
    };

    try {
      // keepalive: 노출 직후 페이지를 떠나도 요청이 끊기지 않게 한다.
      window.fetch(eventEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.ok && body.code === 200) {
            state.lastSend = { ok: true, text: '200 · ' + (body.events_ingested != null
              ? body.events_ingested + ' ingested' : 'success') };
            log('HTTP V2 전송 성공', body);
          } else {
            state.lastSend = { ok: false, text: (body.code || res.status) + ' · ' +
              (body.error || body.message || res.statusText || 'failed') };
            warn('HTTP V2 전송 거부', res.status, body);
          }
          renderDebug();
        });
      }).catch(function (e) {
        state.lastSend = { ok: false, text: 'network error' };
        warn('HTTP V2 전송 실패', e);
        renderDebug();
      });
    } catch (e) {
      state.lastSend = { ok: false, text: 'dispatch 실패' };
      warn('HTTP V2 dispatch 실패', e);
      return false;   // 재시도 요청
    }

    state.lastSend = { ok: null, text: '전송 중…' };
    log('노출 이벤트 전송', event.eventType, props.flag_key + '=' + props.variant);
    return true;
  }

  // ══════════════════════════════════════════════════════════════════════
  // IntegrationPlugin 구현
  // ══════════════════════════════════════════════════════════════════════
  window.experimentIntegration = {

    /**
     * getUser() 가 유저 정보를 반환할 수 있을 때 resolve 되는 Promise.
     *
     * 이 구현에서는 ID 가 확정된 뒤에 Web Experiment 스크립트를 주입하므로
     * 호출 시점에 이미 identity 가 있고 즉시 resolve 된다. 그래도 문서
     * 명세대로 구현해 둔다 — 정적 태그로 바꿔도 동작하도록.
     */
    setup: function () {
      state.setupCalls++;
      var pending = !state.identity;
      renderDebug();
      return ensureIdentity().then(function () {
        state.setupResolvedAt = pending ? 'after prompt' : 'immediate';
        renderDebug();
      });
    },

    /** experiment user 객체. */
    getUser: function () {
      state.getUserCalls++;
      renderDebug();

      if (!state.identity) {
        // 이 구조에서는 도달하지 않아야 하는 경로다.
        warn('identity 가 확정되기 전에 getUser() 가 호출되었습니다.');
        return { user_id: undefined, device_id: undefined };
      }

      return {
        user_id: state.identity.user_id,
        device_id: state.identity.device_id,
      };
    },

    /**
     * 노출(impression) 이벤트를 Amplitude HTTP V2 API 로 전송한다.
     *
     * Custom Integration 에서는 Amplitude 가 노출 이벤트를 직접 보내지 않는다.
     * 이 함수가 유일한 전송 경로다. 비워두면 실험 분석 지표가 집계되지 않는다.
     *
     * return true  : dispatch 성공 → Amplitude 가 이벤트를 폐기한다.
     * return false : Amplitude 가 이벤트를 보관하고 일정 간격으로 재시도한다.
     */
    track: function (event) {
      state.trackCalls++;
      state.lastTrack = event && event.eventType ? event.eventType : '(unknown)';

      var dispatched = sendImpression(event);
      renderDebug();
      return dispatched;
    },
  };

  log('window.experimentIntegration 등록 완료.');

  // ══════════════════════════════════════════════════════════════════════
  // Web Experiment 스크립트 주입 — ID 확정 후에만
  // ══════════════════════════════════════════════════════════════════════
  function injectWebExperiment() {
    if (!cfg.apiKey || cfg.apiKey === 'API_KEY') {
      state.scriptStatus = 'no-key';
      warn('EXP_CONFIG.apiKey 가 설정되지 않았습니다. Web Experiment 스크립트를 로드하지 않습니다.');
      releaseMask();
      renderDebug();
      return;
    }

    state.scriptStatus = 'loading';
    renderDebug();

    var sc = document.createElement('script');
    sc.src = scriptUrl();
    sc.async = true;

    sc.onload = function () {
      state.scriptStatus = 'loaded';
      log('Web Experiment 스크립트 로드 완료.');
      renderDebug();
      // variant 적용에 약간의 여유를 준 뒤 마스크를 해제한다.
      window.setTimeout(releaseMask, cfg.maskGraceMs);
    };

    sc.onerror = function () {
      state.scriptStatus = 'error';
      warn('Web Experiment 스크립트 로드 실패:', sc.src);
      releaseMask();
      renderDebug();
    };

    (document.head || document.documentElement).appendChild(sc);

    // 실패 안전장치: onload 가 오지 않아도 페이지는 보여야 한다.
    window.setTimeout(releaseMask, cfg.maskTimeoutMs);
  }

  // 첫 페인트 전에 마스크를 걸어 대조군 화면이 보이지 않게 한다.
  applyMask();

  // ID 를 확정한 뒤 스크립트를 주입한다. 저장된 ID 가 있으면 동기적으로
  // 확정되므로 microtask 안에 바로 주입된다 (정적 태그와 거의 같은 타이밍).
  ensureIdentity().then(injectWebExperiment);

  // ══════════════════════════════════════════════════════════════════════
  // 디버그 패널 — 테스트 전용. cfg.debugPanel = false 로 끌 수 있다.
  // ══════════════════════════════════════════════════════════════════════
  var debugEl = null;

  var SCRIPT_LABEL = {
    pending: ['wait', '대기'],
    loading: ['wait', '로딩 중'],
    loaded:  ['ok',   '로드됨'],
    error:   ['bad',  '로드 실패'],
    'no-key': ['bad', 'apiKey 미설정'],
  };

  function renderDebug() {
    if (!cfg.debugPanel || !document.body) return;

    if (!debugEl) {
      debugEl = document.createElement('div');
      debugEl.className = 'expid-debug';
      document.body.appendChild(debugEl);
    }

    var id = state.identity;
    var sc = SCRIPT_LABEL[state.scriptStatus] || ['wait', state.scriptStatus];
    var collapsed = debugEl.classList.contains('is-collapsed');

    debugEl.innerHTML = [
      '<div class="expid-debug__head">EXPERIMENT DEBUG',
        '<button type="button" class="expid-debug__toggle" id="expid-dbg-toggle" ',
          'aria-label="패널 접기/펼치기">', collapsed ? '+' : '–', '</button>',
      '</div>',
      '<div class="expid-debug__body">',
        '<dl>',
          '<div class="expid-debug__row"><dt>script</dt><dd class="expid-debug__', sc[0], '">', sc[1], '</dd></div>',
          '<div class="expid-debug__row"><dt>user_id</dt><dd>', id ? esc(id.user_id) : '<span class="expid-debug__wait">미설정</span>', '</dd></div>',
          '<div class="expid-debug__row"><dt>device_id</dt><dd>', id ? esc(id.device_id) : '<span class="expid-debug__wait">미설정</span>', '</dd></div>',
          '<div class="expid-debug__row"><dt>출처</dt><dd>', state.source === 'storage' ? 'localStorage' : state.source === 'prompt' ? '팝업 입력' : '—', '</dd></div>',
          '<div class="expid-debug__row"><dt>setup()</dt><dd>',
            state.setupCalls
              ? '<span class="expid-debug__ok">' + state.setupCalls + '회 · ' + (state.setupResolvedAt || 'pending') + '</span>'
              : '<span class="expid-debug__wait">미호출</span>',
          '</dd></div>',
          '<div class="expid-debug__row"><dt>getUser()</dt><dd>',
            state.getUserCalls ? '<span class="expid-debug__ok">' + state.getUserCalls + '회</span>' : '<span class="expid-debug__wait">미호출</span>',
          '</dd></div>',
          '<div class="expid-debug__row"><dt>track()</dt><dd>',
            state.trackCalls ? '<span class="expid-debug__ok">' + state.trackCalls + '회 · ' + esc(state.lastTrack) + '</span>' : '<span class="expid-debug__wait">미호출</span>',
          '</dd></div>',
          '<div class="expid-debug__row"><dt>HTTP V2</dt><dd>',
            state.lastSend
              ? '<span class="expid-debug__' + (state.lastSend.ok === true ? 'ok' : state.lastSend.ok === false ? 'bad' : 'wait') + '">'
                + esc(state.lastSend.text) + '</span>'
              : '<span class="expid-debug__wait">전송 없음</span>',
          '</dd></div>',
        '</dl>',
        '<button type="button" class="expid-debug__reset" id="expid-dbg-reset">ID 초기화 후 새로고침</button>',
      '</div>',
    ].join('');

    debugEl.querySelector('#expid-dbg-toggle').addEventListener('click', function () {
      debugEl.classList.toggle('is-collapsed');
      renderDebug();
    });
    debugEl.querySelector('#expid-dbg-reset').addEventListener('click', function () {
      clearStored();
      window.location.reload();
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  whenBodyReady().then(renderDebug);

  // 콘솔에서 만져볼 수 있게 노출
  window.__expTest = {
    state: state,
    config: cfg,
    reset: function () { clearStored(); window.location.reload(); },
    getUser: function () { return window.experimentIntegration.getUser(); },
  };
})();
