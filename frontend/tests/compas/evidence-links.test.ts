import assert from "node:assert/strict";
import test from "node:test";
import {
  elasticIndexLink,
  elasticQueryLink,
  invimaRecordLink,
  supabaseFlagsLink,
  supabaseSchemaLink,
} from "../../src/features/demo/evidence-links.ts";

const KIBANA = "https://example.kb.us-central1.gcp.elastic.cloud";
const configured = { kibanaUrl: KIBANA, cumIndex: "compas-cum-v1", supabaseProjectRef: "projectref" };
const bare = { cumIndex: "compas-cum-v1" };

test("INVIMA's record is linked by the CUM's expediente on datos.gov.co, and only for a well-formed CUM", () => {
  assert.equal(invimaRecordLink("19938491-1"), "https://www.datos.gov.co/resource/i7cb-raxc.json?expedientecum=19938491");
  assert.equal(invimaRecordLink("1&$limit=1-1"), undefined);
});

test("the Elastic links name the index, and the query holds only the run's well-formed CUMs", () => {
  assert.equal(elasticIndexLink(configured), `${KIBANA}/app/management/data/index_management/indices/index_details?indexName=compas-cum-v1`);
  const query = elasticQueryLink(configured, ["19938491-1", "19938491-1", "bad\" OR 1"]);
  assert.ok(query?.startsWith(`${KIBANA}/app/discover#/?_a=`));
  const state = decodeURIComponent(query!.split("_a=")[1]);
  assert.equal(state, `(dataSource:(type:esql),query:(esql:'FROM compas-cum-v1 | WHERE cum IN ("19938491-1") | KEEP cum, product, form, presentation'))`);
  assert.equal(elasticQueryLink(configured, []), undefined, "no picked CUM, no query");
});

test("an unconfigured console gets no link", () => {
  assert.equal(elasticIndexLink(bare), undefined);
  assert.equal(elasticQueryLink(bare, ["1-1"]), undefined);
  assert.equal(supabaseSchemaLink(bare), undefined);
  assert.equal(supabaseFlagsLink(bare), undefined);
});

test("the Supabase links open the compas schema and a read-only query of the analyst's flags", () => {
  assert.equal(supabaseSchemaLink(configured), "https://supabase.com/dashboard/project/projectref/editor?schema=compas");
  const sql = decodeURIComponent(new URL(supabaseFlagsLink(configured)!).searchParams.get("content") ?? "");
  assert.match(sql, /^select [\s\S]*\sfrom compas\.trust_log_entries\s/);
  assert.match(sql, /source_id = 'compas-analyst'/);
});
