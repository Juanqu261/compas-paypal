# COMPAS — Nequi Negocios COMPAS Merchant Integration
# Scope: frontend-only merchant enrollment/configuration experience

You are working inside the existing COMPAS monorepo.

This is a FOLLOW-UP to the completed Nequi Negocios UI recreation.

The Nequi Negocios host UI is already working and should NOT be recreated.

The objective of this task is to integrate COMPAS into Nequi Negocios as a
native merchant capability, primarily through the existing "Conoce más" section.

This task is FRONTEND ONLY.

Do NOT implement the real COMPAS backend flow yet.
Do NOT implement Open Payments yet.
Do NOT turn COMPAS into a payment method.

============================================================
0. REQUIRED CONTEXT — READ BEFORE ANY EDIT
============================================================

Before modifying anything, inspect the current repository and read:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `README.md`

Then:

4. `.AGENTS/README.md`
5. `.AGENTS/product.md`
6. `.AGENTS/architecture.md`
7. `.AGENTS/development.md`
8. `.AGENTS/open-payments.md`
9. `.AGENTS/hackathon.md`

Then:

10. `.skills/compas-context/SKILL.md`
11. `.skills/compas-context/REFERENCE.md`
12. `.skills/hackathon-ai-rules/SKILL.md`
13. `.skills/hackathon-ai-rules/REFERENCE.md` where needed

Then inspect ALL current files under:

`frontend/src/features/nequi-business/`

Pay particular attention to:

- `NequiBusinessExperience.tsx`
- `NequiBusinessHome.tsx`
- `NequiBusinessBottomNav.tsx`
- `NequiBusinessScreen.tsx`
- `nequi-business-demo-content.ts`

Also inspect:

- `frontend/src/features/demo/DemoSession.tsx`
- `frontend/src/features/demo/DemoStage.tsx`
- `frontend/src/features/nequi/`
- `frontend/src/features/arq/`

The ARQ and Nequi consumer COMPAS integrations are useful references for
interaction architecture, but do NOT copy their visual systems into
Nequi Negocios.

Also read:

- `docs/00-product-vision.md`
- `docs/01-demo-story.md`
- `docs/02-domain-model.md`
- `docs/03-architecture.md`
- `docs/05-policy-engine.md`
- `docs/06-ai-classification.md`
- `docs/07-security-privacy-ethics.md`

Before coding, understand these invariants:

- COMPAS moves permission, not money.
- COMPAS is not another wallet.
- COMPAS is not a payment rail.
- COMPAS is not a merchant payment method.
- AI never authorizes a transaction.
- Merchant self-declaration is NOT equivalent to verification.
- Purpose categories belong to COMPAS, not Open Payments.
- Open Payments must never be faked.

============================================================
1. PROMPT LOG / AI DISCLOSURE
============================================================

Before implementation:

1. Inspect `/prompts`.
2. Determine the next available numbered prompt.

Expected if available:

`prompts/007-nequi-negocios-compas.md`

If `007-*` already exists, increment the number.

Never overwrite an existing prompt.

Save THIS ENTIRE PROMPT verbatim.

Then update `AI_USAGE.md` according to the hackathon AI skill.

Disclose Claude Code / Claude Opus 5.5 assistance for:

- merchant-side COMPAS UX
- Nequi Negocios "Conoce más" implementation
- COMPAS merchant configuration UI
- local frontend configuration state

Do not claim backend integration.
Do not claim Open Payments integration.
Do not claim real Nequi merchant verification.

============================================================
2. CURRENT STATE — PRESERVE IT
============================================================

The existing Nequi Negocios recreation is already approved as a useful base.

Preserve:

HOME:
- Daniel Ossa greeting
- "¿Cómo quieres cobrar?"
- Tarjeta
- Link pago
- QR·Bre-B
- Ventas del día

SALES:
- Resumen de ventas

COLLECTION:
- NFC fallback sheet
- QR sheet

LINK:
- Link de pagos screen

BOTTOM NAV:
- Inicio
- Ventas
- Conoce más

Do NOT recreate these screens.

Do NOT substantially restyle them.

Do NOT change the existing collection-card semantics.

============================================================
3. CRITICAL PRODUCT RULE
============================================================

COMPAS MUST NOT become:

Tarjeta | Link pago | QR·Bre-B | COMPAS

That model is WRONG.

COMPAS is not how the merchant receives the money.

