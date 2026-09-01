/* ==========================================================================
 * 번쩍마켓 데모 데이터 (전부 가상의 더미 데이터입니다)
 * ========================================================================== */

window.BZ_DATA = (function () {
  'use strict';

  var CATEGORIES = [
    { id: 'women',   name: '여성의류',      emoji: '👗' },
    { id: 'men',     name: '남성의류',      emoji: '🧥' },
    { id: 'shoes',   name: '신발',          emoji: '👟' },
    { id: 'bag',     name: '가방/지갑',     emoji: '👜' },
    { id: 'watch',   name: '시계/주얼리',   emoji: '⌚' },
    { id: 'digital', name: '디지털/가전',   emoji: '💻' },
    { id: 'sports',  name: '스포츠/레저',   emoji: '⛳' },
    { id: 'car',     name: '차량/오토바이', emoji: '🏍️' },
    { id: 'star',    name: '스타굿즈',      emoji: '🎤' },
    { id: 'kidult',  name: '키덜트',        emoji: '🧸' },
    { id: 'beauty',  name: '뷰티/미용',     emoji: '💄' },
    { id: 'ticket',  name: '도서/티켓',     emoji: '🎫' }
  ];

  var CONDITIONS = ['새상품', '거의 새것', '사용감 적음', '사용감 있음'];
  var REGIONS = [
    '서울 마포구', '서울 성동구', '서울 강남구', '경기 성남시', '경기 고양시',
    '부산 해운대구', '인천 연수구', '대전 유성구', '광주 서구', '제주 제주시'
  ];

  /* 상품 시드 데이터 */
  var SEED = [
    ['아이패드 프로 11형 5세대 256GB 스페이스블랙', 'digital', 1090000, 1290000, '💻'],
    ['소니 WH-1000XM5 노이즈캔슬링 헤드폰', 'digital', 298000, 429000, '🎧'],
    ['나이키 에어포스1 07 화이트 265mm', 'shoes', 89000, 139000, '👟'],
    ['다이슨 에어랩 컴플리트 롱 니켈코퍼', 'beauty', 449000, 699000, '💇'],
    ['빈티지 카멜 오버핏 울코트 (95)', 'women', 74000, 0, '🧥'],
    ['세이코 프레사지 칵테일 블루 SRPB41', 'watch', 385000, 520000, '⌚'],
    ['LP 턴테이블 오디오테크니카 AT-LP60X', 'kidult', 168000, 259000, '🎵'],
    ['캠핑 체어 헬리녹스 체어원 블랙', 'sports', 112000, 149000, '🏕'],
    ['닌텐도 스위치 OLED 화이트 + 게임 3종', 'kidult', 289000, 0, '🎮'],
    ['맥북 에어 M3 13인치 16GB/512GB', 'digital', 1380000, 1690000, '💻'],
    ['레더 크로스백 미디엄 브라운', 'bag', 62000, 0, '👜'],
    ['아디다스 삼바 OG 클라우드화이트 270', 'shoes', 118000, 159000, '👟'],
    ['로지텍 MX Master 3S 그래파이트', 'digital', 78000, 129000, '🖱'],
    ['블랙핑크 월드투어 응원봉 미개봉', 'star', 65000, 0, '🪄'],
    ['테일러메이드 스텔스2 드라이버 10.5도', 'sports', 320000, 480000, '⛳'],
    ['샤넬st 트위드 자켓 (55)', 'women', 138000, 0, '🧵'],
    ['갤럭시 워치7 44mm 실버 (미개봉)', 'watch', 219000, 329000, '⌚'],
    ['혼다 PCX125 2023년식 3,200km', 'car', 2980000, 0, '🏍'],
    ['스탠리 퀜처 40oz 텀블러 2종', 'sports', 42000, 68000, '🥤'],
    ['이솝 리서레션 핸드밤 75ml 세트', 'beauty', 38000, 52000, '🧴'],
    ['폴로 랄프로렌 옥스포드 셔츠 (100)', 'men', 34000, 0, '👔'],
    ['레고 아이코닉 타이타닉 10294 미개봉', 'kidult', 720000, 899000, '🧱'],
    ['아이유 콘서트 2연석 티켓 양도', 'ticket', 180000, 0, '🎫'],
    ['소니 A7C II 바디 (셔터 3천컷)', 'digital', 1750000, 2290000, '📷'],
    ['무신사 스탠다드 와이드 슬랙스 (32)', 'men', 19000, 0, '👖'],
    ['샤오미 로봇청소기 X20 플러스', 'digital', 398000, 599000, '🤖'],
    ['프라이탁 F49 파울 메신저백', 'bag', 195000, 0, '🎒'],
    ['마샬 스탠모어 III 블루투스 스피커', 'digital', 388000, 549000, '🔊']
  ];

  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }

  var PRODUCTS = SEED.map(function (row, i) {
    var name = row[0];
    var h = hash(name);
    var price = row[2];
    var listPrice = row[3];
    return {
      id: 'p' + String(i + 1).padStart(3, '0'),
      name: name,
      categoryId: row[1],
      price: price,
      listPrice: listPrice,
      discount: listPrice ? Math.round((1 - price / listPrice) * 100) : 0,
      emoji: row[4],
      // 외부 이미지 CDN 대신 해시 기반 그라디언트 썸네일을 사용합니다.
      // (오프라인에서도 동일하게 렌더되어 Zoning Insights 스크린샷이 일정합니다)
      tint: ['hsl(' + (h % 360) + ' 62% 90%)', 'hsl(' + ((h % 360) + 32) % 360 + ' 58% 78%)'],
      region: REGIONS[h % REGIONS.length],
      condition: CONDITIONS[h % CONDITIONS.length],
      likes: 3 + (h % 240),
      views: 40 + (h % 3800),
      chats: 1 + (h % 28),
      minutesAgo: 3 + (h % 2600),
      safePay: h % 3 !== 0,
      deal: i % 7 === 0,
      seller: {
        name: ['번쩍유저', '중고왕', '깔끔한거래', '오늘의셀러', '창고정리중'][h % 5] + (h % 90 + 10),
        score: (3.9 + (h % 11) / 10).toFixed(1),
        deals: 4 + (h % 130)
      },
      description:
        '직거래 / 택배 모두 가능합니다.\n' +
        '상태는 ' + CONDITIONS[h % CONDITIONS.length] + ' 이며 사진에 보이는 구성품이 전부입니다.\n' +
        '단순 변심 반품은 어렵고, 하자가 있을 경우 수령 후 24시간 내 연락 주시면 처리해 드립니다.\n\n' +
        '· 거래지역: ' + REGIONS[h % REGIONS.length] + '\n' +
        '· 배송비: 3,000원 (안전결제 시 무료)\n' +
        '· 네고는 정중히 사양합니다 🙏'
    };
  });

  var BANNERS = [
    {
      id: 'bn_welcome',
      tag: '신규회원 혜택',
      title: '첫 구매 15,000원 할인',
      desc: '가입만 해도 즉시 사용 가능한 쿠폰팩',
      cta: '쿠폰 받기',
      emoji: '⚡',
      href: 'category.html?c=digital'
    },
    {
      id: 'bn_safepay',
      tag: '번쩍 안전결제',
      title: '사기 걱정 없는 중고거래',
      desc: '입금은 번쩍마켓이 보관, 수령 확인 후 정산',
      cta: '자세히 보기',
      emoji: '🛡',
      href: 'category.html?c=watch'
    },
    {
      id: 'bn_deal',
      tag: '오늘의 번쩍딜',
      title: '매일 밤 9시, 반값 특가',
      desc: '하루 30개 한정 · 선착순 마감',
      cta: '딜 보러가기',
      emoji: '🔥',
      href: 'category.html?c=sports'
    }
  ];

  var TRENDING = [
    '아이패드 프로', '삼바 270', '다이슨 에어랩', '캠핑 의자', '스위치 OLED',
    '프라이탁', '세이코 칵테일', '스탠리 텀블러', '레고 타이타닉', '맥북 에어 M3'
  ];

  return {
    categories: CATEGORIES,
    products: PRODUCTS,
    banners: BANNERS,
    trending: TRENDING,
    categoryName: function (id) {
      var c = CATEGORIES.filter(function (x) { return x.id === id; })[0];
      return c ? c.name : '전체';
    },
    byId: function (id) {
      return PRODUCTS.filter(function (p) { return p.id === id; })[0] || null;
    }
  };
})();
