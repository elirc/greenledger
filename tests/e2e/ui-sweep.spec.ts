/**
 * UI sweep: screenshot every screen per role at 390px (plus a desktop pass
 * on key pages), collecting console errors and failed requests.
 * Artifacts land in test-results/ui-sweep/. Run explicitly:
 *   BASE_URL=... pnpm exec playwright test tests/e2e/ui-sweep.spec.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const OUT = "test-results/ui-sweep";
mkdirSync(OUT, { recursive: true });

type Issue = { route: string; kind: string; detail: string };
const issues: Issue[] = [];

function watch(page: Page, route: () => string) {
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      // Noise: aborted RSC prefetches on fast navigation.
      if (/ERR_ABORTED|Failed to load resource.*404.*favicon/i.test(t)) return;
      issues.push({ route: route(), kind: "console.error", detail: t.slice(0, 400) });
    }
  });
  page.on("pageerror", (e) =>
    issues.push({ route: route(), kind: "pageerror", detail: String(e).slice(0, 400) }),
  );
  page.on("response", (r) => {
    if (r.status() >= 500) {
      issues.push({ route: route(), kind: `http ${r.status()}`, detail: r.url().slice(0, 200) });
    }
  });
}

async function shoot(page: Page, route: string, name: string) {
  await page.goto(route, { waitUntil: "load" });
  await page.waitForTimeout(700);
  // Next.js dev/prod error overlays or unhandled error boundaries.
  const boundary = page.getByText(/something went wrong|internal server error|application error/i);
  if (await boundary.first().isVisible().catch(() => false)) {
    issues.push({ route, kind: "error-boundary", detail: "visible error state" });
  }
  // Horizontal overflow at phone width = broken mobile layout.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 2) {
    issues.push({ route, kind: "h-overflow", detail: `${overflow}px wider than viewport` });
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function signIn(page: Page, email: string, password: string) {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
}

const OWNER_ROUTES: [string, string][] = [
  ["/", "owner-00-dashboard"],
  ["/store", "owner-01-store"],
  ["/store/receive", "owner-02-receive"],
  ["/store/issue", "owner-03-issue"],
  ["/store/transfer", "owner-04-transfer"],
  ["/store/counts", "owner-05-counts"],
  ["/store/returns", "owner-06-returns"],
  ["/store/alerts", "owner-07-alerts"],
  ["/store/labels", "owner-08-labels"],
  ["/store/suppliers", "owner-09-suppliers"],
  ["/store/items/new", "owner-10-item-new"],
  ["/scan", "owner-11-scan"],
  ["/nursery", "owner-12-nursery"],
  ["/nursery/new", "owner-13-nursery-new"],
  ["/greenhouses", "owner-14-greenhouses"],
  ["/cycles", "owner-15-cycles"],
  ["/cycles/new", "owner-16-cycle-new"],
  ["/applications", "owner-17-applications"],
  ["/applications/new", "owner-18-application-new"],
  ["/recipes", "owner-19-recipes"],
  ["/recipes/new", "owner-20-recipe-new"],
  ["/harvest", "owner-21-harvest"],
  ["/harvest/forecast", "owner-22-forecast"],
  ["/produce", "owner-23-produce"],
  ["/sales", "owner-24-sales"],
  ["/sales/new", "owner-25-sale-new"],
  ["/sales/customers", "owner-26-customers"],
  ["/sales/receivables", "owner-27-receivables"],
  ["/equipment", "owner-28-equipment"],
  ["/equipment/new", "owner-29-equipment-new"],
  ["/expenses", "owner-30-expenses"],
  ["/expenses/new", "owner-31-expense-new"],
  ["/readings", "owner-32-readings"],
  ["/readings/new", "owner-33-reading-new"],
  ["/tasks", "owner-34-tasks"],
  ["/tasks?view=calendar", "owner-35-tasks-calendar"],
  ["/tasks/new", "owner-36-task-new"],
  ["/reports", "owner-37-reports"],
  ["/reports/profitability", "owner-38-rep-profitability"],
  ["/reports/input-use", "owner-39-rep-input-use"],
  ["/reports/harvest", "owner-40-rep-harvest"],
  ["/reports/waste", "owner-41-rep-waste"],
  ["/reports/stock-valuation", "owner-42-rep-stock-valuation"],
  ["/reports/purchases", "owner-43-rep-purchases"],
  ["/reports/spray-record", "owner-44-rep-spray-record"],
  ["/settings", "owner-45-settings"],
  ["/settings/users", "owner-46-users"],
  ["/settings/users/new", "owner-47-user-new"],
  ["/settings/farm", "owner-48-farm"],
  ["/settings/varieties", "owner-49-varieties"],
  ["/settings/billing", "owner-50-billing"],
  ["/setup", "owner-51-setup"],
];

const DETAIL_LISTS: [string, string, string][] = [
  // [list route, link prefix, shot name]
  ["/cycles", "/cycles/", "owner-60-cycle-detail"],
  ["/store", "/store/items/", "owner-61-item-detail"],
  ["/sales", "/sales/", "owner-62-sale-detail"],
  ["/equipment", "/equipment/", "owner-63-equipment-detail"],
  ["/greenhouses", "/greenhouses/", "owner-64-greenhouse-detail"],
  ["/nursery", "/nursery/", "owner-65-nursery-detail"],
];

test("owner sweep (mobile)", async ({ page }) => {
  test.setTimeout(540_000);
  let current = "";
  watch(page, () => current);
  await signIn(page, "owner@demo.farm", "Demo1234!");
  for (const [route, name] of OWNER_ROUTES) {
    current = route;
    await shoot(page, route, name);
  }
  for (const [list, prefix, name] of DETAIL_LISTS) {
    current = `${list} → detail`;
    await page.goto(list, { waitUntil: "load" });
    const href = await page
      .locator(`a[href^='${prefix}']`)
      .evaluateAll((els, p) => {
        const re = new RegExp(`^${p}[0-9a-f-]{36}$`);
        return els.map((a) => a.getAttribute("href") ?? "").find((h) => re.test(h)) ?? "";
      }, prefix);
    if (href) {
      current = href;
      await shoot(page, href, name);
    }
  }
  writeFileSync(`${OUT}/issues-owner.json`, JSON.stringify(issues, null, 2));
});

test("worker sweep (mobile)", async ({ page }) => {
  test.setTimeout(240_000);
  const workerIssues: Issue[] = [];
  let current = "";
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_ABORTED/.test(m.text())) {
      workerIssues.push({ route: current, kind: "console.error", detail: m.text().slice(0, 400) });
    }
  });
  await signIn(page, "worker@demo.farm", "Demo1234!");
  const routes: [string, string][] = [
    ["/", "worker-00-dashboard"],
    ["/harvest", "worker-01-harvest"],
    ["/cycles", "worker-02-cycles"],
    ["/greenhouses", "worker-03-greenhouses"],
    ["/nursery", "worker-04-nursery"],
    ["/applications", "worker-05-applications"],
    ["/applications/new", "worker-06-application-new"],
    ["/tasks", "worker-07-tasks"],
    ["/readings", "worker-08-readings"],
    ["/scan", "worker-09-scan"],
    ["/store", "worker-10-store-forbidden"],
    ["/sales", "worker-11-sales-forbidden"],
  ];
  for (const [route, name] of routes) {
    current = route;
    await shoot(page, route, name);
  }
  // Hard check: no naira sign anywhere in a worker's dashboard or pages.
  for (const r of ["/", "/cycles", "/greenhouses"]) {
    await page.goto(r, { waitUntil: "load" });
    const text = await page.locator("main").innerText();
    if (/₦/.test(text)) {
      workerIssues.push({ route: r, kind: "money-leak", detail: "₦ visible to worker" });
    }
  }
  writeFileSync(`${OUT}/issues-worker.json`, JSON.stringify(workerIssues, null, 2));
});

test("platform admin sweep (mobile)", async ({ page }) => {
  test.setTimeout(240_000);
  let current = "";
  watch(page, () => current);
  await signIn(page, "admin@greenledger.local", "Admin1234!");
  const routes: [string, string][] = [
    ["/platform", "padmin-00-home"],
    ["/platform/orgs", "padmin-01-orgs"],
    ["/platform/plans", "padmin-02-plans"],
    ["/platform/audit", "padmin-03-audit"],
    ["/platform/health", "padmin-04-health"],
  ];
  for (const [route, name] of routes) {
    current = route;
    await shoot(page, route, name);
  }
  writeFileSync(`${OUT}/issues-padmin.json`, JSON.stringify(issues, null, 2));
});

test("owner sweep (desktop spot-check)", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await signIn(page, "owner@demo.farm", "Demo1234!");
  for (const [route, name] of [
    ["/", "desk-00-dashboard"],
    ["/store", "desk-01-store"],
    ["/cycles", "desk-02-cycles"],
    ["/reports/profitability", "desk-03-profitability"],
    ["/settings/billing", "desk-04-billing"],
  ] as [string, string][]) {
    await page.goto(route, { waitUntil: "load" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  }
  await ctx.close();
});
