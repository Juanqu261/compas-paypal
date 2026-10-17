# 011 — Merchant trust matrix

Tool: Claude Code (Claude Opus 5.5), 2026-10-16.

These are the verbatim user prompts from the session that produced `docs/plans/trust-matrix.md`, `docs/adr/0007-merchant-confidence-matrix.md` and the trust matrix in the backend. Prompt 1 produced the plan only. Prompt 2 changed the framing and asked for the implementation.

## 1

```text
im working in the backend for compas, the current state of this branch is merged with main where the main frontend changes are being develop (this integration is out of scope for now). The task now is to build a plan to create a the trust matrix that compas will use to give a deterministic value to say if a shop alligns or has the "trust" to be acredited with a category. In parallel other branch is searching and building the database where later we will store the camara y comercio associated shops economic activities, the shops registered here will come with a secure category (that can still not be completly true) if the shop is not registered here (tienda de barrio) or as a plus to that we intend to add historic data to build that deterministic matrix, so for example is a shop has made multiple sells associated (and approved) with the category pharmacy that would tell us that they actually sell those related items. Mixing these values in a deterministic way i want to analyze how can we resolve and integrate this. Remember the DB is out of scope yet so assume it exists and its contract, when the db is actually shift we may need to change its contract
```

## 2

```text
Notices that this claim: ADR 0005 says: *"Volume never raises trust, and behavior only lowers it."* The reason is collusion. A group of shops, or a shop and fake customers, could manufacture history until they became eligible. Using approved pharmacy sales as positive evidence touches that rule directly. It now turned a little, as we say a shop can state its own categories, at its registration, then we assign a confidence level (the result of the matrix) based on camara comercio and the historic intended data. Make that change and implement the plan
```
