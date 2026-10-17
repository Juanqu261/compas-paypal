import assert from "node:assert/strict";
import test from "node:test";
import { readConsentReturn } from "../../src/features/compas/demo-identities.ts";
import { minorGreaterThan, parseAmountInput, shareOf } from "../../src/features/compas/lib/amounts.ts";
import { endOfDayIso, startOfDayIso, windowProblem } from "../../src/features/compas/lib/dates.ts";
import {
  activityLabel,
  activityReason,
  capacityLabel,
  categoryList,
  isAuthorized,
  errorText,
  payerStatusLabel,
  reasonText,
  REASON_TEXT,
} from "../../src/features/compas/lib/labels.ts";
import { initialDraft, stepForField, stepIssues, toCreateBody } from "../../src/features/compas/lib/wizard.ts";

const USD = { assetCode: "USD", assetScale: 2 };
const TODAY = new Date(2026, 9, 16, 10, 0, 0);

test("amount input becomes minor units without floating point", () => {
  assert.deepEqual(parseAmountInput("40", 2), { ok: true, minorUnits: "4000" });
  assert.deepEqual(parseAmountInput("40,5", 2), { ok: true, minorUnits: "4050" });
  assert.deepEqual(parseAmountInput("40.50", 2), { ok: true, minorUnits: "4050" });
  assert.deepEqual(parseAmountInput("1.250", 2), { ok: true, minorUnits: "125000" }, "a dot before three digits groups thousands");
  assert.deepEqual(parseAmountInput("1.250,75", 2), { ok: true, minorUnits: "125075" });
  assert.deepEqual(parseAmountInput("0,07", 2), { ok: true, minorUnits: "7" });
  assert.deepEqual(parseAmountInput("1250", 0), { ok: true, minorUnits: "1250" });
});

test("bad amounts are refused with a reason", () => {
  assert.deepEqual(parseAmountInput("", 2), { ok: false, reason: "EMPTY" });
  assert.deepEqual(parseAmountInput("0", 2), { ok: false, reason: "NOT_POSITIVE" });
  assert.deepEqual(parseAmountInput("0,00", 2), { ok: false, reason: "NOT_POSITIVE" });
  assert.deepEqual(parseAmountInput("-5", 2), { ok: false, reason: "NOT_A_NUMBER" });
  assert.deepEqual(parseAmountInput("4o", 2), { ok: false, reason: "NOT_A_NUMBER" });
  assert.deepEqual(parseAmountInput("40,505", 2), { ok: false, reason: "TOO_MANY_DECIMALS" });
  assert.deepEqual(parseAmountInput("1,2,3", 2), { ok: false, reason: "NOT_A_NUMBER" });
  assert.deepEqual(parseAmountInput("40,5", 0), { ok: false, reason: "TOO_MANY_DECIMALS" });
});

test("minor-unit comparisons and shares work on strings of any length", () => {
  assert.equal(minorGreaterThan("1000001", "1000000"), true);
  assert.equal(minorGreaterThan("999", "1000"), false);
  assert.equal(minorGreaterThan("0100", "99"), true);
  assert.equal(shareOf("2000", "4000"), 0.5);
  assert.equal(shareOf("4000", "4000"), 1);
  assert.equal(shareOf("5000", "4000"), 1);
  assert.equal(shareOf("1", "0"), 0);
  assert.ok(Math.abs(shareOf("123456789012345678", "246913578024691356") - 0.5) < 1e-9);
});

test("the budget window starts at the start of the first day and ends at the end of the last", () => {
  const start = new Date(startOfDayIso("2026-10-16") ?? "");
  const end = new Date(endOfDayIso("2026-11-15") ?? "");
  assert.equal(start.getHours(), 0);
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
  assert.equal(startOfDayIso("2026-02-30"), undefined);
  assert.equal(windowProblem("2026-10-16", "2026-11-15", TODAY), undefined);
  assert.equal(windowProblem("2026-10-16", "2026-10-10", TODAY), "ENDS_BEFORE_START");
  assert.equal(windowProblem("2026-10-01", "2026-11-15", TODAY), "STARTS_IN_PAST");
  assert.equal(windowProblem("2026-10-16", "2027-12-01", TODAY), "TOO_LONG");
  assert.equal(windowProblem("", "2026-11-15", TODAY), "INVALID_DATE");
});

