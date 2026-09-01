# ⚡ 번쩍마켓 — Amplitude Zoning Insights 데모

[Amplitude Zoning Insights](https://amplitude.com/docs/zoning-insights) 를 시연하기 위해 만든
**가상의 중고거래 마켓플레이스** 데모 웹사이트입니다.

> 🔗 **데모**: https://taijundev.github.io/web/zoning-insights-demo/
>
> 번쩍마켓은 실제 서비스가 아닙니다. 모바일 중고거래 앱의 일반적인 레이아웃을 참고해
> 새로 만든 데모이며, 상품·판매자·가격·리뷰는 모두 더미 데이터입니다.

---

## 1. 무엇을 확인할 수 있나

Zoning Insights 는 **페이지 스크린샷 위에 존(zone)을 직접 그려서** 영역별
클릭·노출·스크롤 지표를 보는 기능입니다. 존을 코드로 선언하지 않기 때문에,
사이트 쪽에서 해야 할 일은 **Autocapture 를 올바르게 켜는 것** 하나입니다.

이 데모는 존을 그려보기 좋게 화면을 뚜렷한 영역으로 나눠 두었습니다.

| 화면 | URL | 존으로 나눌 만한 영역 |
|---|---|---|
| 홈 | `/index.html` | 헤더·검색, 메인 배너, 카테고리 그리드, 퀵메뉴, 실시간 인기 검색어, 오늘의 번쩍딜, 브랜드 중고 추천, 메인 피드, 하단 네비 |
| 카테고리 | `/category.html?c=digital` | 카테고리 칩, 정렬 필터, 상품 목록 |
| 상품 상세 | `/product.html?id=p002` | 상품 이미지, 기본 정보, 판매자 정보, 상품 설명, 안전결제 안내, 관련 상품, 하단 구매 바 |
| 검색 | `/search.html?q=아이패드` | 검색 헤더, 추천 검색어, 검색 결과 |
| 마이페이지 | `/mypage.html` | 프로필, 활동 요약, 찜한 상품, 메뉴 |

각 영역은 HTML 에 `id="zone-*"` / `data-zone="*"` 로 표시해 두어서,
Amplitude UI 에서 존을 그릴 때 어디까지가 한 영역인지 찾기 쉽습니다.

우측 하단의 **⚡ 버튼**을 누르면 Amplitude 로 전송되는 이벤트가 실시간으로 보입니다.
시연 중에 `[Amplitude] Page Viewed`, `[Amplitude] Element Clicked`,
`[Amplitude] Viewport Content Updated` 가 실제로 발생하는지 바로 확인할 수 있습니다.

---

## 2. 연동 방법

### 2.1 SDK

- **Amplitude Browser SDK 2** `2.45.8` (CDN 스니펫)
- Zoning Insights 최소 요구 버전은 **2.39.0** 입니다.

```html
<script src="assets/js/amplitude.js"></script>
```

### 2.2 핵심 설정

전부 [`assets/js/amplitude.js`](assets/js/amplitude.js) 안에 있습니다.

```js
amplitude.init(AMPLITUDE_API_KEY, {
  autocapture: {
    // [필수] 페이지뷰 — 존 지표(클릭률·노출률)의 분모
    pageViews: true,

    // [필수] 요소 상호작용 — 클릭 / 스크롤 / 노출
    elementInteractions: {
      // [필수] 요소 노출(exposure).
      // SPA 처럼 콘텐츠가 동적으로 그려질 때의 노출도 잡아줍니다.
      viewportContentUpdated: {
        enabled: true,
        exposureDuration: 150   // 뷰포트에 머물러야 "노출"로 인정되는 시간(ms)
      }
    },

    // [선택·권장] rage click / dead click — 존별 Frustration 지표
    frustrationInteractions: true
  }
});
```

세 가지가 Zoning Insights 가 요구하는 전부입니다.

| 설정 | 만들어내는 이벤트 | 존 지표 |
|---|---|---|
| `pageViews` | `[Amplitude] Page Viewed` | 모든 비율 지표의 분모 |
| `elementInteractions` | `[Amplitude] Element Clicked` | 클릭 수·클릭률·클릭 분포 |
| `elementInteractions.viewportContentUpdated` | `[Amplitude] Viewport Content Updated` | 노출률(Exposure), 매력도(Attractiveness), 스크롤 도달 |
| `frustrationInteractions` | `[Amplitude] Rage Click` / `Dead Click` | 존별 Rage Click 지표 |

> ⚠️ Zoning Insights 는 **브라우저에서 동작하는 클라이언트 사이드 SDK** 가 필요합니다.
> 서버사이드 커넥터만으로는 존 지표를 만들 수 없습니다.

### 2.3 Amplitude 에서 존 그리기

1. Amplitude → **Zoning Insights** 진입
2. 대상 URL 지정 — 이 데모는 페이지가 나뉘어 있으므로 매칭 방식을 골라 쓸 수 있습니다.
   - Exact match: `https://taijundev.github.io/web/zoning-insights-demo/index.html`
   - Starts with: `https://taijundev.github.io/web/zoning-insights-demo/product.html` (모든 상품 상세를 한 그룹으로)
   - Pattern match: `https://taijundev.github.io/web/zoning-insights-demo/category.html?c=*`
3. 스크린샷 위에 영역을 드래그해 존 이름을 붙이고 저장
4. 데이터가 쌓이면 존별 클릭률 / 노출률 / 매력도 / Rage Click 을 확인

---

## 3. 시연 시나리오

| # | 동작 | 확인 포인트 |
|---|---|---|
| 1 | 홈 진입 | `[Amplitude] Page Viewed` + 화면에 보이는 요소들의 `Viewport Content Updated` |
| 2 | 아래로 스크롤 | 스크롤에 따라 하단 존들의 노출 이벤트가 추가로 발생 |
| 3 | 배너 / 카테고리 / 상품 카드 클릭 | `[Amplitude] Element Clicked` — 존별 클릭 분포의 원천 |
| 4 | 홈 **"내 근처"** 퀵메뉴를 빠르게 여러 번 클릭 | 동작하지 않는 메뉴로 만들어 두어 `[Amplitude] Rage Click` 발생 |
| 5 | **"상품 더보기"** 클릭 | 목록이 늘어나며 새로 그려진 카드들의 노출이 잡히는지 (SPA·동적 렌더 검증) |
| 6 | 상품 상세 → 찜 / 채팅 / 안전결제 | Autocapture 위에 얹은 커스텀 이벤트가 함께 쌓이는지 |

### 함께 수집하는 커스텀 이벤트

Autocapture 만으로 존 지표는 충분하지만, 존 분석을 퍼널·세그먼트와 이어 보기 위해
비즈니스 이벤트도 같이 보냅니다 (`assets/js/app.js`).

`상품 상세 조회` · `카테고리 조회` · `카테고리 선택` · `검색` · `배너 클릭` ·
`찜하기` / `찜 해제` · `채팅 시작` · `안전결제 시작` · `정렬 변경` ·
`상품 더보기` · `스크롤 깊이` · `퀵메뉴 클릭` · `마이페이지 메뉴 클릭`

---

## 4. 구조

```
.
├── index.html            홈
├── category.html         카테고리 목록
├── product.html          상품 상세
├── search.html           검색
├── mypage.html           마이페이지
└── assets/
    ├── css/style.css     스타일 (모바일 커머스 레이아웃)
    └── js/
        ├── amplitude.js  ★ Amplitude 초기화 — 연동 코드는 전부 여기
        ├── data.js       더미 상품 데이터
        ├── app.js        렌더링 · 인터랙션 · 커스텀 이벤트
        └── debug-panel.js 시연용 이벤트 로그 패널 (트래킹에는 불필요)
```

빌드 도구·의존성이 없는 정적 사이트입니다.

```bash
python3 -m http.server 8080
# http://127.0.0.1:8080
```

---

## 5. 참고

- API Key `c9d6c776f682045c5a2456782659cb49` 는 브라우저 SDK 용 **write-only 공개 키**라
  클라이언트에 노출되는 것이 정상입니다. 서버 API 키·시크릿은 이 저장소에 없습니다.
- 상품 썸네일은 외부 이미지 CDN 대신 상품명 해시로 만든 그라디언트를 사용합니다.
  네트워크 상태와 무관하게 항상 같은 화면이 그려져 **Zoning Insights 스크린샷과
  실제 화면이 어긋나지 않습니다.**
- `debug-panel.js` 는 시연용입니다. 실제 서비스에 이 패턴을 옮길 때는 제거하고,
  `logLevel` 도 `Verbose(3)` 대신 `Warn(2)` 로 낮추세요.

### 문서

- [Zoning Insights](https://amplitude.com/docs/zoning-insights)
- [Zoning Insights — Instrumentation](https://amplitude.com/docs/zoning-insights/instrumentation)
- [Web Autocapture 이벤트 스키마](https://amplitude.com/docs/data/web-autocapture-schema)
