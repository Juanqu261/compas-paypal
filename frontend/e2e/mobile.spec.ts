import { expect, test } from "@playwright/test";

test("care story is usable on a phone", async ({ page }) => {
  await page.goto("/demo");
  await page.getByText("Care story: compare, split, receipt, refund, monthly plan").click();
  await page.getByTestId("capabilities-open").click();
  await expect(page.getByTestId("capabilities-selected")).toContainText("Farma Sur");
  await expect(page.getByTestId("capabilities-partition")).toContainText("not paid by the mandate");
  await page.getByTestId("capabilities-generate").click();
  await expect(page.getByTestId("capabilities-cycle")).toContainText("PayPal order created: no");
});
