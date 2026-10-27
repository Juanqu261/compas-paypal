import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * ADR 0003: AI never authorizes. The analyst, the errand drafter and the
 * Elastic adapters must not even be able to reach a PayPal port. This walks
 * every relative import from each entry point and fails if one reaches the
 * payment gateway, the order creator or the PayPal adapters.
 *
 * Log in with PayPal (paypal-identity) is not a payment port, but the analyst
 * doesn't reach it either: the binding reads the stored verification only.
 */
const src = join(dirname(fileURLToPath(import.meta.url)), "../../src");

const ENTRY_POINTS = [
  "application/run-merchant-analysis.ts",
  "application/bind-merchant-certificate.ts",
  "application/analyst-appeals.ts",
  "application/analyst-jobs.ts",
  "application/errands.ts",
  "application/catalog-mappings.ts",
  "integrations/elastic/create-elastic.ts",
  "integrations/elastic/inference-analyst-model.ts",
  "integrations/elastic/cum-index.ts",
  "policy/cum-mapping-verifier.ts",
  "policy/errand-check.ts",
];

const FORBIDDEN = [
  "ports/paypal-gateway.ts",
  "ports/paypal-identity.ts",
  "application/create-paypal-order-if-allowed.ts",
  "application/purchase-under-mandate.ts",
  "application/settle-paypal-order.ts",
];

function imports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/^\s*(?:import|export)[^"']*?from\s+["'](\.[^"']+)["']/gm)].map((match) => {
    const target = resolve(dirname(file), match[1]);
    // Some older modules import without the extension.
    return existsSync(target) ? target : `${target}.ts`;
  });
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [join(src, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...imports(file));
  }
  return seen;
}

for (const entry of ENTRY_POINTS) {
  test(`${entry} reaches no PayPal port`, () => {
    const reached = [...reachable(entry)].map((file) => relative(src, file).replaceAll("\\", "/"));
    const bad = reached.filter((file) => FORBIDDEN.includes(file) || file.startsWith("integrations/paypal/"));
    assert.deepEqual(bad, []);
  });
}
