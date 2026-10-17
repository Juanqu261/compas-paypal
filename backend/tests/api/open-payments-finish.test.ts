import assert from "node:assert/strict";
import test from "node:test";
import { handleOpenPaymentsFinish } from "../../src/api/open-payments-finish.ts";
import type { FinishPayerGrantInput } from "../../src/ports/open-payments-gateway.ts";

const RETURN_URL = "http://localhost:3000/demo";

function finishUrl(query: string): URL {
  return new URL(`http://localhost:4000/open-payments/finish?${query}`);
}

function recordingGateway(outcome: "ok" | "throw" = "ok") {
  const calls: FinishPayerGrantInput[] = [];
  return {
    calls,
    gateway: {
      async finishPayerGrant(input: FinishPayerGrantInput) {
        calls.push(input);
        if (outcome === "throw") throw new Error("hash mismatch");
        return { status: "GRANTED" as const };
      },
    },
  };
}

test("a consent redirect finishes the grant and returns the payer to the frontend", async () => {
  const { calls, gateway } = recordingGateway();
  const finished: string[] = [];

  const { location, result } = await handleOpenPaymentsFinish(
    finishUrl("grantKey=m-1&interact_ref=REF&hash=abc%2Bdef"),
    { gateway, returnUrl: RETURN_URL, onPayerGrantFinished: (key) => { finished.push(key); } },
  );

  assert.equal(result, "granted");
  assert.deepEqual(calls, [{ grantKey: "m-1", interactRef: "REF", hash: "abc+def" }]);
  assert.deepEqual(finished, ["m-1"]);
  assert.equal(location, `${RETURN_URL}?payerAuthorization=granted&grantKey=m-1`);
});

test("a rejected consent never finishes the grant", async () => {
  const { calls, gateway } = recordingGateway();
  const { location, result } = await handleOpenPaymentsFinish(
    finishUrl("grantKey=m-1&result=grant_rejected"),
    { gateway, returnUrl: RETURN_URL },
  );
  assert.equal(result, "rejected");
  assert.equal(calls.length, 0);
  assert.match(location, /payerAuthorization=rejected/);
});

test("a gateway failure redirects as failed and exposes no detail to the browser", async () => {
  const { gateway } = recordingGateway("throw");
  const logged: string[] = [];
  const { location, result } = await handleOpenPaymentsFinish(
    finishUrl("grantKey=m-1&interact_ref=REF&hash=bad"),
    { gateway, returnUrl: RETURN_URL, logError: (message) => logged.push(message) },
  );
  assert.equal(result, "failed");
  assert.equal(location, `${RETURN_URL}?payerAuthorization=failed&grantKey=m-1`);
  assert.equal(logged.length, 1);
});

test("a redirect without interact_ref or hash is a failure", async () => {
  const { calls, gateway } = recordingGateway();
  const { result } = await handleOpenPaymentsFinish(finishUrl("grantKey=m-1"), {
    gateway,
    returnUrl: RETURN_URL,
  });
  assert.equal(result, "failed");
  assert.equal(calls.length, 0);
});
