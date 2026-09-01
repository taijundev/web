/* ==========================================================================
 * 번쩍마켓 — 화면 렌더링 & 인터랙션
 *
 * Zoning Insights 관점 메모
 * -------------------------
 * 존(zone)은 Amplitude UI 에서 스크린샷 위에 직접 그리기 때문에 코드에서
 * 존을 선언하지 않습니다. 대신 아래 두 가지를 지켜주면 존 매칭 품질이 좋아집니다.
 *
 *  1) 존이 될 영역마다 안정적인 id / data-* 를 부여한다.
 *     → Autocapture 의 Element Hierarchy / Element Attributes 에 실려
 *       존 안의 요소들이 리렌더 후에도 동일하게 식별됩니다.
 *  2) 목록을 동적으로 그린 뒤에는 레이아웃이 더 이상 흔들리지 않게 한다.
 *     (aspect-ratio 로 썸네일 높이를 고정해 CLS 를 없앴습니다)
 * ========================================================================== */

(function () {
  'use strict';

  var D = window.BZ_DATA;
  var LIKE_KEY = 'bz_likes';

  /* ---------------- 유틸 ---------------- */

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  function won(n) { return n.toLocaleString('ko-KR') + '원'; }

  function ago(min) {
    if (min < 60) return min + '분 전';
    if (min < 1440) return Math.floor(min / 60) + '시간 전';
    return Math.floor(min / 1440) + '일 전';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function loadLikes() {
    try { return JSON.parse(localStorage.getItem(LIKE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveLikes(list) {
    try { localStorage.setItem(LIKE_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function isLiked(id) { return loadLikes().indexOf(id) !== -1; }
  function toggleLike(id) {
    var list = loadLikes();
    var i = list.indexOf(id);
    if (i === -1) list.push(id); else list.splice(i, 1);
    saveLikes(list);
    return i === -1;
  }

  var toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('is-on'); }, 1600);
  }

  function track(name, props) {
    if (window.BZ_TRACK) window.BZ_TRACK(name, props);
  }

  /* ---------------- 상품 카드 ---------------- */

  function cardHtml(p, opts) {
    opts = opts || {};
    var liked = isLiked(p.id);
    var badge = p.deal
      ? '<span class="thumb__badge">번쩍딜</span>'
      : (p.safePay ? '<span class="thumb__badge thumb__badge--safe">안전결제</span>' : '');

    return '' +
      '<a class="card' + (opts.small ? ' card-sm' : '') + '"' +
      '   href="product.html?id=' + p.id + '"' +
      '   data-product-id="' + p.id + '"' +
      '   data-product-category="' + p.categoryId + '"' +
      '   data-amp-track-product-id="' + p.id + '"' +
      '   data-amp-track-list="' + (opts.list || 'unknown') + '"' +
      '   aria-label="' + esc(p.name) + ' ' + won(p.price) + '">' +
      '  <div class="thumb" style="--t1:' + p.tint[0] + ';--t2:' + p.tint[1] + '">' +
      '    <div class="thumb__fallback" aria-hidden="true">' + p.emoji + '</div>' +
      badge +
      '    <button class="thumb__like' + (liked ? ' is-on' : '') + '" type="button"' +
      '            data-like="' + p.id + '"' +
      '            aria-label="찜하기" aria-pressed="' + liked + '">' +
             (liked ? '♥' : '♡') +
      '    </button>' +
      '  </div>' +
      '  <p class="card__name">' + esc(p.name) + '</p>' +
      '  <div class="card__price">' +
           (p.discount ? '<span class="card__off">' + p.discount + '%</span>' : '') +
           won(p.price) +
           (p.listPrice ? '<s>' + won(p.listPrice) + '</s>' : '') +
      '  </div>' +
      '  <div class="card__meta"><span>' + p.region + '</span><span>' + ago(p.minutesAgo) + '</span></div>' +
      '</a>';
  }

  function renderList(container, products, opts) {
    if (!container) return;
    if (!products.length) {
      container.innerHTML =
        '<div class="empty"><div class="empty__emoji">🔍</div>조건에 맞는 상품이 없어요</div>';
      return;
    }
    container.innerHTML = products.map(function (p) { return cardHtml(p, opts); }).join('');
  }

  /* ---------------- 찜 버튼 (이벤트 위임) ---------------- */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-like]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    var id = btn.getAttribute('data-like');
    var p = D.byId(id);
    var on = toggleLike(id);

    btn.classList.toggle('is-on', on);
    btn.textContent = on ? '♥' : '♡';
    btn.setAttribute('aria-pressed', String(on));

    track(on ? '찜하기' : '찜 해제', {
      product_id: id,
      product_name: p ? p.name : null,
      product_category: p ? D.categoryName(p.categoryId) : null,
      price: p ? p.price : null
    });
    toast(on ? '찜 목록에 담았어요' : '찜을 해제했어요');
  });

  /* ---------------- 배너 캐러셀 ---------------- */

  function initBanner() {
    var root = $('#zone-banner');
    if (!root) return;

    var track_ = $('.banner__track', root);
    var dots = $$('.banner__dot', root);
    var idx = 0;
    var timer;

    function go(next) {
      idx = (next + dots.length) % dots.length;
      track_.style.transform = 'translateX(' + (-idx * 100) + '%)';
      dots.forEach(function (d, i) { d.classList.toggle('is-on', i === idx); });
    }

    function start() {
      stop();
      timer = setInterval(function () { go(idx + 1); }, 4500);
    }
    function stop() { if (timer) clearInterval(timer); }

    start();
    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);

    // 스와이프
    var x0 = null;
    root.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; stop(); }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) go(idx + (dx < 0 ? 1 : -1));
      x0 = null;
      start();
    });

    $$('.banner__slide', root).forEach(function (a) {
      a.addEventListener('click', function () {
        track('배너 클릭', {
          banner_id: a.dataset.bannerId,
          banner_title: a.dataset.bannerTitle,
          banner_position: Number(a.dataset.bannerPosition)
        });
      });
    });
  }

  /* ---------------- 인기 검색어 롤링 ---------------- */

  function initTrending() {
    var roll = $('#trend-roll');
    if (!roll) return;

    var i = 0;
    function paint() {
      var kw = D.trending[i % D.trending.length];
      roll.innerHTML =
        '<a class="trend__item" href="search.html?q=' + encodeURIComponent(kw) + '"' +
        '   data-trend-rank="' + ((i % D.trending.length) + 1) + '">' +
        '  <span class="trend__rank">' + ((i % D.trending.length) + 1) + '</span>' +
        '  <span>' + esc(kw) + '</span></a>';
      i++;
    }
    paint();
    setInterval(paint, 2800);
  }

  /* ---------------- 홈 ---------------- */

  function initHome() {
    if (document.body.dataset.screen !== 'home') return;

    var all = D.products;

    renderList($('#zone-deal .rail'), all.filter(function (p) { return p.discount >= 20; }).slice(0, 8),
      { small: true, list: 'today_deal' });

    renderList($('#zone-brand .rail'), all.filter(function (p) { return p.price >= 200000; }).slice(0, 8),
      { small: true, list: 'brand_pick' });

    var feed = $('#zone-feed .grid');
    var shown = 8;
    function paintFeed() {
      renderList(feed, all.slice(0, shown), { list: 'main_feed' });
    }
    paintFeed();

    var more = $('#feed-more');
    if (more) {
      more.addEventListener('click', function () {
        shown = Math.min(shown + 8, all.length);
        paintFeed();
        track('상품 더보기', { list_name: 'main_feed', items_shown: shown });
        if (shown >= all.length) more.style.display = 'none';
      });
    }

    // 카테고리 클릭
    $$('#zone-category .cat').forEach(function (a, i) {
      a.addEventListener('click', function () {
        track('카테고리 선택', {
          category_id: a.dataset.categoryId,
          category_name: a.dataset.categoryName,
          category_position: i + 1,
          entry_point: 'home_category_grid'
        });
      });
    });

    // 퀵메뉴
    $$('#zone-quick .quick__item').forEach(function (a) {
      a.addEventListener('click', function () {
        track('퀵메뉴 클릭', { menu_name: a.dataset.quick });
      });
    });

    // Dead click 시연용: 아직 준비되지 않은 메뉴
    var wip = $('#quick-wip');
    if (wip) {
      wip.addEventListener('click', function (e) {
        e.preventDefault();
        toast('아직 준비 중인 기능이에요');
      });
    }
  }

  /* ---------------- 카테고리 ---------------- */

  function initCategory() {
    if (document.body.dataset.screen !== 'category') return;

    var cid = qs('c') || 'all';
    var sort = 'recent';

    var titleEl = $('#cat-title');
    if (titleEl) titleEl.textContent = cid === 'all' ? '전체 상품' : D.categoryName(cid);

    // 카테고리 칩
    var chipWrap = $('#cat-chips');
    if (chipWrap) {
      chipWrap.innerHTML =
        '<a class="chip' + (cid === 'all' ? ' is-on' : '') + '" href="category.html?c=all" data-category-id="all">전체</a>' +
        D.categories.map(function (c) {
          return '<a class="chip' + (c.id === cid ? ' is-on' : '') + '" href="category.html?c=' + c.id + '"' +
                 ' data-category-id="' + c.id + '">' + c.emoji + ' ' + c.name + '</a>';
        }).join('');
    }

    function current() {
      var list = cid === 'all'
        ? D.products.slice()
        : D.products.filter(function (p) { return p.categoryId === cid; });

      if (sort === 'low') list.sort(function (a, b) { return a.price - b.price; });
      else if (sort === 'high') list.sort(function (a, b) { return b.price - a.price; });
      else if (sort === 'popular') list.sort(function (a, b) { return b.likes - a.likes; });
      return list;
    }

    function paint() {
      var list = current();
      renderList($('#cat-grid'), list, { list: 'category_' + cid });
      var cnt = $('#cat-count');
      if (cnt) cnt.textContent = list.length.toLocaleString('ko-KR') + '개';
    }
    paint();

    $$('#cat-sort .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#cat-sort .chip').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        sort = b.dataset.sort;
        paint();
        track('정렬 변경', { category_id: cid, sort_by: sort });
      });
    });

    track('카테고리 조회', {
      category_id: cid,
      category_name: cid === 'all' ? '전체' : D.categoryName(cid),
      result_count: current().length
    });
  }

  /* ---------------- 검색 ---------------- */

  function initSearch() {
    if (document.body.dataset.screen !== 'search') return;

    var q = qs('q') || '';
    var input = $('#search-input');
    if (input) input.value = q;

    function run(keyword) {
      var k = keyword.trim().toLowerCase();
      var list = k
        ? D.products.filter(function (p) {
            return p.name.toLowerCase().indexOf(k) !== -1 ||
                   D.categoryName(p.categoryId).indexOf(k) !== -1;
          })
        : [];

      var head = $('#search-head');
      if (head) {
        head.innerHTML = k
          ? '<strong>' + esc(keyword) + '</strong> 검색 결과 <span class="section__sub">' +
            list.length + '개</span>'
          : '찾는 상품을 검색해 보세요';
      }
      renderList($('#search-grid'), k ? list : [], { list: 'search_result' });

      if (k) {
        track('검색', {
          search_keyword: keyword,
          result_count: list.length,
          has_result: list.length > 0
        });
      }
    }
    run(q);

    var form = $('#search-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = input.value;
        history.replaceState(null, '', 'search.html?q=' + encodeURIComponent(v));
        run(v);
      });
    }

    $$('#search-keywords a').forEach(function (a) {
      a.addEventListener('click', function () {
        track('추천 검색어 클릭', { search_keyword: a.textContent.trim() });
      });
    });
  }

  /* ---------------- 상품 상세 ---------------- */

  function initProduct() {
    if (document.body.dataset.screen !== 'product') return;

    var p = D.byId(qs('id') || '') || D.products[0];
    var root = $('#pd');
    if (!root) return;

    document.title = p.name + ' | 번쩍마켓';

    var hero = $('#zone-hero');
    hero.style.setProperty('--t1', p.tint[0]);
    hero.style.setProperty('--t2', p.tint[1]);
    $('#pd-fallback').textContent = p.emoji;
    $('#pd-name').textContent = p.name;
    $('#pd-price').innerHTML =
      (p.discount ? '<span class="card__off">' + p.discount + '%</span>' : '') + won(p.price);
    $('#pd-meta').innerHTML =
      '<span>' + D.categoryName(p.categoryId) + '</span>' +
      '<span>' + ago(p.minutesAgo) + '</span>' +
      '<span>조회 ' + p.views.toLocaleString('ko-KR') + '</span>';
    $('#pd-tags').innerHTML = [p.condition, p.region, p.safePay ? '안전결제 가능' : '직거래 선호', '택배 가능']
      .map(function (t) { return '<span class="pd__tag">' + t + '</span>'; }).join('');
    $('#pd-desc').textContent = p.description;

    $('#pd-seller-avatar').textContent = p.seller.name.slice(0, 1);
    $('#pd-seller-name').textContent = p.seller.name;
    $('#pd-seller-sub').textContent =
      '거래 ' + p.seller.deals + '회 · 만족도 ' + p.seller.score + ' / 5.0';

    $('#pd-stats').innerHTML =
      '<span>찜 ' + p.likes + '</span><span>채팅 ' + p.chats + '</span>';

    // 관련 상품
    var related = D.products.filter(function (x) {
      return x.categoryId === p.categoryId && x.id !== p.id;
    });
    if (related.length < 4) {
      related = related.concat(D.products.filter(function (x) {
        return x.categoryId !== p.categoryId && x.id !== p.id;
      }));
    }
    renderList($('#zone-related .rail'), related.slice(0, 8), { small: true, list: 'related' });

    // 하단 찜 버튼
    var likeBtn = $('#pd-like');
    function paintLike() {
      var on = isLiked(p.id);
      likeBtn.classList.toggle('is-on', on);
      likeBtn.textContent = on ? '♥' : '♡';
      likeBtn.setAttribute('aria-pressed', String(on));
    }
    paintLike();
    likeBtn.addEventListener('click', function () {
      var on = toggleLike(p.id);
      paintLike();
      track(on ? '찜하기' : '찜 해제', {
        product_id: p.id, product_name: p.name,
        product_category: D.categoryName(p.categoryId), price: p.price,
        entry_point: 'product_detail_bar'
      });
      toast(on ? '찜 목록에 담았어요' : '찜을 해제했어요');
    });

    $('#pd-chat').addEventListener('click', function () {
      track('채팅 시작', {
        product_id: p.id, product_name: p.name,
        product_category: D.categoryName(p.categoryId), price: p.price
      });
      toast('판매자에게 채팅을 보냈어요');
    });

    $('#pd-buy').addEventListener('click', function () {
      track('안전결제 시작', {
        product_id: p.id, product_name: p.name,
        product_category: D.categoryName(p.categoryId),
        price: p.price, payment_method: 'safe_pay'
      });
      toast('안전결제 화면으로 이동합니다 (데모)');
    });

    track('상품 상세 조회', {
      product_id: p.id,
      product_name: p.name,
      product_category: D.categoryName(p.categoryId),
      price: p.price,
      list_price: p.listPrice || null,
      discount_rate: p.discount,
      seller_name: p.seller.name,
      is_safe_pay: p.safePay
    });
  }

  /* ---------------- 마이페이지 ---------------- */

  function initMypage() {
    if (document.body.dataset.screen !== 'mypage') return;

    var likes = loadLikes();
    var el = $('#my-like-count');
    if (el) el.textContent = likes.length;

    var liked = likes.map(D.byId).filter(Boolean);
    var wrap = $('#my-likes');
    if (wrap) {
      if (liked.length) {
        renderList(wrap, liked, { list: 'my_likes' });
      } else {
        wrap.innerHTML =
          '<div class="empty"><div class="empty__emoji">♡</div>' +
          '아직 찜한 상품이 없어요<br><a href="index.html" style="color:var(--brand);font-weight:700">상품 둘러보기</a></div>';
      }
    }

    $$('#my-menu .menu__row').forEach(function (row) {
      row.addEventListener('click', function () {
        track('마이페이지 메뉴 클릭', { menu_name: row.dataset.menu });
        toast('데모에서는 지원하지 않는 메뉴예요');
      });
    });
  }

  /* ---------------- 스크롤 깊이 (Zoning Insights 스크롤 지표 보조) ---------------- */

  function initScrollDepth() {
    var marks = [25, 50, 75, 100];
    var fired = {};
    var ticking = false;

    function check() {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      var pct = Math.min(100, Math.round((window.scrollY / max) * 100));
      marks.forEach(function (m) {
        if (pct >= m && !fired[m]) {
          fired[m] = true;
          track('스크롤 깊이', { scroll_depth: m, screen_name: document.body.dataset.screen });
        }
      });
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(check); }
    }, { passive: true });
  }

  /* ---------------- 검색 진입 ---------------- */

  function initSearchEntry() {
    var box = $('#search-entry');
    if (!box) return;
    box.addEventListener('click', function () {
      track('검색창 진입', { entry_point: document.body.dataset.screen });
    });
  }

  /* ---------------- 부트 ---------------- */

  function boot() {
    initBanner();
    initTrending();
    initHome();
    initCategory();
    initSearch();
    initProduct();
    initMypage();
    initScrollDepth();
    initSearchEntry();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
