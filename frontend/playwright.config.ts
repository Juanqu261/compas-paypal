import { defineConfig, devices } from "@playwright/test";

const backendPort = "4010";
const frontendPort = "3010";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${frontendPort}` },
  webServer: [
    {
      command: "node --experimental-strip-types --env-file-if-exists=.env src/api/server.ts",
      cwd: "../backend",
      url: `http://127.0.0.1:${backendPort}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        PORT: backendPort,
        COMPAS_DEMO_PURCHASES: "disabled",
        DATABASE_URL: "",
        PAYPAL_WEBHOOK_ID: "",
        NODE_ENV: "development",
      },
    },
    {
      command: `npx next dev --port ${frontendPort}`,
      url: `http://127.0.0.1:${frontendPort}/demo`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        COMPAS_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
      },
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 5"] }, testMatch: /mobile/ },
  ],
});
