# Seeds

Reference data loaded by the backend. Demo scenarios live in `fixtures/demo/` instead.

- `category-mappings/`: versioned tables that map CIIU Rev. 4 A.C. codes and license types to COMPAS categories. Each file says how far it has been verified. A malformed table stops the backend at startup.
- `merchant-registry/rues-medellin.json`: 1,900 real establishments from the Confecámaras RUES open data (CC BY-SA 4.0), regenerated with `npm run registry:fetch` in `backend/`. Public registry data, not yet loaded by the backend. See its README.
- `category-sources/demo-sources.json`: the two simulated Nequi Negocios evidence sources, labeled `demo/test data`. The file names a `keyRef`, not a key. The backend generates the key at startup.
