// @ts-check
/**
 * Amplitude Web SDK — 방안2(User ID 가명화 전송) 검증
 *
 * 테스트 계획서 §4 의 V1 ~ V4 를 단일 persistent context 에서 순차 검증한다.
 * Phase 간 쿠키/localStorage 승계가 검증 대상이므로 context 를 재생성하면 안 된다.
 *
 * 실행:
 *   AMP_API_KEY_1=... AMP_API_KEY_2=... AMP_SERVER_ZONE=US npx playwright test
 */
const { test, expect, chromium } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/* ── 테스트 상수 (페이지의 common.js 와 동일해야 한다) ─────────── */
const RAW_USER_ID = "user-raw-20260808@test.com";
const BASE = "http://localhost:8080";

const API_KEY_1 = process.env.AMP_API_KEY_1 || "";
const API_KEY_2 = process.env.AMP_API_KEY_2 || "";
const SERVER_ZONE = (process.env.AMP_SERVER_ZONE || "US").toUpperCase();

/** 페이지의 pseudonymize() 와 동일한 dummy 알고리즘을 Node 측에서 재계산. */
function expectedPseudoId(raw) {
  return "pseudo_" + crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
}

/** Amplitude Browser SDK 2 identity 쿠키 이름 규칙. */
function ampCookieName(apiKey, suffix = "") {
  return ["AMP", suffix, String(apiKey).slice(0, 10)].filter(Boolean).join("_");
}

function qs(extra = {}) {
  const p = new URLSearchParams({ key1: API_KEY_1, key2: API_KEY_2, zone: SERVER_ZONE, ...extra });
  return "?" + p.toString();
}

