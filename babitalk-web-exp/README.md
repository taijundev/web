# Amplitude Web Experiment 테스트 페이지

바비톡 홈 레이아웃(`babitalk_web_screeenshot.png`)을 참고해 직접 작성한 정적 페이지에
Amplitude Web Experiment 를 **Custom Integration** 방식으로 붙인 테스트 하네스.

`user_id` / `device_id` 를 팝업으로 받아 `getUser()` 가 반환하게 하고, ID 가 확정된
뒤에 Experiment SDK 를 초기화한다.

## 실행

```bash
./serve.sh          # http://localhost:4173
./serve.sh 8080     # 포트 지정
```

`file://` 대신 http 로 서빙한다. localStorage 동작이 일정하고, Web Experiment
비주얼 에디터도 http 에서만 붙는다.

### 배포된 주소

GitHub Pages 로 공개되어 있다 (`taijundev/web` 레포, `main` 브랜치 루트 서빙).

**https://taijundev.github.io/web/babitalk-web-exp/**

에셋 경로가 모두 상대경로라 서브디렉터리에서 그대로 동작한다. Amplitude 에서
Web Experiment 를 만들 때 타겟 URL 로 이 주소를 쓰면 로컬 서버 없이 테스트할 수 있다.

## 설정

`index.html` 상단 `window.EXP_CONFIG` 한 곳에 모여 있다.

| 키 | 기본값 | 설명 |
|---|---|---|
| `apiKey` | (설정됨) | Amplitude **프로젝트 API Key** |
| `dataCenter` | `'us'` | `'us'` → `cdn.amplitude.com` / `'eu'` → `cdn.eu.amplitude.com` |
| `storageKey` | `'ampExpTest.identity'` | ID 저장 localStorage 키 |
| `maskUntilReady` | `true` | variant 적용까지 페이지 마스킹(안티 플리커) |
| `maskGraceMs` | `250` | 스크립트 onload 후 variant 적용 대기 |
| `maskTimeoutMs` | `3000` | 마스크 강제 해제 안전장치 |
| `debugPanel` | `true` | 우측 하단 디버그 패널 |

### 어떤 키인가 — Project API Key

문서는 *"Replace API_KEY with your **project's API key**"* 라고 명시한다.
**Experiment 의 Deployment Key 가 아니다.**

| 키 | 위치 | 접두어 | 쓰는 곳 |
|---|---|---|---|
| **Project API Key** ← 이것 | Settings → Projects → [프로젝트] → General<br>(Data → Sources 에서 보이는 값과 동일) | 없음 (32자 hex) | **Web Experiment**, Browser SDK, HTTP V2 API |
| Deployment Key (client) | Experiment → Deployments | `client-` | `Experiment.initialize()` — Experiment JS SDK |
| Deployment Key (server) | Experiment → Deployments | `server-` | 서버 SDK |
| Management API Key | Experiment → Management API | — | 플래그/실험 관리 API |

- **HTTP V2 API 의 `api_key` 와 같은 값이다.** 프로젝트당 API Key 는 하나뿐이다
  (*"Each API Key is associated with a single project"*). Data → Sources 는 새 키를
  발급하는 게 아니라 프로젝트 API Key 를 보여준다.
- Web Experiment 가 별도 Deployment Key 를 요구하지 않는 이유:
  *"Each project has a **default deployment using the project API key as the
  deployment key**"* — 기본 deployment 가 project API key 를 deployment key 로 쓴다.
- `client-` 로 시작하는 키를 넣으면 스크립트 로드가 실패한다.