The merchant still uses an ordinary collection method.

Conceptually:

Customer initiates payment
        ↓
QR / compatible payment method
        ↓
COMPAS checks purpose eligibility
        ↓
if ALLOW
        ↓
Open Payments executes payment

For the merchant:

"COMPAS lets my business accept purpose-restricted spending."

Not:

"COMPAS is another way to charge."

============================================================
4. ENTRY POINT — "CONOCE MÁS"
============================================================

The existing:

`Conoce más`

bottom-navigation button currently has no meaningful screen.

Implement it.

The bottom navigation should now support at minimum:

HOME
MORE

`Ventas` may continue opening its existing pushed Sales Summary screen.

When the user taps:

`Conoce más`

show a native Nequi Negocios services/tools screen.

Do not make it a generic COMPAS dashboard.

Recommended visual structure:

Status bar

Title:
`Conoce más`

Section:
`Servicios para tu negocio`

Native service card / row:

Compass-like icon

`COMPAS`

Subtitle:

`Recibe pagos con propósito`

Optional small status when configured:

`Activo`

The COMPAS item should visually belong to Nequi Negocios.

Do not use the green/blue COMPAS brand treatment as a large advertisement.

============================================================
5. BOTTOM NAV STATE
============================================================

Refactor `NequiBusinessBottomNav` cleanly so it can represent an active tab.

For example conceptually:

type NequiBusinessTab =
  | "home"
  | "more";

or another simple model.

Expected behavior:

HOME
- Inicio selected

MORE
- Conoce más selected

Sales may remain a pushed screen matching the screenshot rather than a persistent tab.

Do not over-engineer routing.

This is local frontend navigation.

============================================================
6. COMPAS MERCHANT SCREEN
============================================================

When the merchant taps the COMPAS service:

open an in-app pushed screen using the same navigation pattern already used
for Sales Summary and Link de pagos.

Recommended title:

`COMPAS`

Subtitle / headline:

`Recibe pagos con propósito`

Supporting copy:

`Cobras como siempre. COMPAS valida si el propósito autorizado por el cliente coincide con las categorías habilitadas de tu negocio.`

Keep the copy concise and understandable.

The screen represents merchant-side configuration.

It is NOT:
- an admin analytics dashboard
- a payment screen
- an Open Payments console
- a developer tool

============================================================
7. COMPAS STATUS
============================================================

Create a native status card.

Example:

`COMPAS en tu negocio`

Status:

`Activo`

with an on/off control.

The merchant should be able to toggle:

`Aceptar pagos con COMPAS`

For the demo, default this to ON because Droguería Central already participates
in COMPAS in the product story.

IMPORTANT:

This toggle is LOCAL DEMO UI STATE ONLY.

It must NOT be described in code as a real backend enrollment.

Do not modify the COMPAS domain or merchant registry.

============================================================
8. BUSINESS IDENTITY
============================================================

The Nequi Negocios account currently greets:

`Daniel Ossa`

Keep that.

Interpretation:

Daniel Ossa = account owner / merchant user.

COMPAS configuration should show the establishment separately:

`Droguería Central`

For example:

### Tu negocio

Droguería Central

`Perfil comercial`

This makes the relationship clear:

Daniel Ossa
    owns/manages
Droguería Central

Do NOT replace the existing home greeting.

============================================================
9. MERCHANT CATEGORIES
============================================================

Add a section:

`Categorías que aceptas con COMPAS`

The UX should make clear that a business may support multiple purposes/categories.

For this hackathon demo, provide a small local set such as:

- `Medicamentos`
- `Cuidado personal`
- `Salud y bienestar`

The primary demo category is:

`Medicamentos`

and should be selected by default.

Use a human-readable Spanish label in the UI.

Do not display the backend enum `MEDICATION` as the main user-facing label.

In code, mapping to:

`MEDICATION`

is acceptable if needed later.

============================================================
10. SELF-DECLARATION IS NOT VERIFICATION
============================================================

This is a critical product rule.

A merchant checking:

`Medicamentos`

does NOT by itself prove that the merchant is eligible.

Do NOT present:

"Medicamentos — Verificado por Nequi"

unless actual verification exists.

Instead, communicate something like:

`Tus categorías se contrastarán con la información disponible de tu negocio y de cada compra.`

or:

`COMPAS usa la información de tu negocio y de la transacción para validar cada pago.`

