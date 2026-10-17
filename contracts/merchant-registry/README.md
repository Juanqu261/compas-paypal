# Merchant registry contract — PROVISIONAL

This is the shape COMPAS **assumes** for the Cámara de Comercio registry database being built on another branch. It is not that database's real schema. When the real contract lands, change this file, `backend/src/ports/business-registry-lookup.ts`, `backend/src/integrations/category-sources/registry-db-feed.ts` and that adapter's test fixtures. Nothing else in the backend reads registry rows.

Design: `docs/plans/trust-matrix.md` and `docs/adr/0007-merchant-confidence-matrix.md`.

## Lookup

COMPAS asks for every registered business with a NIT. It sends the normalized base, without the check digit. The raw NIT is used only for this lookup. The trust log keeps only an HMAC.

```ts
findByNit(normalizedNit: string): Promise<RegistryMerchantRecord[]>
```

## Record

```json
{
  "nit": "800197268-4",
  "matricula": "21-123456-01",
  "camara": "CCMA",
  "status": "ACTIVE",
  "lastRenewalYear": 2026,
  "activities": [
    { "ciiu": "4773", "role": "PRIMARY" },
    { "ciiu": "4711", "role": "SECONDARY" }
  ],
  "snapshotAt": "2026-10-01T00:00:00Z",
  "provenance": "rues-lookup"
}
```

The example uses DIAN's own public NIT as a test vector. It is not registry data.

| Field | Meaning |
| --- | --- |
| `nit` | NIT, with or without the check digit |
| `matricula` | Matrícula mercantil number |
| `camara` | The Cámara that holds it |
| `status` | `ACTIVE`, `INACTIVE` or `CANCELLED` |
| `lastRenewalYear` | Last renewal. The claim is valid until the renewal deadline that follows, believed to be 31 March (unverified) |
| `activities` | One main CIIU Rev. 4 A.C. activity and up to three secondary ones |
| `snapshotAt` | When the row was captured from its origin |
| `provenance` | How the row was obtained. COMPAS registers one source per provenance, with its own trust level |

## How COMPAS uses a record

- `ACTIVE`, inside its renewal: a `CATEGORY_CLAIM` about the NIT, with roles kept, ingested through `ingestCategoryClaim` as a pull source.
- `INACTIVE` or `CANCELLED`: a `REVOCATION` of that renewal's claim.
- `ACTIVE` but past its renewal deadline: nothing. The earlier claim expires.

A registry claim reaches a wallet only through an identity binding. Through a NIT the merchant typed itself, it gives `REGISTRY_UNBOUND` corroboration and never more than `MEDIUM` confidence.

## Questions for the database branch

- Is primary vs secondary activity available for every row?
- Which provenances will exist (official RUES lookups, bulk datasets, uploaded certificates), and how fresh is each?
- Can one NIT have several matrículas or establishments, and should each be its own record?
- Is the renewal deadline 31 March for every Cámara?
