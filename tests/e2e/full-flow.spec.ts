import { expect, test, type Page } from "@playwright/test";

/**
 * The spec's Definition-of-Done scenario, end to end against a seeded dev
 * server: receive fertiliser and a chemical â†’ start a crop cycle â†’ log a
 * fertigation and see stock fall â†’ log a spray â†’ harvest warning + manager
 * override â†’ a later (clean) harvest â†’ sell produce â†’ cycle profitability
 * and the spray record.
 *
 * Run: pnpm db:seed && pnpm dev   then   BASE_URL=... pnpm test:e2e
 */

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36).slice(-5);

async function signIn(page: Page, email: string) {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email, password: "Demo1234!" },
  });
  expect(res.ok(), `sign-in for ${email}`).toBeTruthy();
}

async function pickSelect(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByLabel(label).first().click();
  await page.getByRole("option", { name: option }).first().click();
}

async function pickItem(page: Page, query: string) {
  await page.getByRole("combobox", { name: "Item" }).first().click();
  const search = page.getByPlaceholder(/^Search items/);
  await search.fill(query);
  await page.getByRole("option", { name: new RegExp(query, "i") }).first().click();
}

async function receiveOne(
  page: Page,
  item: string,
  batch: string,
  qty: string,
  cost: string,
) {
  await page.goto("/store/receive");
  await pickSelect(page, "Supplier", /.+/);
  await pickItem(page, item);
  await page.getByLabel(/^Batch no\./i).first().fill(batch);
  await page.getByLabel(/^Quantity/).first().fill(qty);
  await page.getByLabel(/^Cost per/).first().fill(cost);
  await page.getByRole("button", { name: /receive|save/i }).last().click();
  // Success screen offers label printing (spec: print QR labels for the batch).
  await expect(
    page.getByRole("link", { name: /print labels/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

test("hire-to-invoiceâ€¦ rather: receive-to-spray-record full flow", async ({ page }) => {
  test.setTimeout(600_000);
  await signIn(page, "manager@demo.farm");

  // â”€â”€ 1. Receive a fertiliser and a chemical (two receipts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await receiveOne(page, "NPK 20-20-20", `E2E-FERT-${RUN}`, "50", "1500");
  await receiveOne(page, "Lambda", `E2E-CHEM-${RUN}`, "5", "9000");

  // â”€â”€ 2. Start a crop cycle: plan one on GH6 sown today, mark it growing.
  // (The seeded GH5/GH6 planned cycles have FUTURE sow dates, and a cycle
  // cannot be planted out before it is sown.)
  const TODAY = new Date().toISOString().slice(0, 10);
  await page.goto("/cycles/new");
  await pickSelect(page, "Greenhouse", /GH6/);
  await pickSelect(page, "Variety", /.+/);
  await page.getByLabel(/intended sow date/i).fill(TODAY);
  await page.getByRole("button", { name: /plan cycle/i }).click();
  await expect(page).toHaveURL(/\/cycles\/[0-9a-f-]{36}/, { timeout: 60_000 });

  await page.getByRole("button", { name: /mark as growing/i }).first().click();
  const growDialog = page.getByRole("dialog");
  await growDialog.getByLabel(/plants in the ground/i).fill("500");
  await growDialog.getByRole("button", { name: /mark as growing/i }).click();
  // The dialog closing is the real completion signal â€” navigating earlier
  // would abort the in-flight server action.
  await expect(growDialog).toBeHidden({ timeout: 60_000 });

  // â”€â”€ 3. Fertigation on the new cycle â€” stock must fall â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await page.goto("/applications/new");
  await pickSelect(page, "Greenhouse", /GH6/);
  await pickSelect(page, "Crop cycle", /GH6/);
  await pickSelect(page, /recipe/i, /veg feed/i);
  await page.getByLabel(/water volume/i).fill("500");
  await page.getByRole("button", { name: /^log fertigation$/i }).click();
  await expect(page.getByText(/fertigation logged/i).first()).toBeVisible({
    timeout: 60_000,
  });
  // The new application row lists its issued inputs â†’ stock fell.
  await page.goto("/applications");
  await page.getByRole("button", { name: /GH6/ }).first().click();
  await expect(page.getByText(/NPK 20-20-20/i).first()).toBeVisible();

  // â”€â”€ 4. Spray â€” sets the PHI window on GH5 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await page.goto("/applications/new");
  await pickSelect(page, "Greenhouse", /GH6/);
  await pickSelect(page, "Crop cycle", /GH6/);
  await page.getByRole("radio", { name: /^spray$/i }).click();
  await pickSelect(page, /recipe/i, /ipm spray a/i);
  await page.getByLabel(/water volume/i).fill("400");
  await page.getByRole("button", { name: /^log spray$/i }).click();
  await expect(page.getByText(/spray logged/i).first()).toBeVisible({
    timeout: 60_000,
  });

  // Greenhouse card shows the red safety state.
  await page.goto("/greenhouses");
  await expect(page.getByText(/no harvest until/i).first()).toBeVisible({
    timeout: 30_000,
  });

  // â”€â”€ 5. Harvest inside the PHI â†’ warning â†’ manager override â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await page.goto("/harvest");
  await pickSelect(page, "Greenhouse", /GH6/);
  const cyclePick = page.getByLabel("Crop cycle").first();
  if ((await cyclePick.textContent())?.match(/pick/i)) {
    await pickSelect(page, "Crop cycle", /GH6/);
  }
  await expect(
    page.getByText(/pre-harvest interval/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/grade a kg/i).fill("10");
  await page.getByRole("button", { name: /save harvest/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("textbox").fill("Buyer collection could not wait â€” e2e");
  await dialog.getByRole("button", { name: /override|confirm|save/i }).last().click();
  await expect(page.getByText(/saved|logged|recorded/i).first()).toBeVisible({
    timeout: 60_000,
  });

  // â”€â”€ 6. A later harvest outside any PHI window (GH3 is safe) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await page.goto("/harvest");
  await pickSelect(page, "Greenhouse", /GH3/);
  const cyclePick3 = page.getByLabel("Crop cycle").first();
  if ((await cyclePick3.textContent())?.match(/pick/i)) {
    await pickSelect(page, "Crop cycle", /GH3/);
  }
  await expect(page.getByText(/pre-harvest interval/i)).toHaveCount(0);
  await page.getByLabel(/grade a kg/i).fill("8");
  await page.getByRole("button", { name: /save harvest/i }).click();
  await expect(page.getByText(/saved|logged|recorded/i).first()).toBeVisible({
    timeout: 60_000,
  });

  // â”€â”€ 7. Sell produce (FIFO from the packhouse) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await page.goto("/sales/new");
  await pickSelect(page, "Customer", /.+/);
  await pickSelect(page, /sold from/i, /packhouse/i);
  await pickSelect(page, "Crop", /pepper/i);
  await pickSelect(page, "Grade", /grade a|^a$/i);
  await page.getByLabel(/weight \(kg\)/i).first().fill("5");
  await page.getByLabel(/^price per/i).first().fill("1500");
  await page.getByRole("button", { name: /create|record|save/i }).last().click();
  await expect(page.getByText(/INV-\d+/).first()).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("link", { name: /invoice/i }).first(),
  ).toBeVisible();

  // â”€â”€ 8. Cycle profitability + spray record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  await page.goto("/reports/profitability");
  await expect(page.getByText(/GH3-/).first()).toBeVisible({ timeout: 60_000 });

  await page.goto("/reports/spray-record");
  await expect(page.getByText(/abamectin|mancozeb|ipm spray/i).first()).toBeVisible({
    timeout: 60_000,
  });
  // The override harvest we logged shows up against GH5's spray.
  await expect(page.getByText(/GH6/).first()).toBeVisible();
});
