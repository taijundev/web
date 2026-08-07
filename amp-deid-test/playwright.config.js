// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  webServer: {
    command: "npx http-server . -p 8080 -c-1 --silent",
    url: "http://localhost:8080/phase1.html",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
