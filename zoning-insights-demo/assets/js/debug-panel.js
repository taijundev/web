/* ==========================================================================
 * 시연용 이벤트 로그 패널
 * --------------------------------------------------------------------------
 * assets/js/amplitude.js 에서 등록한 enrichment 플러그인이 이 파일의
 * window.BZ.logEvent() 를 호출합니다. Amplitude 로 전송되는 이벤트를 그대로
 * 화면에서 확인할 수 있어, Zoning Insights 가 필요로 하는
 *   [Amplitude] Page Viewed / Element Clicked / Viewport Content Updated /
 *   Rage Click / Dead Click
 * 이 실제로 발생하는지 시연 중에 바로 보여줄 수 있습니다.
 *
 * 트래킹 자체에는 필요 없는 코드입니다. 운영 사이트에서는 제거하세요.
 * ========================================================================== */

(function () {
  'use strict';

  var MAX = 120;
  var buffer = [];
  var seen = 0;
  var listEl, countEl, panelEl;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 이벤트에서 존 분석에 의미 있는 속성만 골라 요약 */
  function summarize(ev) {
    var p = ev.event_properties || {};
    var keys = [
      '[Amplitude] Element Text', '[Amplitude] Element Tag',
      '[Amplitude] Element Selector', '[Amplitude] Page Path',
      '[Amplitude] Page URL', 'product_name', 'product_id',
      'category_name', 'banner_title', 'search_keyword', 'scroll_depth',
      'menu_name', 'sort_by'
    ];
    var out = [];
    keys.forEach(function (k) {
      if (p[k] !== undefined && p[k] !== null && p[k] !== '') {
        var v = String(p[k]);
        if (v.length > 64) v = v.slice(0, 64) + '…';
        out.push(k.replace('[Amplitude] ', '') + '=' + v);
      }
    });
    if (!out.length) {
      var first = Object.keys(p).slice(0, 2);
      first.forEach(function (k) { out.push(k + '=' + String(p[k]).slice(0, 40)); });
    }
    return out.join('  ');
  }

  function render() {
    if (!listEl) return;
    if (!buffer.length) {
      listEl.innerHTML = '<div class="dbg__hint">아직 전송된 이벤트가 없습니다.<br>화면을 스크롤하거나 상품을 눌러보세요.</div>';
      return;
    }
    listEl.innerHTML = buffer.map(function (r) {
      return '<div class="dbg__row">' +
             '<div class="dbg__name">' + esc(r.name) + '</div>' +
             (r.props ? '<div class="dbg__props">' + esc(r.props) + '</div>' : '') +
             '<div class="dbg__time">' + r.time + '</div>' +
             '</div>';
    }).join('');
  }

  window.BZ = window.BZ || {};
  window.BZ.logEvent = function (ev) {
    if (!ev || !ev.event_type) return;
    var d = new Date();
    buffer.unshift({
      name: ev.event_type,
      props: summarize(ev),
      time: d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
    });
    if (buffer.length > MAX) buffer.pop();
    seen++;
    if (countEl) countEl.textContent = seen > 99 ? '99+' : String(seen);
    if (panelEl && panelEl.classList.contains('is-open')) render();
  };

  function build() {
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'dbg-fab';
    fab.setAttribute('aria-label', 'Amplitude 이벤트 로그 열기');
    fab.innerHTML = '⚡<span class="dbg-fab__count">0</span>';

    var panel = document.createElement('section');
    panel.className = 'dbg';
    panel.setAttribute('aria-label', 'Amplitude 이벤트 로그');
    panel.innerHTML =
      '<header class="dbg__head">' +
      '  <span class="dbg__dot"></span>' +
      '  <span>Amplitude Autocapture 이벤트</span>' +
      '  <button type="button" class="dbg__close" aria-label="닫기">✕</button>' +
      '</header>' +
      '<div class="dbg__list"></div>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    countEl = fab.querySelector('.dbg-fab__count');
    listEl = panel.querySelector('.dbg__list');
    panelEl = panel;

    fab.addEventListener('click', function () {
      panel.classList.add('is-open');
      seen = 0;
      countEl.textContent = '0';
      render();
    });
    panel.querySelector('.dbg__close').addEventListener('click', function () {
      panel.classList.remove('is-open');
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
