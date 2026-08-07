# Amplitude Web SDK — 방안2(User ID 가명화 전송) 검증 테스트

Amplitude Browser SDK 2 에서 **API Key 교체 + 자체 캐싱 원문의 가명화**로
① User ID 원문의 Amplitude 전송 차단, ② 가명 식별값 기반 생애주기 분석 맥락 유지
두 목적이 실현되는지 검증하는 테스트 하니스.

## 구성

| 파일 | 역할 |
|---|---|
| `phase1.html` | 구버전 시뮬레이션 — `API_KEY_1` + `setUserId(원문)` + 웹 자체 localStorage 에 원문 캐싱 |
| `phase2.html` | 신규 버전 + 방안2 — `API_KEY_2` + (자체 캐싱 원문 → dummy 가명화 → `userId`) |
| `common.js` / `common.css` | 두 페이지 공용 상수·가명화·SDK 로딩·상태 표시 |
| `config.example.js` | API Key 템플릿. `config.js` 로 복사해 사용하며 `config.js` 는 **gitignore** 대상 |
| `tests/verify.spec.js` | Playwright 자동 검증 (V1~V4) |
| `test-results.md` | 자동 검증 결과 리포트 (스크립트가 생성) |

### 테스트 상수

```js
const RAW_USER_ID       = "user-raw-20260808@test.com";
const APP_USER_ID_KEY   = "app_user_id";
const FIRST_RUN_FLAG_KEY = "v2_first_run_done";
```

가명화는 dummy 구현이다 — `"pseudo_" + sha256(raw).hex.slice(0, 16)`.
실제 운영에서는 이 자리에 고객사 서버 API 호출이 들어간다.

## 실행

### 1. 자동 검증 (Playwright)

```bash
npm install
npx playwright install chromium

AMP_API_KEY_1=<De-identification Test 1 key> \
AMP_API_KEY_2=<De-identification Test 2 key> \
AMP_SERVER_ZONE=US \
npx playwright test
```

정적 서버(`http-server`)는 Playwright 가 자동으로 띄운다.
검증이 끝나면 `test-results.md` 가 갱신된다.

> Phase 간 쿠키·localStorage 승계가 검증 대상이므로 spec 은 **단일
> `launchPersistentContext`** 안에서 phase1 → phase2 → reload 를 순차 실행한다.
> Phase 마다 새 context 를 만들면 검증이 무의미해진다.

### 2. 수동 확인 (브라우저)

```bash
cp config.example.js config.js   # 실제 API Key 입력
npm run serve
```

`http://localhost:8080/phase1.html` → `http://localhost:8080/phase2.html`
순서로 **동일 브라우저 프로필**에서 방문한다.
(`config.js` 없이 `phase1.html?key1=...&key2=...&zone=US` 처럼 query parameter 로 주입해도 된다.)

DevTools → Network 에서 `httpapi` 필터로 `events[].user_id` / `device_id` 를,
Application → Cookies 에서 `AMP_*` 쿠키 2개를 육안 확인한다.
Phase 2 페이지 하단의 "테스트 상태 초기화" 링크로 최초 실행 플래그를 지워 분기 A 를 다시 재현할 수 있다.

## 검증 항목

| ID | 검증 항목 | PASS 조건 |
|---|---|---|
| V1 | 구버전에서 원문 전송 확인 | Phase 1 요청의 `events[].user_id === RAW_USER_ID` |
| V2-a | 구 캐시 원문 미승계 | Phase 2 요청 payload 전문에 원문 문자열 미출현 |
| V2-b | device_id 재생성 | `phase2.device_id !== phase1.device_id` |
| V2-c | 스토리지 격리 방식 실증 | `AMP_{KEY1[:10]}` 와 `AMP_{KEY2[:10]}` 쿠키가 **동시 존재** |
| V3 | 자체 캐싱 원문 → 가명화 전송 | Phase 2 1회차 `user_id === pseudonymize(RAW_USER_ID)` |
| V4 | 2회차 로드 시 가명 ID 유지 | 분기 B 에서도 동일한 가명 `user_id` |
| V5 | 서버 수신 확인 | **수동** — Amplitude UI User Lookup (아래) |

### V5 (수동)

- `De-identification Test 1` → User Lookup 에서 `user-raw-20260808@test.com` 검색 → `phase1_test_event` 수신 확인
- `De-identification Test 2` → User Lookup 에서 `pseudo_...` 검색 → `phase2_test_event` 수신 확인
- Test 2 프로젝트에서 **원문 ID 로는 검색되지 않아야 하며**, User Properties 를 포함해 이벤트 스트림 어디에도 원문이 없어야 한다

## 배경

- Browser SDK 2 는 초기화 시 `AMP_{API Key 앞 10자}` 이름의 쿠키에 `deviceId` / `userId`(base64) / `sessionId` 를 저장한다.
  SDK 번들 기준 이름 규칙: `["AMP", suffix, apiKey.slice(0, 10)].filter(Boolean).join("_")`.
- 따라서 **API Key 를 교체하면 쿠키 이름이 달라지고, 신규 SDK 는 구 Key 의 쿠키를 읽지 않는다.**
  구 쿠키가 삭제되는 것이 아니라 **참조되지 않을 뿐**이며, 이것이 "API Key 교체 = 자동 스토리지 격리"의 근거다.
- 부수 효과로 신규 쿠키에는 새 `deviceId`(UUID)가 생성된다 → **Web 은 과거 데이터와 device 기반 연결이 끊어진다.**
  생애주기 맥락 유지는 전적으로 가명 `user_id` 에 의존한다.

## 참고

- [Browser SDK 2](https://amplitude.com/docs/sdks/analytics/browser/browser-sdk-2)
- [Cookies and consent management](https://amplitude.com/docs/sdks/analytics/browser/cookies-and-consent-management)
- [HTTP V2 API](https://amplitude.com/docs/apis/analytics/http-v2)
