/* 의존성 없는 CDP 드라이버로 Custom Integration 흐름을 검증한다.
 *
 * 실행:
 *   ./serve.sh &
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --headless=new --remote-debugging-port=9222 \
 *     --user-data-dir=/tmp/exp-chrome about:blank &
 *   node test/integration-test.mjs
 */

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const CDP  = process.env.CDP  ?? 'http://localhost:9222';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error(`CDP 타겟을 찾지 못했습니다 (${CDP})`);
}

class Session {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.logs = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
      if (m.method === 'Runtime.consoleAPICalled') {
        this.logs.push(`[${m.params.type}] ` +
          m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        this.logs.push('[EXCEPTION] ' +
          (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) return undefined;   // 아직 없는 요소 등은 undefined
    return r.result.value;
  }
  async waitFor(expr, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await this.eval(expr)) return true;
      await sleep(150);
    }
    return false;
  }
}

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? '  — ' + detail : ''}`);
};

const ws = new WebSocket(await target());
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
const s = new Session(ws);
await s.send('Runtime.enable');
await s.send('Page.enable');

// ── 시나리오 A: 최초 방문 ────────────────────────────────────────────────
console.log('\n▶ 시나리오 A — 최초 방문 (localStorage 비어 있음)');
await s.send('Page.navigate', { url: BASE });
await s.waitFor(`!!window.__expTest`);
await s.eval(`localStorage.clear()`);
await s.send('Page.navigate', { url: BASE });

check('ID 입력 팝업이 뜬다',
  await s.waitFor(`!!document.querySelector('.expid__box')`));

check('안티 플리커 마스크가 걸린다',
  await s.eval(`document.documentElement.classList.contains('expid-masking')`));

check('본문은 마스크로 가려진다',
  (await s.eval(`getComputedStyle(document.querySelector('.site-header')).visibility`)) === 'hidden');

check('팝업은 마스크 예외로 보인다',
  (await s.eval(`getComputedStyle(document.querySelector('.expid__box')).visibility`)) === 'visible');

check('ID 확정 전에는 Web Experiment 스크립트를 주입하지 않는다',
  (await s.eval(`window.__expTest.state.scriptStatus`)) === 'pending'
  && (await s.eval(`!document.querySelector('script[src*=".experiment.js"]')`)),
  `scriptStatus=${await s.eval(`window.__expTest.state.scriptStatus`)}`);

check('따라서 getUser() 도 아직 호출되지 않았다',
  (await s.eval(`window.__expTest.state.getUserCalls`)) === 0);

// 빈 값 제출 → 검증 에러
await s.eval(`document.querySelector('#expid-submit').click(); true`);
await sleep(150);
check('빈 값 제출은 거부된다',
  (await s.eval(`document.querySelector('#expid-err').textContent`))?.length > 0
  && await s.eval(`!!document.querySelector('.expid')`));

// device_id 랜덤 생성
await s.eval(`document.querySelector('#expid-gen').click(); true`);
const generated = await s.eval(`document.querySelector('#expid-device').value`);
check('랜덤 생성이 UUID 를 채운다', /^[0-9a-f-]{32,36}$/i.test(generated ?? ''), generated);

// 정상 입력 후 제출
await s.eval(`
  document.querySelector('#expid-user').value = 'test-user-001';
  document.querySelector('#expid-device').value = 'device-abc-123';
  document.querySelector('#expid-submit').click();
  true