출처: [Keys and Tokens](https://amplitude.com/docs/apis/keys-and-tokens),
[Experiment data model](https://amplitude.com/docs/feature-experiment/data-model)

## 구조

```
index.html                        페이지 마크업 + EXP_CONFIG + 플러그인 스크립트
assets/experiment-integration.js  ★ Custom Integration 구현 (핵심)
assets/styles.css                 스타일 + 모달 + 안티 플리커 마스크
assets/app.js                     캐러셀·더보기·검색칩 (실험과 무관)
test/integration-test.mjs         CDP 통합 테스트
serve.sh
```

## Custom Integration 구현

[문서](https://amplitude.com/docs/web-experiment/implementation#custom-integrations) 의
`IntegrationPlugin` 인터페이스를 구현한다.

```js
window.experimentIntegration = {
  setup:   () => Promise<void>,   // getUser() 가 준비되면 resolve
  getUser: () => ({ user_id, device_id }),
  track:   (event) => true,       // 요구사항에 따라 비워둠
};
```

### 왜 Web Experiment 스크립트 태그가 index.html 에 없는가

**정적 `<script>` 태그를 쓰지 않고 `experiment-integration.js` 가 ID 확정 후에
직접 주입한다.** 문서의 async 안티 플리커 스니펫과 같은 방식이다.

이유는 배포 번들(`IntegrationManager`)을 직접 확인한 결과다.

```js
// 좋은 소식: setup() 을 실제로 await 하고, 내부 타임아웃이 없다.
setIntegration(e) {
  this.integration = e;
  e.setup ? e.setup(config, client).then(onDone, onDone)  // ← isReady 해제
          : (queue.setTracker(...), resolve())
}
ready() { return this.integration ? this.isReady : Promise.resolve() }
track(e, t) { if (cache.shouldTrack(e,t)) this.queue.push(...) }  // ← 큐잉
```

- `setup()` 에 **타임아웃이 없다.** 사람이 팝업을 30초 붙들고 있어도 안전하다.
  (`bt` 인테그레이션의 1초 타임아웃은 기본 Amplitude Analytics 연동 전용이다.)
- `setup()` 이 reject 되어도 `onDone` 이 같이 걸려 있어 진행을 막지 않는다.
- `track()` 은 항상 큐에 쌓이고 `setup()` resolve 시점에 flush 된다 → 이벤트 유실 없음.

**그런데 `ready()` 를 기다리는 경로가 전부가 아니다:**

| 경로 | `setup()` 대기 |
|---|---|
| 원격 플래그 fetch (`doFetch` / `doFlags`) | ✅ `addContextOrWait()` → `ready()` |
| **로컬 플래그 평가 (`evaluate`) → `applyVariants()`** | ❌ `addContext()` — 대기하지 않음 |
| `start()` 전체 | `initialFlags` 에 `holdout-` / `mutex-` 접두 키가 있을 때만 |

정적 태그로 두면 팝업이 열려 있는 동안 `applyVariants()` 가 진행돼 **로컬 평가
실험이 `user_id`/`device_id` 없이 버킷팅될 수 있다.** 스크립트 자체를 ID 확정 후에
로드하면 모든 평가 경로에서 순서가 구조적으로 보장된다.

`setup()` 도 문서 명세대로 구현해 두었다 — 이 구조에서는 호출 시점에 이미 ID 가
있으므로 즉시 resolve 된다. 정적 태그 방식으로 되돌려도 동작한다.

### 실제 동작 순서

```
<head> 파싱
  ├─ EXP_CONFIG
  └─ experiment-integration.js (동기)
       ├─ window.experimentIntegration 등록
       ├─ 마스크 적용 (첫 페인트 전)
       └─ ensureIdentity()
            ├─ localStorage 에 ID 있음 → 즉시 확정
            └─ 없음 → 모달 표시 → 사용자 입력 → 제출 → localStorage 저장
                 │
                 ▼
            Web Experiment 스크립트 주입 (async)
                 ├─ setup() 호출 → 즉시 resolve
                 ├─ getUser() 호출 → { user_id, device_id }
                 ├─ addContext() 로 병합 → variant 평가·적용
                 └─ onload → maskGraceMs 후 마스크 해제
```

### 최초 1회만 묻기

ID 는 `localStorage["ampExpTest.identity"]` 에 저장된다. 값이 있으면 팝업을 띄우지
않는다. 다시 입력받으려면 디버그 패널의 **ID 초기화 후 새로고침** 또는 콘솔에서:

```js
__expTest.reset()
```

### `track()` — 비워둠

요구사항대로 전송 코드를 넣지 않았다. 실제 연동 시:

```js
track: (event) => {
  analytics.track(event.eventType, event.eventProperties);
  return true;
}
```

**`return true` 를 유지할 것.** 문서상 `false` 를 반환하면 Amplitude 가 이벤트를
보관해 두고 일정 간격으로 재시도한다. 보낼 곳이 없는 상태에서 `false` 를 반환하면
재시도가 끝없이 쌓인다.

## 안티 플리커

- **최초 방문**: `<head>` 파싱 시점에 본문을 `visibility: hidden` 으로 가린다.
  모달만 예외로 보인다. ID 입력 → 스크립트 주입 → `onload` → `maskGraceMs`(250ms)
  후 해제.
- **재방문**: ID 가 동기적으로 확정되므로 microtask 안에 스크립트가 주입된다.
  정적 태그와 거의 같은 타이밍이고, 마스크도 곧바로 해제된다.
- `maskUntilReady: false` 로 두면 마스킹하지 않는다. 대조군 → variant 전환 과정을
  눈으로 보고 싶을 때 유용하다.
- JS 가 죽어도 페이지가 영구히 숨겨지지 않도록 20초 failsafe 가 있다.

## 디버그 패널

우측 하단. `EXP_CONFIG.debugPanel: false` 로 끈다.

| 항목 | 의미 |
|---|---|
| `script` | Web Experiment 스크립트 상태 (대기/로딩 중/로드됨/로드 실패/apiKey 미설정) |
| `user_id` / `device_id` | `getUser()` 가 반환할 값 |
| `출처` | `localStorage` 또는 `팝업 입력` |
| `setup()` | 호출 횟수 · resolve 시점 |
| `getUser()` | **Amplitude 가 실제로 호출했는지** |
| `track()` | 호출 횟수 · 마지막 `eventType` |

`getUser()` / `track()` 카운터가 핵심 관찰 포인트다.

콘솔에서 직접 확인하려면:

```js
__expTest.state                                           // 내부 상태
webExperiment.getExperimentClient().all()                 // 받은 플래그
const c = webExperiment.getExperimentClient()
c.addContext(c.getUser())                                 // 평가에 쓰이는 실제 유저 객체
```

## 실험 대상으로 쓸 요소

비주얼 에디터로 잡기 쉽게 id 를 붙여뒀다.

| 선택자 | 요소 |
|---|---|
| `#btn-signin` `[data-exp-target="signin"]` | 로그인 CTA |
| `#hero` `#hero-track` | 히어로 배너 |
| `#search-input` | 검색창 (placeholder) |
| `#keywords .chip` | 인기 검색어 칩 |
| `#cat-surgery` `#cat-procedure` | 카테고리 2열 |
| `#popular-events` `#event-cards` `.card` | 인기 이벤트 카드 |
| `.card[data-event-id="N"]` | 개별 카드 |

## 테스트

Chrome 을 CDP 포트로 띄운 뒤 실행한다. 의존성 설치 없이 Node 내장 WebSocket 만 쓴다.

```bash
./serve.sh &                     # :4173

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 \
  --user-data-dir=/tmp/exp-chrome about:blank &

node test/integration-test.mjs
```

**29/29 통과** (실제 Amplitude 스크립트 대상). 검증 범위:

- 마스크 적용/해제, 팝업 표시·입력 검증·UUID 생성
- ID 확정 전에는 스크립트를 주입하지 않음 → `getUser()` 미호출
- 스크립트 로드(HTTP 200), Amplitude 가 `setup()`·`getUser()` 를 실제로 호출
- 인테그레이션이 플러그인으로 채택됨 (`type === 'integration'`)
- `localStorage` 저장, 재방문 시 팝업 미표시, `track()` 반환값
- 캐러셀·더보기·검색칩, 가로 스크롤 없음

`user_id`/`device_id` 가 평가 컨텍스트까지 도달하는 것도 확인했다:

```
addContext(client.getUser()) →
  { …, user_id: "test-user-001", device_id: "device-abc-123",
    web_exp_id_v2: "72359ea1-…", first_seen: "…" }
```

`experimentClient.getUser()` 자체에는 우리 ID 가 없다(스크립트가 자체 생성한
`web_exp_id_v2` 유저다). `addContext()` 가 `integrationManager.getUser()` = 우리
`getUser()` 를 병합해 넣고, `evaluate()` 는 이 병합 결과를 쓴다.

## 알아둘 것

- **이 프로젝트에 아직 실험이 없다.** `webExperiment.getExperimentClient().all()` 이
  `{}` 를 반환한다. variant 가 실제로 적용되는지 보려면 Amplitude 에서 Web
  Experiment 를 만들고 타겟 URL 에 `http://localhost:4173/` 를 넣어야 한다.
- 이미지는 전부 CSS 로 만든 플레이스홀더다. 바비톡의 실제 사진·배너를 쓰지 않았고,
  레이아웃·타이포·색만 스크린샷을 따랐다.
- 외부 CDN 의존이 없다(Amplitude 스크립트 제외). 폰트는 Pretendard 가 설치돼 있으면
  쓰고, 없으면 시스템 한글 폰트로 폴백한다.
- 위 번들 분석은 `experiment-js-client/1.21.3` 기준이다. Amplitude 가 스크립트를
  갱신하면 `ready()` 대기 경로가 달라질 수 있다. 다만 이 구현은 스크립트 로드
  자체를 미루므로 그 변화에 영향받지 않는다.
- 실제 서비스가 아니라는 문구를 푸터에 넣어뒀다.
