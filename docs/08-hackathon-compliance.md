# Hackathon compliance

COMPAS is an entry for the Interledger Open Payments Hackathon 2026 in Medellín. This file records the repository requirements the team is building against. An official rules URL was not verified while writing this scaffold: TODO.

## Requirements that affect this repository

- The submission is a public GitHub repository.
- The submission needs a working proof of concept.
- Eligibility requires an actual Open Payments integration. This scaffold does not contain one. A later prompt must implement it against the test environment. Simulated ARQ or Nequi screens do not satisfy that requirement.
- The demo must visibly show a payment request, authorization, payment execution, and successful completion. Those steps are not implemented yet.
- AI usage is disclosed in `AI_USAGE.md`.
- The exact prompts used for coding are stored under `prompts/`.
- The team must review and understand all AI-generated work before submission. This repository does not claim that any file was written without AI assistance.

## What this scaffold already satisfies

- `AI_USAGE.md` exists and can take later entries for Cursor, ChatGPT, Claude, Gemini, or another tool.
- `prompts/001-repository-foundation.md` is the prompt for the original foundation.
- `prompts/002-monorepo-restructure.md` is the prompt for the monorepo restructure.
- The architecture keeps a real Open Payments gateway possible without pretending it already works.
- The denied-payment invariant is tested so a later integration cannot "succeed" a rejected purchase by calling `createOutgoingPayment`.

## What is still required for eligibility

- A real Open Payments client, using the variable names in `backend/.env.example`.
- A visible flow on `/demo`: request, authorization, execution, completion.
- The medication path completing a payment from Pedro's wallet to the merchant wallet.
- The alcohol path stopping with no outgoing payment.
- Team review of every AI-generated change, recorded by appending to `AI_USAGE.md` when a tool's role changes.

## Submission checklist

- [ ] Repository is public.
- [ ] `AI_USAGE.md` lists every AI tool that materially contributed.
- [ ] `prompts/` contains the exact prompt for each coding session.
- [ ] The team has read and can explain the Open Payments flow in the demo.
- [ ] The demo shows a payment request.
- [ ] The demo shows payer authorization.
- [ ] The demo shows payment execution through Open Payments.
- [ ] The demo shows successful completion.
- [ ] The alcohol rejection creates no outgoing payment.
- [ ] No screen presents a fixture or a simulation as a live bank integration.
- [ ] No secrets, private keys, or health data are committed.
- [ ] ARQ, Nequi, and Nequi Negocios are described as simulations.
