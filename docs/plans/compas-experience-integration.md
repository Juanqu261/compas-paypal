# Integrating the COMPAS experience with main

`feature/compas-experience` (`a993862`) merged into `integration/compas-experience`, which started at `origin/main` (`e3f0aea`). Merge base: `8a1aa24`. The feature was built before main added Postgres adapters and the atomic budget reservation, so most of the work below fixes conflicts in behavior, not in text.

Each conflict was resolved by hand. No side was taken wholesale.

## Conflicts in text

| File | Main | Feature | Decision | Test |
| --- | --- | --- | --- | --- |
| `backend/src/ports/mandate-repository.ts` | Added `reserveCapacity` and `releaseCapacity` | Added `listByPayer` and `listByDelegate` | Both, plus `transitionStatus` (see below). `save` only creates a mandate | `mandate-integration.test.ts`, Postgres adapter tests |
| `backend/src/ports/unimplemented-repositories.ts` | The two reservation stubs | The two listing stubs | All seven methods throw `NotImplementedError` | Typecheck |
| `backend/src/api/server.ts` | Postgres when `DATABASE_URL` is set, `PostgresGrantStore`, the category and history factories | Demo identity, mandate routes, the finish hook that activates a mandate, an in-memory mandate store | One composition: main's storage choice for every port, the feature's routes and identity. One grant store, passed to the gateway and to `MandateService` | `/health` on Postgres, browser checks |
| `contracts/README.md` | Listed `data-model/` | Listed `mandates/` | Both | — |
| `AI_USAGE.md` | Postgres adapters entry | COMPAS experience entry | Both entries, plus one for this integration. The feature's prompt link now points to `015` | `ai_rules.py check` (see below) |

## Conflicts in behavior

### Two in-memory mandate repositories

Main added `integrations/mandates/in-memory-mandate-repository.ts` for the reservation. The feature had `in-memory-mandate-store.ts` for its listings. Kept main's file and added the listings and `transitionStatus` to it. Deleted the feature's store.

### A full save would undo a reservation

The feature changed status by reading a mandate and calling `save` with the new status. Main's `save` writes `remaining_value`, and `purchaseUnderMandate` reserves capacity between those two steps. A revocation or activation would have given the reserved capacity back.

Added `MandateRepository.transitionStatus(id, from, to)`: one conditional update of the status alone (`where status = any(from)`), on both adapters. `MandateService` uses it for every status change, and uses `save` only to create a mandate.

Test: "transitionStatus changes the status only, so a reservation made after the read survives", "activation, expiry and revocation never restore capacity a purchase reserved", and the same check on Postgres.

### `EXHAUSTED` was stored

The feature stored `EXHAUSTED` when capacity reached zero. Main's `releaseCapacity` gives capacity back when a payment can't be created, but a stored `EXHAUSTED` would keep the mandate unusable. `EXHAUSTED` is now computed on read (`displayStatus`): an `ACTIVE` mandate with no capacity left. The database never holds it.

Test: "a mandate with no capacity left shows EXHAUSTED and comes back when a reservation is released".

### Two records of the grant

The feature kept consent and cancellation state in its own `MandateAuthorizationStore`. Main stores the grant itself in `compas.payer_grants`. Two records can disagree.

Removed `MandateAuthorizationStore`. `consent` and `grantCancellation` are now derived from the grant store and the mandate's audit events (`compas.audit_events`). Audit payloads hold error codes only.

Test: "consent comes from the grant store and the audit log, not a second copy", "a failed cancellation keeps the grant stored, reports PENDING, and a retry finishes it".

### Activation needs a stored, verified grant

`completeAuthorization` now activates a mandate only when the stored grant is `ACTIVE`, which only `finishPayerGrant` writes after it verified the finish hash. `?payerAuthorization=granted` in a URL proves nothing. If the finish hook never ran, the next read activates the mandate from the stored grant, through the same conditional update.

Test: the mandate tests now call the gateway double's `finishGrant` before `completeAuthorization`, and assert `IGNORED` for a `PENDING` grant. Browser: `/arq?payerAuthorization=granted&grantKey=mandate-forged` activates nothing.

### Mandates in memory, grants in Postgres