test("방안2 — 원문 차단 및 가명 ID 기반 맥락 유지 검증 (V1~V4)", async () => {
  test.skip(!API_KEY_1 || !API_KEY_2, "AMP_API_KEY_1 / AMP_API_KEY_2 환경변수가 필요합니다.");

  const results = [];
  const record = (id, title, pass, detail) => {
    results.push({ id, title, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${title}\n      ${detail}`);
  };

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amp-deid-profile-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
  });

  /* ── /2/httpapi 요청 수집 ─────────────────────────────────── */
  const captured = [];
  context.on("request", (req) => {
    if (!req.url().includes("/2/httpapi")) return;
    let body = req.postData();
    let json = null;
    try { json = JSON.parse(body); } catch { /* keep raw */ }
    captured.push({ url: req.url(), raw: body, json });
  });
  context.on("response", async (res) => {
    if (res.url().includes("/2/httpapi")) {
      const hit = captured.find((c) => c.url === res.url() && c.status === undefined);
      if (hit) hit.status = res.status();
    }
  });

  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("  [browser error] " + m.text()); });

  /** 새 /2/httpapi 요청이 잡힐 때까지 대기 */
  async function waitForNew(fromIdx, label) {
    await expect
      .poll(() => captured.length, { timeout: 20_000, message: `${label}: /2/httpapi 요청이 관측되지 않음` })
      .toBeGreaterThan(fromIdx);
    await page.waitForTimeout(800); // 뒤따르는 배치가 있으면 함께 수집
    return captured.slice(fromIdx);
  }

  /** 페이지 스크립트 완료 대기 (성공/실패 모두 data-test-state 로 표기) */
  async function waitForPage(label) {
    await page.waitForSelector("body[data-test-state]", { timeout: 30_000 });
    const state = await page.evaluate(() => window.__DEID_TEST__);
    if (state && state.error) throw new Error(`${label} 페이지 실행 실패: ${state.error}`);
    return state;
  }

  const allUserIds = (reqs) => reqs.flatMap((r) => (r.json?.events || []).map((e) => e.user_id));
  const allDeviceIds = (reqs) => reqs.flatMap((r) => (r.json?.events || []).map((e) => e.device_id));
  const allEventTypes = (reqs) => reqs.flatMap((r) => (r.json?.events || []).map((e) => e.event_type));

  /* ── STEP 1. Phase 1 (구버전) ─────────────────────────────── */
  let idx = captured.length;
  await page.goto(`${BASE}/phase1.html${qs()}`);
  const p1State = await waitForPage("Phase 1");
  const p1Reqs = await waitForNew(idx, "Phase 1");

  const p1UserIds = allUserIds(p1Reqs);
  const p1DeviceIds = allDeviceIds(p1Reqs);

  record(
    "V1", "구버전에서 원문 User ID 가 그대로 전송되는지",
    p1UserIds.length > 0 && p1UserIds.every((u) => u === RAW_USER_ID),
    `events[].user_id = ${JSON.stringify(p1UserIds)} / 기대 = "${RAW_USER_ID}"`
  );

  const phase1DeviceId = p1DeviceIds[0] || p1State.deviceId;

  /* ── STEP 2. Phase 2 1회차 (분기 A) ───────────────────────── */
  idx = captured.length;
  await page.goto(`${BASE}/phase2.html${qs()}`);
  const p2State = await waitForPage("Phase 2 (1회차)");
  const p2Reqs = await waitForNew(idx, "Phase 2 (1회차)");

  const p2UserIds = allUserIds(p2Reqs);
  const p2DeviceIds = allDeviceIds(p2Reqs);
  const p2Payload = p2Reqs.map((r) => r.raw).join("\n");
  const expectedPseudo = expectedPseudoId(RAW_USER_ID);

  record(
    "V2-a", "구 캐시 원문이 신규 프로젝트로 승계되지 않는지 (payload 전문 grep)",
    p2Payload.length > 0 && !p2Payload.includes(RAW_USER_ID),
    `payload ${p2Payload.length}B 중 "${RAW_USER_ID}" 출현 = ${p2Payload.includes(RAW_USER_ID)}`
  );

  record(
    "V2-b", "device_id 가 재생성되는지 (Phase 1 ≠ Phase 2)",
    Boolean(phase1DeviceId) && Boolean(p2DeviceIds[0]) && phase1DeviceId !== p2DeviceIds[0],
    `phase1.device_id = ${phase1DeviceId} / phase2.device_id = ${p2DeviceIds[0]}`
  );

  const cookies = await context.cookies(BASE);
  const cookieNames = cookies.map((c) => c.name);
  const c1 = ampCookieName(API_KEY_1);
  const c2 = ampCookieName(API_KEY_2);
  record(
    "V2-c", "구 쿠키가 삭제가 아니라 '미참조 격리' 되는지 (두 쿠키 동시 존재)",
    cookieNames.includes(c1) && cookieNames.includes(c2),
    `${c1} 존재 = ${cookieNames.includes(c1)}, ${c2} 존재 = ${cookieNames.includes(c2)} / 전체 = ${JSON.stringify(cookieNames)}`
  );

  record(
    "V3", "자체 캐싱 원문 → 가명화 값으로 전송되는지",
    p2State.branch === "A" &&
      p2UserIds.length > 0 &&
      p2UserIds.every((u) => u === expectedPseudo && String(u).startsWith("pseudo_")),
    `branch = ${p2State.branch} / events[].user_id = ${JSON.stringify(p2UserIds)} / 기대 = "${expectedPseudo}"`
  );

  /* ── STEP 3. Phase 2 2회차 (분기 B, reload) ───────────────── */
  idx = captured.length;
  await page.reload();
  const p2bState = await waitForPage("Phase 2 (2회차)");
  const p2bReqs = await waitForNew(idx, "Phase 2 (2회차)");
  const p2bUserIds = allUserIds(p2bReqs);
  const p2bPayload = p2bReqs.map((r) => r.raw).join("\n");

  record(
    "V4", "2회차(setUserId 미호출)에도 가명 ID 가 쿠키에서 유지되는지",
    p2bState.branch === "B" &&
      p2bUserIds.length > 0 &&
      p2bUserIds.every((u) => u === expectedPseudo) &&
      !p2bPayload.includes(RAW_USER_ID),
    `branch = ${p2bState.branch} / events[].user_id = ${JSON.stringify(p2bUserIds)} / 원문 출현 = ${p2bPayload.includes(RAW_USER_ID)}`
  );

  /* ── 리포트 작성 ──────────────────────────────────────────── */
  const excerpt = (reqs, label) => {
    const events = reqs.flatMap((r) => r.json?.events || []);
    return [
      `**${label}** — 요청 ${reqs.length}건, 응답 status ${JSON.stringify(reqs.map((r) => r.status ?? "?"))}`,
      "",
      "```json",
      JSON.stringify(
        events.map((e) => ({
          event_type: e.event_type,
          user_id: e.user_id,
          device_id: e.device_id,
          session_id: e.session_id,
        })),
        null,
        2
      ),
      "```",
      "",
    ].join("\n");
  };

  const passed = results.filter((r) => r.pass).length;
  const md = [
    "# Amplitude 방안2 검증 결과 (자동 테스트)",
    "",
    `- 실행 환경: Playwright / Chromium (persistent context, 동일 프로필·동일 origin \`${BASE}\`)`,
    `- SDK: @amplitude/analytics-browser 2.45.5 (UMD, jsDelivr)`,
    `- Data Center: ${SERVER_ZONE}`,
    `- 원문 User ID: \`${RAW_USER_ID}\``,
    `- 가명화(dummy): \`"pseudo_" + sha256(raw).hex.slice(0,16)\` → \`${expectedPseudo}\``,
    `- identity 쿠키: Phase 1 \`${c1}\` / Phase 2 \`${c2}\``,
    "",
    "## 검증 항목별 결과",
    "",
    `| ID | 검증 항목 | 결과 | 실측 |`,
    `|---|---|---|---|`,
    ...results.map((r) => `| ${r.id} | ${r.title} | ${r.pass ? "✅ PASS" : "❌ FAIL"} | ${r.detail.replace(/\|/g, "\\|")} |`),
    "",
    `**종합: ${passed}/${results.length} PASS**`,
    "",
    "## 요청 payload 발췌",
    "",
    excerpt(p1Reqs, "Phase 1 (구버전, API_KEY_1)"),
    excerpt(p2Reqs, "Phase 2 1회차 — 분기 A (방안2 가명화, API_KEY_2)"),
    excerpt(p2bReqs, "Phase 2 2회차 — 분기 B (setUserId 미호출, API_KEY_2)"),
    "## 쿠키 상태 (Phase 2 실행 후)",
    "",
    "```json",
    JSON.stringify(cookies.map((c) => ({ name: c.name, domain: c.domain })), null, 2),
    "```",
    "",
    "## 한계 및 유의사항",
    "",
    "- 가명화는 dummy(SHA-256) 구현이며, 실제 운영에서는 고객사 서버 API 호출로 대체된다.",
    "- V2-b 가 보여주듯 **Web 은 API Key 교체 시 `device_id` 가 재생성**되어 과거 데이터와의 device 기반 연결이 끊어진다. 생애주기 맥락 유지는 **가명 `user_id` 에만** 의존한다.",
    "- V5(Amplitude 서버 수신 확인)는 자동화 대상이 아니며, Amplitude UI 의 User Lookup 으로 수동 확인이 필요하다. (테스트 계획서 §6)",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(__dirname, "..", "test-results.md"), md, "utf8");
  console.log("\n→ test-results.md 작성 완료");

  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });

  const failed = results.filter((r) => !r.pass);
  expect(failed.map((f) => `${f.id}: ${f.detail}`), "실패한 검증 항목").toEqual([]);
});
