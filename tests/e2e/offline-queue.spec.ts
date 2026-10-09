/**
 * Offline queue (ARCHITECTURE §6): a worker logs a plant loss with the
 * network off → the entry lands in the Dexie outbox and the shell badge
 * shows it pending → back online, the outbox flushes via POST /api/sync →
 * a reload of the cycle page shows the loss from the server.
 *
 * Runs against an already-running, seeded server (playwright.config.ts):
 *   BASE_URL=http://localhost:3000 pnpm exec playwright test offline-queue
 * Orchestrator-only (shared dev DB).
 */
import { expect, test, type Page } from "@playwright/test";

const WORKER = { email: "worker@demo.farm", password: "Demo1234!" };
const UUID_PATH = /^\/cycles\/[0-9a-f-]{36}$/;

async function signInAsWorker(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Use email and password instead" }).click();
  await page.getByLabel("Email").fill(WORKER.email);
  await page.getByLabel("Password").fill(WORKER.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

/** First cycle visible to the worker whose loss form is open. */
async function openLossForm(page: Page): Promise<string> {
  await page.goto("/cycles");
  const hrefs = await page
    .locator("a[href^='/cycles/']")
    .evaluateAll((els) => els.map((a) => a.getAttribute("href") ?? ""));
  const cycles = [...new Set(hrefs.filter((h) => UUID_PATH.test(h)))];
  expect(cycles.length, "worker should see at least one cycle").toBeGreaterThan(0);

  for (const href of cycles) {
    await page.goto(`${href}/losses/new`);
    const submit = page.getByRole("button", { name: "Log loss" });
    if (await submit.isVisible().catch(() => false)) return href;
  }
  throw new Error("No growing/harvesting cycle with plants alive for the worker");
}

test("worker logs a plant loss offline; it syncs when back online", async ({
  page,
  context,
}) => {
  await signInAsWorker(page);
  const cycleHref = await openLossForm(page);
  const note = `offline e2e ${Date.now()}`;

  // ---- go offline with the form already loaded
  await context.setOffline(true);
  await expect(page.getByText(/^Offline/)).toBeVisible();

  await page.getByLabel("Plants lost").fill("1");
  await page.getByRole("combobox").filter({ hasText: "Pick a cause" }).click();
  await page.getByRole("option", { name: "Pest" }).click();
  await page.getByLabel("Note (optional)").fill(note);
  await page.getByRole("button", { name: "Log loss" }).click();

  // Optimistic toast + pending badge in the shell.
  await expect(page.getByText("Saved on this phone — will sync")).toBeVisible();
  await expect(page.getByText(/Offline — \d+ saved to sync/)).toBeVisible();

  // ---- back online: the `online` event flushes the outbox
  await context.setOffline(false);
  await expect(page.getByText(/saved to sync|Sync \d+ entr/)).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(page.getByText(/failed to sync/)).toHaveCount(0);

  // ---- the loss reached the server
  await page.goto(cycleHref);
  await page.reload();
  await expect(page.getByText(note)).toBeVisible();
});
