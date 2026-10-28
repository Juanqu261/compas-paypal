import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * ADR 0011: the agent has no PayPal tool. The MCP layer and the agent
 * services may reach a PayPal port only through DelegatePurchaseService, the
 * same door a delegate's own purchase uses, where the policy runs first. The
 * walk stops at that door and fails if anything else on the way reaches the
 * gateway, the order creator, settlement or the PayPal adapters. The OAuth
 * code, which only issues tokens, must not reach the door at all.
 */
const src = join(dirname(fileURLToPath(import.meta.url)), "../../src");

const DOOR = "application/delegate-purchases.ts";

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
    return existsSync(target) ? target : `${target}.ts`;
  });
}

function reachable(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [join(src, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    // The door is reached, not walked through.
    if (relative(src, file).replaceAll("\\", "/") === DOOR) continue;
    queue.push(...imports(file));
  }
  return [...seen].map((file) => relative(src, file).replaceAll("\\", "/"));
}

const THROUGH_THE_DOOR = ["api/mcp.ts", "application/agent-shopping.ts"];
const NEVER = ["api/oauth.ts", "application/agent-auth.ts", "integrations/agents/in-memory-agent-repository.ts", "ports/agent-repository.ts"];

for (const entry of [...THROUGH_THE_DOOR, ...NEVER]) {
  test(`${entry} reaches no PayPal port except through the purchase service`, () => {
    const bad = reachable(entry).filter((file) => FORBIDDEN.includes(file) || file.startsWith("integrations/paypal/"));
    assert.deepEqual(bad, []);
  });
}

for (const entry of NEVER) {
  test(`${entry} does not reach the purchase service either`, () => {
    assert.ok(!reachable(entry).includes(DOOR));
  });
}

test("the MCP layer reaches the purchase service, so the walk above is checking something", () => {
  assert.ok(reachable("api/mcp.ts").includes(DOOR));
});