`);
await sleep(250);

check('제출하면 팝업이 닫힌다', await s.eval(`!document.querySelector('.expid')`));

const gu = await s.eval(`JSON.stringify(window.experimentIntegration.getUser())`);
check('getUser() 가 입력값을 반환한다',
  gu === '{"user_id":"test-user-001","device_id":"device-abc-123"}', gu);

check('localStorage 에 저장된다',
  (await s.eval(`localStorage.getItem('ampExpTest.identity')`)) ===
  '{"user_id":"test-user-001","device_id":"device-abc-123"}');

// ── 핵심: 실제 Amplitude 스크립트와의 핸드셰이크 ─────────────────────────
console.log('\n▶ 시나리오 A-2 — 실제 Web Experiment 스크립트 연동');

check('ID 확정 후 스크립트가 주입된다',
  await s.waitFor(`!!document.querySelector('script[src*=".experiment.js"]')`, 5000));

check('스크립트가 로드된다 (HTTP 200)',
  await s.waitFor(`window.__expTest.state.scriptStatus === 'loaded'`, 15000),
  `scriptStatus=${await s.eval(`window.__expTest.state.scriptStatus`)}`);

check('Amplitude 가 setup() 을 호출한다',
  await s.waitFor(`window.__expTest.state.setupCalls >= 1`, 10000),
  `setupCalls=${await s.eval(`window.__expTest.state.setupCalls`)}`);

check('setup() 은 즉시 resolve 된다 (ID 가 이미 확정됨)',
  (await s.eval(`window.__expTest.state.setupResolvedAt`)) === 'immediate',
  `resolvedAt=${await s.eval(`window.__expTest.state.setupResolvedAt`)}`);

check('Amplitude 가 getUser() 를 호출한다',
  await s.waitFor(`window.__expTest.state.getUserCalls >= 1`, 10000),
  `getUserCalls=${await s.eval(`window.__expTest.state.getUserCalls`)}`);

check('webExperiment 클라이언트가 전역에 생성된다',
  await s.waitFor(`!!window.webExperiment`, 10000));

check('Amplitude 가 우리 인테그레이션을 플러그인으로 채택한다',
  (await s.eval(`window.experimentIntegration && window.experimentIntegration.type`)) === 'integration',
  `type=${await s.eval(`window.experimentIntegration && window.experimentIntegration.type`)}`);

check('getUser() 호출 시점에 identity 가 이미 있다 (경고 로그 없음)',
  !s.logs.some((l) => l.includes('identity 가 확정되기 전에')));

await s.waitFor(`!document.documentElement.classList.contains('expid-masking')`, 6000);
check('마스크가 해제되어 본문이 보인다',
  (await s.eval(`document.documentElement.classList.contains('expid-masking')`)) === false
  && (await s.eval(`getComputedStyle(document.querySelector('.site-header')).visibility`)) === 'visible');

// ── 시나리오 B: 재방문 ──────────────────────────────────────────────────
console.log('\n▶ 시나리오 B — 재방문 (localStorage 에 ID 있음)');
await s.send('Page.navigate', { url: BASE });
await s.waitFor(`window.__expTest.state.scriptStatus === 'loaded'`, 15000);
await sleep(1200);

check('팝업이 다시 뜨지 않는다', await s.eval(`!document.querySelector('.expid')`));

check('저장된 ID 를 출처로 쓴다',
  (await s.eval(`window.__expTest.state.source`)) === 'storage');

const gu2 = await s.eval(`JSON.stringify(window.experimentIntegration.getUser())`);
check('getUser() 가 저장된 ID 를 반환한다',
  gu2 === '{"user_id":"test-user-001","device_id":"device-abc-123"}', gu2);

check('재방문에서도 setup()/getUser() 가 호출된다',
  (await s.eval(`window.__expTest.state.setupCalls`)) >= 1
  && (await s.eval(`window.__expTest.state.getUserCalls`)) >= 1,
  `setup=${await s.eval(`window.__expTest.state.setupCalls`)} getUser=${await s.eval(`window.__expTest.state.getUserCalls`)}`);

check('track() 은 비어 있지만 호출 가능하고 true 를 반환한다',
  (await s.eval(`window.experimentIntegration.track({eventType:'$impression',eventProperties:{}})`)) === true);

// ── 시나리오 C: 페이지 인터랙션 ──────────────────────────────────────────
console.log('\n▶ 시나리오 C — 페이지 동작');
const c0 = await s.eval(`document.querySelector('#hero-count').textContent`);
await s.eval(`document.querySelector('#hero-next').click(); true`);
await sleep(200);
const c1 = await s.eval(`document.querySelector('#hero-count').textContent`);
check('배너 캐러셀이 넘어간다', c0 !== c1, `${c0} → ${c1}`);

await s.eval(`document.querySelector('[data-expand="cat-surgery"]').click(); true`);
await sleep(150);
const visible = await s.eval(
  `[...document.querySelectorAll('#cat-surgery .cat__item')].filter(e=>getComputedStyle(e).display!=='none').length`);
check('카테고리 더보기가 항목을 펼친다', visible === 12, `보이는 항목 ${visible}개`);

await s.eval(`document.querySelectorAll('#keywords .chip')[2].click(); true`);
check('검색어 칩이 검색창을 채운다',
  (await s.eval(`document.querySelector('#search-input').value`)) === '인중축소');

const sw = await s.eval(`document.documentElement.scrollWidth`);
const vw = await s.eval(`window.innerWidth`);
check('가로 스크롤이 생기지 않는다', sw <= vw + 1, `scrollWidth=${sw} vw=${vw}`);

// ── 콘솔 로그 ────────────────────────────────────────────────────────────
console.log('\n▶ 브라우저 콘솔');
for (const l of s.logs) console.log('   ' + l);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
if (failed.length) {
  console.log('실패:');
  failed.forEach((f) => console.log('  - ' + f.name));
  process.exitCode = 1;
}
ws.close();
