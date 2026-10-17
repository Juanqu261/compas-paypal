# Seeds

Reference data loaded by the backend. Demo scenarios live in `fixtures/demo/` instead.

- `category-mappings/`: versioned tables that map CIIU Rev. 4 A.C. codes and license types to COMPAS categories. Each file says how far it has been verified. A malformed table stops the backend at startup.
- `category-sources/demo-sources.json`: the two simulated Nequi Negocios evidence sources, labeled `demo/test data`. The file names a `keyRef`, not a key. The backend generates the key at startup.
