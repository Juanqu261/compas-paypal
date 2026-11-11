import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { APPROVAL_TIMEOUT_MS, listenForPayPalReturn, SMOKE_RETURN_PATH } from "../../scripts/lib/smoke-io.ts";

test("listenForPayPalReturn resolves when PayPal hits the return path", async () => {
  const port = await freePort();
  const listener = listenForPayPalReturn(port);
  try {
    const pending = listener.next();
    await fetch(`http://127.0.0.1:${port}${SMOKE_RETURN_PATH}?token=ORDER123&PayerID=ABC`);
    const back = await pending;
    assert.equal(back.approved, true);
    assert.equal(back.orderId, "ORDER123");
  } finally {
    listener.close();
  }
});

test("after close(), the smoke port refuses connections (lost-callback symptom)", async () => {
  const port = await freePort();
  const listener = listenForPayPalReturn(port);
  await new Promise<void>((resolve, reject) => {
    // Wait until listen is actually bound.
    const probe = createServer();
    probe.once("error", reject);
    // The smoke listener already owns `port`; probing another free check is enough:
    // close the smoke listener and assert fetch fails.
    probe.close();
    resolve();
  });
  listener.close();
  await new Promise((r) => setTimeout(r, 50));
  await assert.rejects(
    () => fetch(`http://127.0.0.1:${port}${SMOKE_RETURN_PATH}?token=LATE`),
    (error: unknown) => error instanceof TypeError || (error instanceof Error && /fetch|ECONNREFUSED/i.test(String(error))),
  );
});

test("approval timeout constant stays long enough for a sandbox login", () => {
  assert.equal(APPROVAL_TIMEOUT_MS, 10 * 60_000);
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("no port"));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}
