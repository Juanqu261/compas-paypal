# Merchant registry (RUES extract)

`rues-medellin.json` holds 1,900 real establishments registered with the Cámara de Comercio de Medellín para Antioquia. It is public registry data, not `demo/test data` and not a COMPAS attestation. `JsonBusinessRegistryLookup` serves it to the backend through the `BusinessRegistryLookup` port (ADR 0007). Nothing calls it at startup yet.

Regenerate it from `backend/`:

```text
npm run registry:fetch
```

## Source

Confecámaras publishes extracts of the RUES (Registro Único Empresarial y Social) on datos.gov.co. They are refreshed monthly under CC BY-SA 4.0:

- [Establecimientos - Agencias - Sucursales](https://www.datos.gov.co/d/nb3d-v3n7) (`nb3d-v3n7`) lists each shop with its name, its main CIIU code plus up to three secondary ones, its status, its last renewal and its owner's identifier.
- [Personas Naturales, Personas Jurídicas y Entidades Sin Animo de Lucro](https://www.datos.gov.co/d/c82u-588k) (`c82u-588k`) lists the owners.

Both are queryable through the Socrata API (SoQL) with no key. This corrects an earlier research note that RUES could only be checked one NIT at a time.

**License.** This file is derived from those datasets, so it is also CC BY-SA 4.0. Credit it as "Fuente: Confecámaras, RUES, datos.gov.co" wherever it is shown.

## What's in it

The script keeps establishments that meet all of these conditions:

- registered with `MEDELLIN PARA ANTIOQUIA`
- status `ACTIVA`
- renewed in 2026
- a main CIIU code that is in `../category-mappings/ciiu-rev4-ac.json`

For each code, it ranks rows by SHA-256 of `registryKey` and keeps the first N. A re-run against the same dataset version returns the same rows.

| Main CIIU | COMPAS categories (mapping 2026-10-16.1) | Active in Medellín | Kept |
| --- | --- | ---: | ---: |
| 4773 | `MEDICATION`, `PERSONAL_CARE` | 5,013 | 900 |
| 4724 | `ALCOHOL`, `TOBACCO` | 1,413 | 400 |
| 4711 | `FOOD` | 10,172 | 120 |
| 4721 | `FOOD` | 1,067 | 120 |
| 4722 | `FOOD` | 283 | 120 |
| 4723 | `FOOD` | 1,586 | 120 |
| 4729 | `FOOD` | 1,163 | 120 |

A record looks like this. Categories are not precomputed. The backend maps CIIU codes at resolution time.

```json
{"registryKey":"21-52577802","name":"DISLICORES STORE EL TESORO","registrationType":"ESTABLECIMIENTO_DE_COMERCIO","ciiu":{"primary":"4711","secondary":[]},"registeredOn":"2012-03-06","renewedOn":"2026-03-18","owner":{"type":"PERSONA_JURIDICA","nit":"890916575","checkDigit":"4","name":"DISTRIBUIDORA DE VINOS Y LICORES S.A.S.","legalForm":"SOCIEDADES POR ACCIONES SIMPLIFICADAS SAS","ciiuPrimary":"4632"}}
```

- `registryKey` combines the cámara code and the establishment's matrícula. It's a registry id, not a PayPal account.
- `owner` is `PERSONA_JURIDICA` with its NIT for 435 shops, and `PERSONA_NATURAL` with no identifier for the other 1,465.
- The dataset has no address or municipality.

## Privacy

A natural person's NIT is their cédula, which is personal data under Ley 1581 de 2012. For those owners the file keeps no NIT, no cédula and no owner matrícula, and it never stores the owner's name. Company NITs and names are kept. Legal representatives are left out.

Shop names stay as registered. A few contain a person's name.

## What it shows

These figures come from name keywords. They are not evidence, and the backend must not use them as evidence.

- **CIIU 4773 does not mean pharmacy.** Of the 900 sampled 4773 shops, 445 (49%) have DROGUERÍA, FARMACIA or DROGAS in their name. Most of the rest are perfume, cosmetics and beauty shops or opticians. This is the gap ADR 0005 describes: for `MEDICATION`, the pharmacy license is the evidence that separates them.
- **Registered activity can contradict the name.** Some shops named as liquor stores are registered under 4711 or 4729, which map to `FOOD`. Some have 4724 only as a secondary code.
- **The shop's CIIU can differ from its owner's.** A chain's pharmacies carry 4773 while the franchisor that owns them is registered under 7740.

Don't name a real shop in the pitch as suspicious. The registry shows what a shop registered, not what it did.

## How the backend uses it

`backend/src/integrations/category-sources/json-business-registry-lookup.ts` implements `findByNit` over this file for `RegistryDbFeed`. Its provenance is `datos-gov-co/nb3d-v3n7`, and it needs a source registered for that provenance (`BUSINESS_REGISTRY`, `PULL`). Each establishment becomes one record. `snapshotAt` is the dataset's update date, and `lastRenewalYear` is the extract's filter year.

- **Confidence (ADR 0007).** A registry match only corroborates a category the shop declared itself. Through a NIT the shop typed itself it is `REGISTRY_UNBOUND`, which never gives more than `MEDIUM`. Only a binding from the wallet provider lifts it.
- **Only company-owned shops are reachable.** The 1,465 shops owned by natural persons have no NIT here, so `findByNit` finds nothing for them. An empty result means "not in the sample", not "not registered". The full dataset could be queried live by NIT instead, without storing cédulas.
- **A claim is about the NIT, not the shop.** A chain's NIT returns all its shops. For example, Distribuidora Pasteur has 28 shops under 4773 and 5 under 4724 in this sample. If its NIT is bound to one wallet, that wallet carries both `MEDICATION` and `ALCOHOL` registry evidence.
- **Demo merchants stay fictional.** Don't bind a real shop to a demo wallet without labeling it, or the demo implies the shop uses COMPAS.

## Pharmacy licenses

The health-authority registration is the evidence that is specific to `MEDICATION`. A datos.gov.co catalog search on 2026-10-16 found open pharmacy-establishment lists for these departments:

- Risaralda (`x62z-xik8`)
- Casanare (`25qg-4vq6`)
- Norte de Santander (`2btt-9z2g`)
- Valle del Cauca, UESVALLE (`fu4r-irvu`, `hbf3-nvn9`)

None was found for Antioquia or Medellín. Only the titles were read, not the contents. The Cámara de Comercio del Oriente Antioqueño has a 2023 list of pharmacies and naturist shops (`acdj-kesr`), but that is registry data, not a license.