Keep this concise.

Do not expose internal implementation jargon such as:

SELF_DECLARED
PROVIDER_VERIFIED
EXTERNAL_VERIFIED

to the normal merchant UI unless shown in an optional information section.

============================================================
11. HOW IT WORKS
============================================================

Add a compact explanatory section.

Recommended title:

`¿Cómo funciona?`

Three small steps:

1.
`Configura tus categorías`

2.
`Cobra como siempre`

3.
`COMPAS valida automáticamente`

Important merchant message:

The merchant does NOT need:
- a special COMPAS QR
- a COMPAS card reader
- a COMPAS wallet
- a separate app

Their ordinary collection surface remains the same.

============================================================
12. SAVE CONFIGURATION
============================================================

Add a primary action:

`Guardar configuración`

The button should update LOCAL frontend state.

After save:

- preserve the enabled state
- preserve selected categories
- show an `Activo` status when returning to `Conoce más`

The state should survive navigation:

COMPAS settings
→ back
→ COMPAS settings

during the same mounted experience.

Therefore the state should live at an appropriate parent level, likely:

`NequiBusinessExperience`

rather than being recreated every time the COMPAS screen mounts.

No browser persistence is required.

Do NOT use localStorage unless there is a compelling reason.

============================================================
13. SUGGESTED STATE SHAPE
============================================================

A small local state is enough.

Conceptually:

type MerchantCompasConfig = {
  enabled: boolean;
  categories: MerchantCompasCategory[];
};

Possible demo categories:

type MerchantCompasCategory =
  | "MEDICATION"
  | "PERSONAL_CARE"
  | "HEALTH_WELLNESS";

This is UI/demo configuration.

Do NOT move these into backend domain types during this task.

Do NOT create a duplicate authoritative policy model.

============================================================
14. OPTIONAL STATUS ON "CONOCE MÁS"
============================================================

After configuration, the COMPAS row may show:

`Activo · Medicamentos`

or:

badge:
`Activo`

This makes the service state understandable without entering it again.

Do NOT add COMPAS as a home collection method.

============================================================
15. DO NOT ADD A NEW QR
============================================================

Merchant COMPAS enrollment does NOT generate a dedicated COMPAS QR.

Do not add:

`QR COMPAS`

The merchant continues using:

`QR·Bre-B`

in the simulated host experience.

In a later integration task, a purchase initiated through the normal merchant
payment flow may be evaluated by COMPAS.

============================================================
16. NO TRANSACTION DECISION YET
============================================================

Do NOT implement:

ALLOW
DENY
REVIEW

in this merchant settings task.

Do NOT create a fake transaction decision in the browser.

Do NOT show:

`Pago COMPAS aprobado`

yet.

That will belong to the shared end-to-end demo implementation.

This task only answers:

"How does a merchant enable/configure COMPAS inside Nequi Negocios?"

============================================================
17. FUTURE SHARED DEMO COMPATIBILITY
============================================================

The current `DemoSessionProvider` only shares selected scenario fixtures.

Do NOT overhaul it in this task.

However, keep the new merchant components compatible with the future flow.

Later, Phone 3 will need to show states such as:

- purchase requested
- COMPAS evaluation
- payment approved
- payment rejected
- payment received

Do not architect the merchant settings UI in a way that prevents that.

============================================================
18. COMPONENT STRUCTURE
============================================================

Suggested additions:

`frontend/src/features/nequi-business/NequiBusinessMore.tsx`

`frontend/src/features/nequi-business/NequiBusinessCompas.tsx`

Optionally:

`frontend/src/features/nequi-business/nequi-business-compas-demo.ts`

or extend:

`nequi-business-demo-content.ts`

for decorative/local merchant configuration data.

Avoid unnecessary files.

Expected modifications:

`NequiBusinessExperience.tsx`

`NequiBusinessBottomNav.tsx`

Possibly:

`NequiBusinessIcons.tsx`

Do not create a separate application.

============================================================
19. VISUAL DESIGN
============================================================

Use the established Nequi Negocios palette already defined in:

`NequiBusinessExperience.tsx`

Do NOT introduce a completely separate COMPAS design system.

The screen must visually look like:

Nequi Negocios with a COMPAS feature

not:

COMPAS app embedded in an iframe.

Use:

- light blue surfaces
- dark plum text
- existing card radii
- existing shadows
- existing icon stroke style
- existing screen transitions
- existing status bar

