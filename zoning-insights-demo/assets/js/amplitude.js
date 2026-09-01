/* ==========================================================================
 * Amplitude Zoning Insights 연동
 * --------------------------------------------------------------------------
 * 참고: https://amplitude.com/docs/zoning-insights/instrumentation
 *
 * Zoning Insights 는 별도의 SDK 나 플러그인이 없습니다. Browser SDK 2 의
 * Autocapture 가 만들어내는 다음 데이터를 그대로 사용합니다.
 *
 *   pageViews                            → 페이지뷰 (존 지표의 분모)
 *   elementInteractions                  → 클릭 / 스크롤
 *   elementInteractions.viewportContentUpdated → 요소 노출(exposure)
 *   frustrationInteractions              → rage click / dead click (선택, 권장)
 *
 * 요구 SDK 버전: Browser SDK 2.39.0 이상 (여기서는 2.45.8 사용)
 * Zoning Insights 는 클라이언트 사이드 SDK 가 필요합니다. 서버사이드
 * 커넥터만으로는 존 지표를 만들 수 없습니다.
 * ========================================================================== */

(function () {
  'use strict';

  // Amplitude 프로젝트 API Key.
  // 브라우저 SDK 의 API Key 는 write-only 공개 키이므로 클라이언트에 노출됩니다.
  var AMPLITUDE_API_KEY = 'c9d6c776f682045c5a2456782659cb49';

  var SDK_URL = 'https://cdn.amplitude.com/libs/analytics-browser-2.45.8-min.js.gz';

  /* ----------------------------------------------------------------------
   * 1. Amplitude Browser SDK 2 스니펫 (CDN 로더 + 함수 큐)
   *    SDK 가 내려오기 전에 호출한 amplitude.* 는 큐에 쌓였다가 실행됩니다.
   * -------------------------------------------------------------------- */
  !function(){"use strict";!function(e,t){var r=e.amplitude||{_q:[],_iq:{}};if(r.invoked)e.console&&console.error&&console.error("Amplitude snippet has been loaded.");else{var n=function(e,t){e.prototype[t]=function(){return this._q.push({name:t,args:Array.prototype.slice.call(arguments,0)}),this}},s=function(e,t,r){return function(n){e._q.push({name:t,args:Array.prototype.slice.call(r,0),resolve:n})}},o=function(e,t,r){e._q.push({name:t,args:Array.prototype.slice.call(r,0)})},i=function(e,t,r){e[t]=function(){if(r)return{promise:new Promise(s(e,t,Array.prototype.slice.call(arguments)))};o(e,t,Array.prototype.slice.call(arguments))}},a=function(e){for(var t=0;t<g.length;t++)i(e,g[t],!1);for(var r=0;r<m.length;r++)i(e,m[r],!0)};r.invoked=!0;var c=t.createElement("script");c.type="text/javascript",c.crossOrigin="anonymous",c.async=!0,c.src=SDK_URL,c.onload=function(){e.amplitude.runQueuedFunctions||console.log("[Amplitude] Error: could not load SDK")};var l=t.getElementsByTagName("script")[0];l.parentNode.insertBefore(c,l);for(var u=function(){return this._q=[],this},p=["add","append","clearAll","prepend","set","setOnce","unset","preInsert","postInsert","remove","getUserProperties"],d=0;d<p.length;d++)n(u,p[d]);r.Identify=u;for(var f=function(){return this._q=[],this},v=["getEventProperties","setProductId","setQuantity","setPrice","setRevenue","setRevenueType","setEventProperties"],y=0;y<v.length;y++)n(f,v[y]);r.Revenue=f;var g=["getDeviceId","setDeviceId","getSessionId","setSessionId","getUserId","setUserId","setOptOut","setTransport","reset","extendSession"],m=["init","add","remove","track","logEvent","identify","groupIdentify","setGroup","revenue","flush"];a(r),r.createInstance=function(e){return r._iq[e]={_q:[]},a(r._iq[e]),r._iq[e]},e.amplitude=r}}(window,document)}();

  /* ----------------------------------------------------------------------
   * 2. 데모용 이벤트 로거 플러그인 (enrichment)
   *    화면 하단 패널에 전송 이벤트를 그대로 보여주기 위한 것으로,
   *    Zoning Insights 동작에는 필요하지 않습니다. 이벤트를 변경하지 않고
   *    그대로 반환합니다.
   * -------------------------------------------------------------------- */
  window.amplitude.add({
    name: 'demo-event-logger',
    type: 'enrichment',
    setup: function () { return Promise.resolve(undefined); },
    execute: function (event) {
      try {
        if (window.BZ && window.BZ.logEvent) window.BZ.logEvent(event);
      } catch (e) { /* 로깅 실패가 트래킹을 막지 않도록 무시 */ }
      return Promise.resolve(event);
    }
  });

  /* ----------------------------------------------------------------------
   * 3. 초기화 — Zoning Insights 에 필요한 Autocapture 설정
   * -------------------------------------------------------------------- */
  window.amplitude.init(AMPLITUDE_API_KEY, {
    // 자동 수집 항목
    autocapture: {
      // [필수] 페이지뷰 — 존 지표(클릭률·노출률)의 분모가 됩니다.
      pageViews: true,

      // [필수] 요소 상호작용 — 클릭 / 스크롤 / 노출
      elementInteractions: {
        // [필수] 요소 노출(exposure) 추적.
        // SPA 처럼 콘텐츠가 동적으로 그려질 때도 노출을 잡아줍니다.
        viewportContentUpdated: {
          enabled: true,
          // 요소가 뷰포트에 머물러야 "노출"로 인정되는 시간(ms). 기본 150.
          exposureDuration: 150
        }
      },

      // [선택·권장] rage click / dead click — 존별 Frustration 지표
      frustrationInteractions: true,

      // 기본 Autocapture 항목들 (세션·폼·파일 다운로드)
      sessions: true,
      formInteractions: true,
      fileDownloads: true
    },

    // 데모 사이트이므로 IP 기반 위치 추정은 끕니다.
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true
    },

    // 배치 전송 대신 즉시 전송 — 시연 중 이벤트가 바로 보이도록.
    flushIntervalMillis: 1000,
    flushQueueSize: 5,

    // 콘솔에서 SDK 동작을 확인할 수 있게 (운영에서는 'Warn' 권장)
    logLevel: 3 // 0 None / 1 Error / 2 Warn / 3 Verbose
  });

  /* ----------------------------------------------------------------------
   * 4. 페이지 단위 공통 이벤트 속성
   *    Zoning Insights 의 페이지 그룹(URL 패턴 매칭)과 함께 쓰기 좋도록
   *    화면 이름을 사용자 속성이 아닌 이벤트 속성으로 실어 보냅니다.
   * -------------------------------------------------------------------- */
  window.BZ_TRACK = function (eventName, props) {
    var base = {
      screen_name: (document.body && document.body.dataset.screen) || 'unknown',
      page_path: location.pathname,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight
    };
    var merged = Object.assign({}, base, props || {});
    window.amplitude.track(eventName, merged);
  };
})();