function draft(overrides = {}) {
  return { ...initialDraft({ delegateId: "a", beneficiaryId: "g", startDate: "2026-10-16", endDate: "2026-11-15" }), ...overrides };
}

test("the wizard defaults to MEDICATION, ENFORCED and HIGH confidence", () => {
  const value = draft();
  assert.deepEqual(value.categories, ["MEDICATION"]);
  assert.equal(value.enforcement, "ENFORCED");
  assert.equal(value.confidence, "HIGH");
  assert.equal(value.monitoredAcknowledged, false);
});

test("each step stops when it is incomplete", () => {
  assert.equal(stepIssues("participants", draft({ delegateId: "" }), USD, TODAY)[0].field, "delegateId");
  assert.equal(stepIssues("purpose", draft({ categories: [] }), USD, TODAY)[0].field, "categories");
  assert.equal(stepIssues("budget", draft({ amount: "" }), USD, TODAY)[0].field, "amount");
  assert.equal(stepIssues("budget", draft({ amount: "10001" }), USD, TODAY)[0].field, "amount");
  assert.deepEqual(stepIssues("budget", draft({ amount: "40" }), USD, TODAY), []);
  assert.equal(stepIssues("rules", draft({ enforcement: "MONITORED" }), USD, TODAY)[0].field, "monitoredAcknowledged");
  assert.deepEqual(stepIssues("rules", draft({ enforcement: "MONITORED", monitoredAcknowledged: true }), USD, TODAY), []);
  assert.equal(
    stepIssues("rules", draft({ amount: "40", confidence: "MEDIUM", capAmount: "50" }), USD, TODAY)[0].field,
    "capAmount",
  );
});

test("the request body never names the payer and maps the choices to the contract", () => {
  const body = toCreateBody(draft({ amount: "40", confidence: "MEDIUM", capAmount: "15" }), USD);
  assert.ok(body);
  assert.equal("payerId" in body, false);
  assert.deepEqual(body.budget, { value: "4000", assetCode: "USD", assetScale: 2 });
  assert.deepEqual(body.merchantConfidence, {
    minimum: "MEDIUM",
    maxDebitBelowHigh: { value: "1500", assetCode: "USD", assetScale: 2 },
  });
  assert.equal(body.enforcement, "ENFORCED");
  assert.equal("monitoredAcknowledged" in body, false);

  const monitored = toCreateBody(draft({ amount: "40", enforcement: "MONITORED", monitoredAcknowledged: true }), USD);
  assert.equal(monitored?.monitoredAcknowledged, true);
  const highWithStaleCap = toCreateBody(draft({ amount: "40", capAmount: "15" }), USD);
  assert.deepEqual(highWithStaleCap?.merchantConfidence, { minimum: "HIGH" }, "a cap is dropped when the minimum is HIGH");
});

test("backend field errors send the person to the right step", () => {
  assert.equal(stepForField("delegateId"), "participants");
  assert.equal(stepForField("categories"), "purpose");
  assert.equal(stepForField("budget.value"), "budget");
  assert.equal(stepForField("expiresAt"), "budget");
  assert.equal(stepForField("merchantConfidence.maxDebitBelowHigh"), "rules");
  assert.equal(stepForField("monitoredAcknowledged"), "rules");
});

test("every policy reason code has plain Spanish, and unknown codes don't crash", () => {
  assert.equal(REASON_TEXT.BUDGET_EXCEEDED, "La compra supera el presupuesto autorizado");
  assert.equal(REASON_TEXT.MERCHANT_NOT_ELIGIBLE, "El comercio no cumple las categorías permitidas");
  assert.equal(REASON_TEXT.CLASSIFICATION_UNCERTAIN, "Falta información para comprobar la compra");
  assert.equal(REASON_TEXT.MERCHANT_EVIDENCE_CONFLICT, "Encontramos información contradictoria sobre el comercio");
  assert.equal(REASON_TEXT.DELEGATE_NOT_AUTHORIZED, "Esta autorización pertenece a otra persona");
  assert.equal(REASON_TEXT.PAYER_MONITORED_EXCEPTION, "Compra realizada bajo supervisión");
  assert.equal(reasonText("SOMETHING_NEW"), "Motivo no reconocido");
});

