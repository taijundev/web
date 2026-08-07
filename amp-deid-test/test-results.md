# Amplitude 방안2 검증 결과 (자동 테스트)

- 실행 환경: Playwright / Chromium (persistent context, 동일 프로필·동일 origin `http://localhost:8080`)
- SDK: @amplitude/analytics-browser 2.45.5 (UMD, jsDelivr)
- Data Center: US
- 원문 User ID: `user-raw-20260808@test.com`
- 가명화(dummy): `"pseudo_" + sha256(raw).hex.slice(0,16)` → `pseudo_2432955540152198`
- identity 쿠키: Phase 1 `AMP_479e3bd140` / Phase 2 `AMP_d17b62c9c6`

## 검증 항목별 결과

| ID | 검증 항목 | 결과 | 실측 |
|---|---|---|---|
| V1 | 구버전에서 원문 User ID 가 그대로 전송되는지 | ✅ PASS | events[].user_id = ["user-raw-20260808@test.com"] / 기대 = "user-raw-20260808@test.com" |
| V2-a | 구 캐시 원문이 신규 프로젝트로 승계되지 않는지 (payload 전문 grep) | ✅ PASS | payload 580B 중 "user-raw-20260808@test.com" 출현 = false |
| V2-b | device_id 가 재생성되는지 (Phase 1 ≠ Phase 2) | ✅ PASS | phase1.device_id = 679c5506-2060-4430-839f-4eb3ae3984b7 / phase2.device_id = 5aff60e1-29b9-468b-9641-49f17662035d |
| V2-c | 구 쿠키가 삭제가 아니라 '미참조 격리' 되는지 (두 쿠키 동시 존재) | ✅ PASS | AMP_479e3bd140 존재 = true, AMP_d17b62c9c6 존재 = true / 전체 = ["AMP_479e3bd140","AMP_d17b62c9c6"] |
| V3 | 자체 캐싱 원문 → 가명화 값으로 전송되는지 | ✅ PASS | branch = A / events[].user_id = ["pseudo_2432955540152198"] / 기대 = "pseudo_2432955540152198" |
| V4 | 2회차(setUserId 미호출)에도 가명 ID 가 쿠키에서 유지되는지 | ✅ PASS | branch = B / events[].user_id = ["pseudo_2432955540152198"] / 원문 출현 = false |

**종합: 6/6 PASS**

## 요청 payload 발췌

**Phase 1 (구버전, API_KEY_1)** — 요청 1건, 응답 status [200]

```json
[
  {
    "event_type": "phase1_test_event",
    "user_id": "user-raw-20260808@test.com",
    "device_id": "679c5506-2060-4430-839f-4eb3ae3984b7",
    "session_id": 1786118980459
  }
]
```

**Phase 2 1회차 — 분기 A (방안2 가명화, API_KEY_2)** — 요청 1건, 응답 status [200]

```json
[
  {
    "event_type": "phase2_test_event",
    "user_id": "pseudo_2432955540152198",
    "device_id": "5aff60e1-29b9-468b-9641-49f17662035d",
    "session_id": 1786118982315
  }
]
```

**Phase 2 2회차 — 분기 B (setUserId 미호출, API_KEY_2)** — 요청 1건, 응답 status [200]

```json
[
  {
    "event_type": "phase2_test_event",
    "user_id": "pseudo_2432955540152198",
    "device_id": "5aff60e1-29b9-468b-9641-49f17662035d",
    "session_id": 1786118982315
  }
]
```

## 쿠키 상태 (Phase 2 실행 후)

```json
[
  {
    "name": "AMP_479e3bd140",
    "domain": "localhost"
  },
  {
    "name": "AMP_d17b62c9c6",
    "domain": "localhost"
  }
]
```

## 한계 및 유의사항

- 가명화는 dummy(SHA-256) 구현이며, 실제 운영에서는 고객사 서버 API 호출로 대체된다.
- V2-b 가 보여주듯 **Web 은 API Key 교체 시 `device_id` 가 재생성**되어 과거 데이터와의 device 기반 연결이 끊어진다. 생애주기 맥락 유지는 **가명 `user_id` 에만** 의존한다.
- V5(Amplitude 서버 수신 확인)는 자동화 대상이 아니며, Amplitude UI 의 User Lookup 으로 수동 확인이 필요하다. (테스트 계획서 §6)
