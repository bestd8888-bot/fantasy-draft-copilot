import path from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";

const EXTENSION_PATH = path.resolve(process.cwd(), "dist");
const PORT = Number(process.env.FIXTURE_PORT ?? 5178);

let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  // MV3 extensions only load in the full Chromium build, and only via a
  // persistent context. `--headless=new` keeps it off-screen on CI.
  context = await chromium.launchPersistentContext("", {
    headless: false,
    channel: "chromium",
    args: [
      "--headless=new",
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
  // On install the service worker opens the options page; let that settle so it
  // cannot interrupt the first navigation.
  await context.waitForEvent("page", { timeout: 5_000 }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 500));
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
});

/** The overlay lives in a shadow root; Playwright pierces it automatically. */
const overlay = () => page.locator("#fantasy-draft-ai-copilot-root .dc-root");

test("injects the overlay and shows a best pick on a fixture draft room", async () => {
  await page.goto(`http://localhost:${PORT}/yahoo/draft-room-v1.html?draftcopilot=fixture`);

  await expect(overlay()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".dc-meta")).toContainText("Round 3");
  await expect(page.locator(".dc-best-name")).not.toBeEmpty();
  await expect(page.locator(".dc-footer")).toContainText("picks");
});

test("recalculates and drops the player when a new pick lands on the board", async () => {
  await page.goto(`http://localhost:${PORT}/yahoo/draft-room-v1.html?draftcopilot=fixture`);
  await expect(overlay()).toBeVisible({ timeout: 10_000 });

  const bestBefore = await page.locator(".dc-best-name").first().innerText();

  // Simulate another manager drafting the current best pick.
  await page.evaluate((name) => {
    const list = document.querySelector('[data-test="draft-results"] ul')!;
    const li = document.createElement("li");
    li.setAttribute("data-test", "pick-row");
    li.setAttribute("data-pick", "27");
    li.innerHTML = `<span>3.3</span><span data-test="player-name">${name}</span><span>AAA - SF</span>`;
    list.appendChild(li);
  }, bestBefore);

  await expect(page.locator(".dc-best-name").first()).not.toHaveText(bestBefore, { timeout: 5_000 });
});

test("fails loudly when the page structure is unrecognisable", async () => {
  await page.goto(`http://localhost:${PORT}/yahoo/parser-broken.html?draftcopilot=fixture`);

  await expect(overlay()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".dc-banner-error")).toContainText("parser error");
  await expect(page.locator(".dc-best-name")).toHaveCount(0);
});

test("reads pool, projections and countdown straight off the live draft client", async () => {
  await page.goto(`http://localhost:${PORT}/yahoo/draft-client-2026.html?draftcopilot=fixture`);
  await expect(overlay()).toBeVisible({ timeout: 10_000 });

  // Round/pick and the on-page countdown, with no projections file imported.
  await expect(page.locator(".dc-meta")).toContainText("Round 5");
  await expect(page.locator(".dc-meta")).toContainText("Pick 54");
  await expect(page.locator(".dc-best-name")).not.toBeEmpty();

  // Quick Mode, because the page says the user is up in 1 pick.
  await expect(page.locator(".dc-banner-warn").first()).toContainText("1 手");

  // No "projection unavailable" warning: the table supplied them.
  await expect(page.getByText("Projection unavailable")).toHaveCount(0);
});