With `DATABASE_URL`, main's server stores grants in `compas.payer_grants`, which has a foreign key to `compas.mandates`. The feature's mandates were in memory, so a grant insert would have failed. `MandateService` now uses `PostgresMandateRepository`, `PostgresSpendingLog` and `PostgresAuditRepository` when `DATABASE_URL` is set. `PostgresMandateRepository.save` upserts the three parties first, as `compas.parties` requires.

Test: "mandate service on Postgres: activation from the shared grant store, revocation keeps the reservation", run on a throwaway Postgres.

### Demo sessions and real grants

Anyone can start a demo session as Pedro. With Open Payments configured, that session could have asked Pedro's real wallet for a grant. `readDemoPayerGrantsMode` in `api/demo-identity.ts` now blocks it unless `COMPAS_DEMO_PAYER_GRANTS=enabled` and both `CLIENT_WALLET_ADDRESS` and `DEMO_PAYER_WALLET_ADDRESS` are on `interledger-test.dev`. It is never enabled with `NODE_ENV=production`. Blocked, authorize answers `403 PAYER_GRANTS_DISABLED_FOR_DEMO` before the wallet is contacted. `/health` and `/me` report `payerGrants`.

Test: "a demo session can't ask a real wallet for a grant unless the operator opted in", and the API tests for the mode, including a host that only looks like the test network.

### The tienda's demo mandates and Pedro's

Main's seed writes 12 `demo-food-mandate-N` mandates for `demo-food-payer-N`. `listByPayer` filters by `payer_id`, so Pedro's screens never show them.

Test: checked through `GET /mandates?role=payer` on Postgres after the seed ran.

### Prompt numbers

Main already had `prompts/014-postgres-adapters.md`. The feature's `014-compas-experience.md` became `015-compas-experience.md`. This integration's prompt is `016-compas-integration.md`.

### Frontend

The contract types gained `persistence: "POSTGRES"` and `payerGrants`, `errorText` has a Spanish message for `PAYER_GRANTS_DISABLED_FOR_DEMO`, and the demo-mode note covers Postgres storage. `frontend/src/features/nequi-business/` was not changed.

## Local main

Local `main` had two commits that `origin/main` did not: `cb30773` (COMPAS merchant settings in Nequi Negocios) and `72faff3` (its merge with the site redesign). They were merged into the integration branch after the commit above, so that `main` could move forward without losing them.

| File | Local main | Integration | Decision |
| --- | --- | --- | --- |
| `AI_USAGE.md` | Moved the entries under the sections `ai_rules.py check` requires, and added the Nequi Negocios COMPAS entry | Added the Postgres, COMPAS experience and integration entries | Main's structure with every entry from both sides. The prompt list under "Prompt Log" now names every file in `prompts/`. The "What We Did Ourselves" note that Open Payments was not integrated was out of date and now names the real adapter |
| `prompts/009-nequi-negocios-compas.md` | Prompt 009 | `origin/main` already had `009-compas-smoke.md` | Renamed `017-nequi-negocios-compas.md`. The entry says so |

`frontend/src/features/nequi-business/` merged without conflicts. The COMPAS module doesn't import it, and it doesn't import the COMPAS module.

Three entries link prompt files that are not in the repository: `005-open-payments-integration.md` and `007-merchant-category-service.md` never existed, and `010-merge-main.md` was deleted in `9b491bd`. That was already the case on `origin/main` and is left to the team.

## Verification

| Check | Result |
| --- | --- |
| Backend `npm ci`, `typecheck`, `test` | Pass. 252 tests: 240 pass, 12 skipped (the Postgres adapter tests without `TEST_DATABASE_URL`) |
| Postgres adapter tests on a throwaway PGlite with `data/migrations/` applied | 11 pass, 1 skipped (the registry is not loaded) |
| Frontend `npm ci`, `lint`, `typecheck`, `test`, `build` | Pass |
| Browser, headless Chrome, backend on the throwaway Postgres | `/`, `/demo`, `/arq`, `/nequi` and `/nequi-negocios` render with no console errors and no horizontal scroll. A budget is created in ARQ, its authorization fails with a clear message (no Open Payments credentials), a forged consent hint activates nothing, and the budget survives a backend restart |

Not checked: a real wallet consent end to end, and the Postgres tests against the team's Supabase project. No migration was run, nothing was written to Supabase and no payment was made.

`ai_rules.py check` failed on `origin/main` before this merge: four sections were missing from `AI_USAGE.md`. After the merge with local `main` it passes.