test("activity labels never call a pending payment paid", () => {
  assert.equal(activityLabel("PENDING", false), "Pago en proceso");
  assert.equal(activityLabel("COMPLETED", false), "Pagada");
  assert.equal(activityLabel("COMPLETED", true), "Pagada bajo supervisión");
  assert.equal(activityLabel("FAILED", false), "Pago fallido");
  assert.equal(activityLabel("REVIEW", false), "Retenida para revisión");
  assert.equal(
    activityReason("COMPLETED", ["MERCHANT_NOT_ELIGIBLE", "PAYER_MONITORED_EXCEPTION"]),
    "El comercio no cumple las categorías permitidas",
  );
  assert.equal(activityReason("COMPLETED", []), undefined);
  assert.equal(activityReason("DENIED", ["PURPOSE_MISMATCH"]), "Los productos no corresponden al propósito");
});

test("a revoked budget whose wallet cancellation is pending says so", () => {
  assert.equal(payerStatusLabel({ status: "REVOKED", authorization: { consent: "GRANTED", grantCancellation: "PENDING", canAuthorize: false, canRevoke: true } }), "Revocado, falta confirmar en tu billetera");
  assert.equal(payerStatusLabel({ status: "REVOKED", authorization: { consent: "GRANTED", grantCancellation: "DONE", canAuthorize: false, canRevoke: false } }), "Revocado");
  assert.equal(categoryList(["MEDICATION", "FOOD", "TOBACCO"]), "Medicamentos, alimentos y tabaco");
  assert.match(errorText("OPEN_PAYMENTS_NOT_CONFIGURED"), /Open Payments/);
  assert.match(errorText("PAYER_GRANTS_DISABLED_FOR_DEMO"), /sin activar/);
});

test("a budget authorizes nothing until the payer consented", () => {
  const payer = (status: "DRAFT" | "PENDING_AUTHORIZATION" | "ACTIVE" | "EXHAUSTED" | "EXPIRED" | "REVOKED", consent: "NOT_STARTED" | "WAITING_FOR_PAYER" | "GRANTED") => ({
    status,
    viewerRole: "PAYER" as const,
    authorization: { consent, canAuthorize: false, canRevoke: false },
  });
  assert.equal(isAuthorized(payer("DRAFT", "NOT_STARTED")), false);
  assert.equal(isAuthorized(payer("PENDING_AUTHORIZATION", "WAITING_FOR_PAYER")), false);
  assert.equal(isAuthorized(payer("ACTIVE", "GRANTED")), true);
  assert.equal(isAuthorized(payer("REVOKED", "NOT_STARTED")), false, "a discarded draft never authorized anything");
  assert.equal(isAuthorized(payer("REVOKED", "GRANTED")), true);
  assert.equal(isAuthorized({ status: "EXPIRED", viewerRole: "DELEGATE" }), true, "a delegate only sees consented budgets");
  assert.equal(capacityLabel(payer("DRAFT", "NOT_STARTED")), "Monto por autorizar");
  assert.equal(capacityLabel(payer("ACTIVE", "GRANTED")), "Capacidad autorizada disponible");
  assert.equal(capacityLabel(payer("REVOKED", "NOT_STARTED")), "Descartado sin autorizarse");
});

test("the consent return hint is read strictly", () => {
  assert.deepEqual(readConsentReturn("?payerAuthorization=granted&grantKey=mandate-abc-1"), {
    result: "granted",
    mandateId: "mandate-abc-1",
  });
  assert.equal(readConsentReturn("?payerAuthorization=granted"), null);
  assert.equal(readConsentReturn("?payerAuthorization=maybe&grantKey=mandate-abc-1"), null);
  assert.equal(readConsentReturn("?payerAuthorization=granted&grantKey=../../x"), null);
  assert.equal(readConsentReturn(""), null);
});
