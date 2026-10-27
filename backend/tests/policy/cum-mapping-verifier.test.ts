import assert from "node:assert/strict";
import test from "node:test";
import { JsonCumRegistry } from "../../src/integrations/cum/json-cum-registry.ts";
import { DEMO_CUM_FILE } from "../../src/integrations/merchant-registry/data-paths.ts";
import { foldText, verifyCumMapping } from "../../src/policy/cum-mapping-verifier.ts";

const registry = JsonCumRegistry.fromFile(DEMO_CUM_FILE);
const cum = async (code: string) => {
  const record = await registry.getByCum(code);
  assert.ok(record, `${code} is in the demo subset`);
  return record;
};
const failed = (result: ReturnType<typeof verifyCumMapping>) =>
  result.checks.filter((check) => !check.passed).map((check) => check.check);

test("the demo subset groups INVIMA's repeated ingredient rows into one record per CUM", async () => {
  const losartan = await cum("19996998-1");
  assert.deepEqual(losartan.ingredients, [{ name: "LOSARTAN POTASICO", amount: "50", unit: "mg" }]);
  assert.equal(losartan.presentationUnits, 30);
  assert.equal((await cum("19964725-4")).ingredients.length, 2);
});

test("a SKU that names the ingredient, strength and form verifies, accents and salts aside", async () => {
  const result = verifyCumMapping("Losartán 50mg x 30 tabletas recubiertas", await cum("19996998-1"));
  assert.equal(result.status, "VERIFIED", JSON.stringify(result.checks));
});

test("a combination needs every ingredient and strength", async () => {
  const hyzaar = await cum("19964725-2");
  assert.equal(verifyCumMapping("Hyzaar losartán + hidroclorotiazida 100/12.5 mg tabletas x30", hyzaar).status, "VERIFIED");
  assert.deepEqual(failed(verifyCumMapping("Hyzaar losartán 100 mg tabletas x30", hyzaar)), ["INGREDIENTS", "STRENGTHS"]);
});

test("a free medical sample is never a shop's SKU, even when everything else matches", async () => {
  const sku = "Hyzaar losartán + hidroclorotiazida 100/12.5 mg x 30 tabletas recubiertas";
  assert.deepEqual(failed(verifyCumMapping(sku, await cum("19964725-6"))), ["NOT_A_SAMPLE"], "MUESTRA MEDICA, also x30");
  assert.equal(verifyCumMapping(sku, await cum("19964725-2")).status, "VERIFIED", "the retail box");
});

test("a wrong strength, a wrong form or another box size is rejected", async () => {
  const losartan = await cum("19996998-1");
  assert.deepEqual(failed(verifyCumMapping("Losartán 100 mg tabletas", losartan)), ["STRENGTHS"]);
  assert.deepEqual(failed(verifyCumMapping("Losartán 50 mg jarabe", losartan)), ["FORM"]);
  assert.deepEqual(failed(verifyCumMapping("Losartán 50 mg tabletas x 200", losartan)), ["PRESENTATION"]);
});

test("an inactive CUM, or one the source doesn't have, is rejected", async () => {
  const inactive = await cum("217467-12");
  assert.ok(failed(verifyCumMapping("Hyzaar losartán hidroclorotiazida 50/12.5 mg tabletas", inactive)).includes("CUM_ACTIVE"));
  assert.deepEqual(failed(verifyCumMapping("Losartán 50 mg tabletas", undefined)), ["CUM_EXISTS"]);
});

test("an ingredient name the rules can't read fails closed", async () => {
  const result = verifyCumMapping("Telmisartán amlodipino 80/5 mg cápsulas", await cum("20128508-6"));
  assert.equal(result.status, "REJECTED");
  assert.match(result.checks.find((check) => check.check === "INGREDIENTS")!.detail, /not checkable/);
});

test("the SKU's other words never satisfy a check on their own", async () => {
  // A gift card that mentions a medicine name without a strength or a form.
  const result = verifyCumMapping("Tarjeta regalo — vale por losartán", await cum("19996998-1"));
  assert.equal(result.status, "REJECTED");
  assert.equal(foldText("Acetaminofén 500,5 mg"), "ACETAMINOFEN 500.5 MG");
});

test("PARACETAMOL names INVIMA's ACETAMINOFEN", async () => {
  assert.equal(verifyCumMapping("Paracetamol 500 mg tabletas x 20", await cum("52478-2")).status, "VERIFIED");
});
