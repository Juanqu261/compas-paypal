import assert from "node:assert/strict";
import test from "node:test";
import type { ConfirmationResult } from "../../src/application/confirm-purchase-purpose.ts";
import { handleConfirmPurchasePurpose } from "../../src/api/spending-confirmations.ts";

const encode = (value: unknown) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));

function deps(result: ConfirmationResult) {
  const calls: unknown[] = [];
  return {
    calls,
    confirm: async (input: unknown) => {
      calls.push(input);
      return result;
    },
  };
}

test("a valid confirmation is 201, a repeat is 200", async () => {
  const fresh = deps({ ok: true, observationId: "r1:verdict", duplicate: false });
  const response = await handleConfirmPurchasePurpose(
    "/spending-records/r1/confirmation",
    encode({ payerId: "pedro", verdict: "MATCH" }),
    fresh,
  );
  assert.deepEqual(response, { status: 201, body: { recorded: "MATCH" } });
  assert.deepEqual(fresh.calls, [{ spendingRecordId: "r1", payerId: "pedro", verdict: "MATCH" }]);

  const repeat = await handleConfirmPurchasePurpose(
    "/spending-records/r1/confirmation",
    encode({ payerId: "pedro", verdict: "MATCH" }),
    deps({ ok: true, observationId: "r1:verdict", duplicate: true }),
  );
  assert.equal(repeat.status, 200);
});

test("bad bodies are 400 and never reach the use case", async () => {
  for (const body of ["not json", { verdict: "MATCH" }, { payerId: "pedro", verdict: "MAYBE" }, null]) {
    const d = deps({ ok: true, observationId: "x", duplicate: false });
    const response = await handleConfirmPurchasePurpose("/spending-records/r1/confirmation", encode(body), d);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(d.calls.length, 0);
  }
});

test("use-case errors map to HTTP statuses", async () => {
  const cases = [
    ["NOT_THE_PAYER", 403],
    ["PURCHASE_NOT_FOUND", 404],
    ["VERDICT_ALREADY_RECORDED", 409],
  ] as const;
  for (const [code, status] of cases) {
    const response = await handleConfirmPurchasePurpose(
      "/spending-records/r1/confirmation",
      encode({ payerId: "pedro", verdict: "MISMATCH" }),
      deps({ ok: false, code, message: code }),
    );
    assert.deepEqual([response.status, response.body.error], [status, code]);
  }
});

test("a path that is not a confirmation is 404", async () => {
  for (const path of ["/spending-records/../confirmation", "/spending-records/r1/other", "/spending-records//confirmation"]) {
    const response = await handleConfirmPurchasePurpose(
      path,
      encode({ payerId: "pedro", verdict: "MATCH" }),
      deps({ ok: true, observationId: "x", duplicate: false }),
    );
    assert.equal(response.status, 404, path);
  }
});
