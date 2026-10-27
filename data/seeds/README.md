# Seeds

Reference data the backend loads. A malformed file stops the backend at startup.

| Folder | What | Label |
| --- | --- | --- |
| `category-mappings/` | CIIU codes and licenses mapped to COMPAS categories | reviewed config |
| `trust-matrix/` | Cells and thresholds of the trust matrix | reviewed config |
| `category-sources/` | `compas-sources.json`: the analyst and onboarding sources, always registered. `demo-sources.json`: the simulated Nequi Negocios and Cámara sources | demo/test data |
| `merchant-registry/` | 1,900 real RUES establishments, CC BY-SA 4.0 (`npm run registry:fetch`) | public data |
| `cum/` | A subset of INVIMA's CUM rows, copied verbatim from datos.gov.co, for tests and offline demos | demo/test data |
| `merchant-catalogs/` | The demo merchants' catalogs, including the lookalike pharmacy | demo/test data |
| `camara/` | The simulated Cámara de Comercio: certificates and their records | demo/test data |
