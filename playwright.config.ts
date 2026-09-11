import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.FIXTURE_PORT ?? 5178);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  // Chrome extensions require a persistent context, which each spec creates itself.
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: "node scripts/fixture-server.mjs",
    url: `http://localhost:${PORT}/yahoo/draft-room-v1.html`,
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
