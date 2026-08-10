import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

function loadLocalEnvironment() {
  if (!existsSync(".env.local")) return;
  for (const rawLine of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    const name = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!(name in process.env)) process.env[name] = value;
  }
}

loadLocalEnvironment();

const baseURL =
  process.env.ATLAS_E2E_BASE_URL ||
  process.env.ATLAS_BASE_URL ||
  "http://127.0.0.1:3000";
const parsedBaseUrl = new URL(baseURL);
const runsLocally = ["localhost", "127.0.0.1", "::1"].includes(
  parsedBaseUrl.hostname,
);
const chromiumExecutablePath =
  process.env.ATLAS_E2E_CHROMIUM_PATH?.trim() || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./artifacts/e2e/test-results",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [
    ["line"],
    ["html", { outputFolder: "artifacts/e2e/report", open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    launchOptions: chromiumExecutablePath
      ? { executablePath: chromiumExecutablePath }
      : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  expect: { timeout: 12_000 },
  webServer: runsLocally
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