A compass icon may identify COMPAS.

============================================================
20. COPY GUIDELINES
============================================================

Prefer user-facing Spanish.

Recommended core wording:

COMPAS

`Recibe pagos con propósito`

`Acepta pagos COMPAS`

`Categorías que aceptas con COMPAS`

`Medicamentos`

`Cuidado personal`

`Salud y bienestar`

`Cobras como siempre`

`COMPAS valida automáticamente`

`Guardar configuración`

Avoid developer terminology such as:

- Mandate
- Policy Engine
- OpenPaymentsGateway
- GNAP
- incoming-payment
- outgoing-payment
- SELF_DECLARED

on this merchant-facing screen.

============================================================
21. ACCESSIBILITY
============================================================

Use real controls:

- checkbox or switch semantics
- buttons
- labels
- focus states
- keyboard access
- back button
- Escape where appropriate

Selected categories must not rely solely on color.

============================================================
22. OUT OF SCOPE — DO NOT TOUCH
============================================================

Do NOT implement or modify:

`backend/**`

`contracts/**`

`data/fixtures/demo/**`

Open Payments

GNAP

Rafiki

merchant registry backend

CIIU lookup

RUES lookup

AI classification

database

Supabase

authentication

audit events

transaction execution

QR payloads

Bre-B integration

Nequi APIs

Wompi APIs

============================================================
23. PRESERVE OTHER SURFACES
============================================================

Do NOT modify:

`frontend/src/features/arq/**`

Do NOT modify:

`frontend/src/features/nequi/**`

ARQ and Nequi consumer already have their own work.

Changes to shared components must be minimal and generic.

============================================================
24. NO VISIBLE SIMULATION DISCLAIMERS INSIDE PHONE
============================================================

Do NOT render inside the Nequi Negocios phone:

`demo/test data`

`simulated surface`

`not affiliated`

`not a real integration`

Those boundaries already belong to repository documentation and the external
demo context.

============================================================
25. BUILD / VALIDATION
============================================================

Use the same working Node environment that was used for the previous
Nequi Negocios task if available.

From `frontend/` run:

npm run lint
npm run typecheck
npm run build

All must pass.

If one does not pass:

fix the issue before reporting completion where possible.

Do not falsely report success.

============================================================
26. MANUAL CHECK
============================================================

Verify:

HOME
- visually unchanged
- Tarjeta / Link / QR remain exactly payment methods
- no fourth COMPAS payment card

CONOCE MÁS
- now works
- correct active bottom nav
- COMPAS appears as a native service

COMPAS
- pushed screen opens
- back navigation works
- status can be toggled
- Medicamentos selected by default
- categories can be selected/deselected
- save works locally
- state survives navigating away/back

DEMO
- Phone 1 ARQ unchanged
- Phone 2 Nequi unchanged
- Phone 3 still stays inside its frame
- no overlay affects another phone

============================================================
27. AI RULES CHECK
============================================================

Run:

python .skills/hackathon-ai-rules/scripts/ai_rules.py check .

or the appropriate Windows Python command.

IMPORTANT:

If it fails because `AI_USAGE.md` still uses the old running-log format,
fix the structural format required by the hackathon skill WITHOUT deleting
or falsifying the historical entries.

Preserve all existing disclosure facts.

Do not mark human review as completed unless the team actually reviewed it.

Report the checker result.

============================================================
28. DO NOT COMMIT / PUSH
============================================================

Do not commit.

Do not push.

Leave the worktree ready for human review.

============================================================
29. FINAL RESPONSE
============================================================

Report:

1. Instruction files read.
2. Skills read.
3. Prompt-log filename.
4. Files created.
5. Files modified.
6. Files not touched.
7. How `Conoce más` now works.
8. How COMPAS appears in Nequi Negocios.
9. Merchant COMPAS configuration state.
10. Categories available.
11. How self-declaration vs verification is represented.
12. Confirmation that COMPAS is NOT a payment method.
13. Confirmation that no dedicated COMPAS QR was created.
14. Confirmation that home visual design was preserved.
15. Confirmation that ARQ and Nequi consumer were untouched.
16. Confirmation that backend/Open Payments were untouched.
17. lint result.
18. typecheck result.
19. build result.
20. AI-rules checker result.
21. AI_USAGE.md status.
22. Any remaining visual/product concern.

Do not simply say "done".
