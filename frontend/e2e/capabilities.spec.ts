import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:4010";

test("care story: comparison, split basket, previews, cycle, receipt and refund", async ({ page }) => {
  await page.goto("/demo");
  const act = page.getByRole("tab", { name: /When an AI shops/i });
  // The phones render first, so this tab is below them. A click during hydration is dropped.
  await expect(async () => {
    await act.click();
    await expect(act).toHaveAttribute("aria-selected", "true");
  }).toPass();
  await expect(page.getByText("Scripted demonstration")).toBeVisible();

  await page.getByText("Care story: compare, split, receipt, refund, monthly plan").click();
  await page.getByTestId("capabilities-open").click();
  await expect(page.getByTestId("capabilities-remaining")).toContainText("USD 40.00");
  await expect(page.getByTestId("capabilities-selected")).toContainText("Farma Sur");
  await expect(page.getByTestId("capabilities-savings")).toContainText("USD 4.00");
  await expect(page.getByTestId("capabilities-partition")).toContainText("not paid by the mandate");
  await expect(page.getByTestId("capabilities-partition")).toContainText("Shampoo");

  await page.getByTestId("capabilities-preview-medication").click();
  await expect(page.getByTestId("capabilities-previews")).toContainText("ORDER");
  await expect(page.getByTestId("capabilities-previews")).toContainText("PayPal order created: no");
  await page.getByTestId("capabilities-preview-alcohol").click();
  await expect(page.getByTestId("capabilities-previews")).toContainText("STOP_DENY");
  await page.getByTestId("capabilities-covered").click();
  await expect(page.getByTestId("capabilities-previews")).toContainText("shampoo is not");

  await page.getByTestId("capabilities-generate").click();
  await expect(page.getByTestId("capabilities-cycle")).toContainText("PayPal order created: no");
  await page.getByTestId("capabilities-confirm").click();
  await expect(page.getByTestId("capabilities-cycle")).toContainText("confirmed an errand");

  await page.getByTestId("capabilities-capture").click();
  await expect(page.getByTestId("capabilities-remaining")).toContainText("USD 25.00");
  await page.getByTestId("capabilities-evidence-valid").click();
  await expect(page.getByTestId("capabilities-evidence-status")).toContainText("VERIFIED_DOCUMENT_MATCH");
  await page.getByTestId("capabilities-evidence-invalid").click();
  await expect(page.getByTestId("capabilities-evidence-invalid-status")).toContainText("MISMATCH");
  await expect(page.getByTestId("capabilities-evidence-invalid-status")).toContainText("COMPLETED");

  await page.getByTestId("capabilities-refund").click();
  await expect(page.getByTestId("capabilities-remaining")).toContainText("USD 30.00");
  await page.getByTestId("capabilities-refund").click();
  await expect(page.getByTestId("capabilities-remaining")).toContainText("USD 30.00");
  await page.getByTestId("capabilities-revoke").click();
  await expect(page.getByText("Plan status: REVOKED")).toBeVisible();
  await expect(page.getByTestId("capabilities-generate")).toBeDisabled();

  await page.reload();
  await page.getByText("Care story: compare, split, receipt, refund, monthly plan").click();
  await expect(page.getByTestId("capabilities-remaining")).toContainText("USD 30.00");
});

test("unauthorized capability and webhook calls change nothing", async ({ request }) => {
  const story = await request.get(`${API}/capabilities/story`);
  expect(story.status()).toBe(401);
  const webhook = await request.post(`${API}/paypal/webhooks`, {
    data: { id: "forged", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "R", amount: { currency_code: "USD", value: "40.00" } } },
  });
  expect(webhook.status()).toBe(401);
  const body = await webhook.json();
  expect(body.error).toBe("INVALID_SIGNATURE");
});

test("mcp without a token is refused", async ({ request }) => {
  const response = await request.post(`${API}/mcp`, { data: { jsonrpc: "2.0", id: 1, method: "ping" } });
  expect(response.status()).toBe(401);
});
