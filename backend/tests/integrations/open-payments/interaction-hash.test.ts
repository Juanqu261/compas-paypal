import assert from "node:assert/strict";
import test from "node:test";
import {
  computeInteractionHash,
  interactionHashMatches,
} from "../../../src/integrations/open-payments/interaction-hash.ts";

// Computed independently with Python: base64(sha256("\n".join(values))).
const vector = {
  clientNonce: "VJLO6A4CATR0KRO",
  finishNonce: "MBDOFXG4Y5CVJCX821LH",
  interactRef: "4IFWWIKYB2PQ6U56NL1",
  grantEndpoint: "https://server.example.com/tx",
};
const expectedHash = "x+gguKWTj8rQf7d7i3w3UhzvuJ5bpOlKyAlVpLxBffY=";

test("computes SHA-256 Base64 over the four values joined by newlines", () => {
  assert.equal(computeInteractionHash(vector), expectedHash);
});

test("accepts the hash with or without Base64 padding", () => {
  assert.ok(interactionHashMatches({ ...vector, receivedHash: expectedHash }));
  assert.ok(
    interactionHashMatches({
      ...vector,
      receivedHash: expectedHash.replace(/=+$/, ""),
    }),
  );
});

test("accepts a query string that decoded '+' as a space", () => {
  assert.ok(
    interactionHashMatches({
      ...vector,
      receivedHash: expectedHash.replaceAll("+", " "),
    }),
  );
});

test("accepts the URL-safe alphabet for the same bytes", () => {
  const urlSafe = expectedHash
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  assert.ok(interactionHashMatches({ ...vector, receivedHash: urlSafe }));
});

test("rejects a hash for a different interact_ref", () => {
  assert.equal(
    interactionHashMatches({
      ...vector,
      interactRef: "SOMETHING-ELSE",
      receivedHash: expectedHash,
    }),
    false,
  );
});

test("rejects a hash for a different grant endpoint", () => {
  assert.equal(
    interactionHashMatches({
      ...vector,
      grantEndpoint: "https://attacker.example/tx",
      receivedHash: expectedHash,
    }),
    false,
  );
});

test("rejects a malformed hash of a different length", () => {
  assert.equal(
    interactionHashMatches({ ...vector, receivedHash: "abc" }),
    false,
  );
});
