/**
 * 이 파일을 `config.js` 로 복사한 뒤 실제 API Key 를 채워 넣으세요.
 * `config.js` 는 .gitignore 대상이며 절대 commit 하지 않습니다.
 *
 *   cp config.example.js config.js
 *
 * URL query parameter 로도 주입할 수 있으며, query parameter 가 이 파일보다 우선합니다.
 *   phase1.html?key1=XXXX&zone=US
 *   phase2.html?key2=YYYY&zone=US
 */
window.AMP_TEST_CONFIG = {
  // De-identification Test 1 프로젝트 API Key (구버전 시뮬레이션)
  apiKey1: "PASTE_DE_IDENTIFICATION_TEST_1_API_KEY",

  // De-identification Test 2 프로젝트 API Key (신규 버전 + 방안2)
  apiKey2: "PASTE_DE_IDENTIFICATION_TEST_2_API_KEY",

  // "US" | "EU"
  serverZone: "US",
};
