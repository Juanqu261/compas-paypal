import assert from "node:assert/strict";
import { sign } from "node:crypto";
import test from "node:test";
import type { TrustLogEntry } from "../../../src/domain/merchant-category.ts";
import { verifyClaimSignature } from "../../../src/integrations/merchant-registry/claim-signature.ts";
import { InMemoryTrustLog } from "../../../src/integrations/merchant-registry/in-memory-trust-log.ts";
import { newKey } from "../../application/category-test-kit.ts";

function flag(id: string, submissionId: string): TrustLogEntry {
  return {
    id,
    type: "FLAG",
    sourceId: "monitor",
    submissionId,
    bodyDigest: "d",
    recordedAt: "2026-10-16T12:00:00Z",
    walletAddressUrl: "https://wallet.example/a",
    category: "MEDICATION",
    note: "test",
  };
}

test("the trust log has no update or delete", () => {
  const log = new InMemoryTrustLog() as unknown as Record<string, unknown>;
  for (const method of ["update", "delete", "remove", "set", "clear"]) {
    assert.equal(log[method], undefined, method);
  }
});

test("a repeated (source, submission) appends nothing", async () => {
  const log = new InMemoryTrustLog();
  const first = await log.append(flag("e1", "s1"));
  const second = await log.append(flag("e2", "s1"));
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.entry.id, "e1");
  assert.equal((await log.listByWalletAddress("https://wallet.example/a")).length, 1);
});

test("stored entries are frozen copies", async () => {
  const log = new InMemoryTrustLog();
  const original = flag("e1", "s1");
  const { entry } = await log.append(original);
  (original as { note: string }).note = "edited";
  assert.notEqual(await log.getById("e1"), original);
  assert.throws(() => {
    (entry as { note: string }).note = "edited";
  });
  const stored = await log.getById("e1");
  assert.ok(stored?.type === "FLAG");
  assert.equal(stored.note, "test");
});

test("an Ed25519 signature verifies only over the exact bytes and the right key", () => {
  const key = newKey();
  const other = newKey();
  const body = new TextEncoder().encode('{"a":1}');
  const signature = sign(null, body, key.privateKey).toString("base64url");

  assert.equal(verifyClaimSignature(body, signature, key.publicKeyJwk), true);
  assert.equal(verifyClaimSignature(new TextEncoder().encode('{"a": 1}'), signature, key.publicKeyJwk), false);
  assert.equal(verifyClaimSignature(body, signature, other.publicKeyJwk), false);
  assert.equal(verifyClaimSignature(body, "not base64 !", key.publicKeyJwk), false);
  assert.equal(verifyClaimSignature(body, signature, { kty: "RSA" }), false);
});
