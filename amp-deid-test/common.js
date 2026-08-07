/**
 * Amplitude Web SDK — 방안2(User ID 가명화 전송) 검증 테스트
 * phase1.html / phase2.html 공용 모듈
 */

/* ── 테스트 상수 (테스트 계획서 §1) ───────────────────────────── */
export const RAW_USER_ID = "user-raw-20260808@test.com"; // 원문 User ID (검증 시 grep 대상)
export const APP_USER_ID_KEY = "app_user_id"; // 웹 페이지 자체 localStorage 키
export const FIRST_RUN_FLAG_KEY = "v2_first_run_done"; // 신규 버전 최초 실행 플래그

/* ── 설정 주입 ────────────────────────────────────────────────
 * 우선순위: URL query parameter > config.js(window.AMP_TEST_CONFIG)
 * 실제 API Key 는 리포지토리에 commit 하지 않는다.
 */
export function getConfig() {
  const q = new URLSearchParams(location.search);
  const file = window.AMP_TEST_CONFIG || {};
  return {
    apiKey1: q.get("key1") || file.apiKey1 || "",
    apiKey2: q.get("key2") || file.apiKey2 || "",
    serverZone: (q.get("zone") || file.serverZone || "US").toUpperCase(),
  };
}

/** Amplitude Browser SDK 2 의 identity 쿠키 이름 규칙.
 *  SDK 번들 기준: ["AMP", suffix, apiKey.slice(0, 10)].filter(Boolean).join("_")
 */
export function ampCookieName(apiKey, suffix = "") {
  return ["AMP", suffix, String(apiKey).slice(0, 10)].filter(Boolean).join("_");
}

/** 가명화 dummy 구현.
 *  실제 운영에서는 고객사 서버 API 를 호출한다. 테스트에서는 결정적(deterministic)
 *  SHA-256 앞 16 hex 로 대체해 Playwright 가 기대값을 재계산할 수 있게 한다.
 */
export async function pseudonymize(raw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return "pseudo_" + hex.slice(0, 16);
}

/* ── SDK 로딩 ─────────────────────────────────────────────────
 * UMD 번들을 버전 고정해 로드한다(재현성). window.amplitude 로 노출된다.
 */
const SDK_URL =
  "https://cdn.jsdelivr.net/npm/@amplitude/analytics-browser@2.45.5/lib/scripts/amplitude-min.umd.js";

export function loadAmplitude() {
  return new Promise((resolve, reject) => {
    if (window.amplitude) return resolve(window.amplitude);
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.onload = () => (window.amplitude ? resolve(window.amplitude) : reject(new Error("amplitude global missing")));
    s.onerror = () => reject(new Error("failed to load Amplitude SDK from " + SDK_URL));
    document.head.appendChild(s);
  });
}

/** 모든 페이지 공통 init 옵션.
 *  - autocapture: false  → 노이즈(page view / session / element click) 제거
 *  - flushIntervalMillis: 100 → 배칭 지연을 없애 Playwright 가 요청을 곧바로 관측
 */
export function initOptions(serverZone, extra = {}) {
  return {
    autocapture: false,
    flushIntervalMillis: 100,
    flushQueueSize: 1,
    serverZone: serverZone === "EU" ? "EU" : "US",
    logLevel: 3, // Verbose
    ...extra,
  };
}

/* ── 화면 표시 ────────────────────────────────────────────────── */

export function ampCookies() {
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c.startsWith("AMP"))
    .map((c) => c.split("=")[0]);
}

export function renderStatus(rows) {
  const tbody = document.querySelector("#status tbody");
  tbody.innerHTML = "";
  for (const [k, v] of rows) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = k;
    const td = document.createElement("td");
    if (v instanceof Node) td.appendChild(v);
    else td.textContent = v === undefined || v === null || v === "" ? "—" : String(v);
    tr.append(th, td);
    tbody.appendChild(tr);
  }
}

export function pill(text, kind) {
  const el = document.createElement("span");
  el.className = "pill" + (kind ? " " + kind : "");
  el.textContent = text;
  return el;
}

const logLines = [];
export function log(msg) {
  logLines.push(msg);
  const el = document.querySelector("#log");
  if (el) el.textContent = logLines.join("\n");
  // Playwright 및 수동 디버깅 공용
  console.log("[deid-test] " + msg);
}

/** Playwright 가 페이지 완료 여부와 관측값을 읽어가는 단일 진입점. */
export function publish(state) {
  window.__DEID_TEST__ = state;
  document.body.dataset.testState = state.error ? "error" : "done";
}

export function fail(err) {
  log("ERROR: " + (err && err.stack ? err.stack : err));
  const box = document.createElement("div");
  box.className = "callout warn";
  box.textContent = "실행 실패: " + (err && err.message ? err.message : String(err));
  document.querySelector("main").prepend(box);
  publish({ error: String((err && err.message) || err) });
}
