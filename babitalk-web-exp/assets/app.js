/* ─────────────────────────────────────────────────────────────────────────
   페이지 인터랙션. Amplitude Web Experiment 와는 무관하다.
   실험 대상이 될 만한 요소(배너, CTA, 카테고리)가 실제로 동작하도록만 붙였다.
   ───────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ── 히어로 배너 캐러셀 ────────────────────────────────────────────── */
  (function hero() {
    var track  = document.getElementById('hero-track');
    var countEl = document.getElementById('hero-count');
    if (!track) return;

    var slides = track.children;
    var total  = slides.length;
    var index  = 0;
    var timer  = null;

    function render() {
      track.style.transform = 'translateX(' + (-index * 100) + '%)';
      countEl.textContent = (index + 1) + ' / ' + total;
      for (var i = 0; i < total; i++) {
        slides[i].setAttribute('aria-hidden', String(i !== index));
      }
    }

    function go(delta) {
      index = (index + delta + total) % total;
      render();
      restart();
    }

    function restart() {
      window.clearInterval(timer);
      timer = window.setInterval(function () { go(1); }, 5000);
    }

    document.getElementById('hero-prev').addEventListener('click', function () { go(-1); });
    document.getElementById('hero-next').addEventListener('click', function () { go(1); });

    // 탭이 백그라운드일 때는 돌리지 않는다.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) window.clearInterval(timer);
      else restart();
    });

    render();
    restart();
  })();

  /* ── 카테고리 더보기 ───────────────────────────────────────────────── */
  (function categories() {
    var extra = {
      'cat-surgery':   ['이마/관자', '남자성형', '리프팅', '지방이식', '입술', '카데바'],
      'cat-procedure': ['스킨부스터', '리프팅주사', '점/흉터', '제모', '피부관리', '두피/모발'],
    };

    Object.keys(extra).forEach(function (id) {
      var section = document.getElementById(id);
      if (!section) return;

      var grid = section.querySelector('.cat__grid');
      var btn  = section.querySelector('.cat__expand');
      var label = btn.childNodes[0];

      extra[id].forEach(function (name) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'cat__item is-extra';
        item.innerHTML = name + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
        grid.appendChild(item);
      });

      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', function () {
        var open = section.classList.toggle('is-expanded');
        btn.setAttribute('aria-expanded', String(open));
        label.nodeValue = open ? '접기 ' : '더보기 ';
      });
    });
  })();

  /* ── 인기 검색어 칩 → 검색창 ───────────────────────────────────────── */
  (function keywords() {
    var input = document.getElementById('search-input');
    var box = document.getElementById('keywords');
    if (!input || !box) return;

    box.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      input.value = chip.textContent;
      input.focus();
    });
  })();

  /* ── 네비게이션 활성 상태 ──────────────────────────────────────────── */
  (function nav() {
    var links = document.querySelectorAll('.site-nav__link');
    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        Array.prototype.forEach.call(links, function (l) { l.classList.remove('is-active'); });
        link.classList.add('is-active');
      });
    });
  })();
})();
