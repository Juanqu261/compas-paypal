# Merchant registry (RUES extract)

`rues-medellin.json` lists 1,900 real establishments of the Cámara de Comercio de Medellín para Antioquia. It is public registry data: not `demo/test data`, and not a COMPAS attestation. Regenerate it with `npm run registry:fetch` in `backend/`.

**Source and license.** Confecámaras RUES on datos.gov.co: establishments (`nb3d-v3n7`) and owners (`c82u-588k`), CC BY-SA 4.0. Credit it as "Fuente: Confecámaras, RUES, datos.gov.co".

**Selection.** Shops that are `ACTIVA`, renewed in 2026, with a mapped main CIIU code: 900 of code 4773, 400 of 4724, and 120 for each food code. Rows are picked by SHA-256 rank, so a re-run is stable.

**Privacy.** A natural person's NIT is their cédula (Ley 1581 de 2012). For those owners (1,465 shops), the file keeps no identifier and no name. Company NITs and names are kept.

## What it shows

These are observations from shop names. They are not evidence.

- CIIU 4773 isn't "pharmacy". Only 49% of the sampled 4773 shops have DROGUERÍA, FARMACIA or DROGAS in their name; the rest are mostly cosmetics shops and opticians.
- A shop's registered activity can contradict its name, and it can differ from its owner's activity.
- Don't name a real shop as suspicious in the pitch.

## How the backend uses it

`JsonBusinessRegistryLookup` serves it to `RegistryDbFeed` (provenance `datos-gov-co/nb3d-v3n7`). Nothing calls it at startup yet.

- A match through a NIT the shop typed itself is `REGISTRY_UNBOUND`, never above `MEDIUM`. On PayPal, `HIGH` needs the Cámara binding ([ADR 0009](../../../docs/adr/0009-ai-analyst-evidence.md)).
- Only company-owned shops can be found: an empty result means "not in the sample".
- A claim is about the NIT, so a chain's NIT returns all of its shops.

Open pharmacy-license lists exist for Risaralda, Casanare, Norte de Santander and Valle, but none for Antioquia.
