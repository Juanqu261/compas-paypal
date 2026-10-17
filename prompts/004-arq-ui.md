# COMPAS — ARQ Embedded Surface UI Recreation
# Scope: frontend-only visual implementation + COMPAS entry point

You are working inside the existing COMPAS monorepo.

This task is specifically to recreate the ARQ mobile-wallet experience shown in the FOUR reference screenshots attached to this prompt, and to prepare a visually native COMPAS entry point inside that ARQ simulation.

This is a scoped frontend task.

DO NOT start coding immediately.

============================================================
0. REQUIRED CONTEXT — READ BEFORE ANY EDIT
============================================================

Before modifying ANY file, inspect the current repository and read the project instructions in this exact order:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `README.md`
4. `.AGENTS/README.md`
5. `.AGENTS/product.md`
6. `.AGENTS/architecture.md`
7. `.AGENTS/development.md`
8. `.AGENTS/open-payments.md`
9. `.AGENTS/hackathon.md`

Then load/read the relevant shared skills:

10. `.skills/compas-context/SKILL.md`
11. `.skills/compas-context/REFERENCE.md` only as needed for demo/product context
12. `.skills/hackathon-ai-rules/SKILL.md`
13. `.skills/hackathon-ai-rules/REFERENCE.md` only as needed for compliance

Then inspect the relevant frontend code before editing:

14. `frontend/README.md`
15. `frontend/src/features/arq/ArqExperience.tsx`
16. `frontend/src/app/arq/page.tsx`
17. `frontend/src/features/demo/DemoStage.tsx`
18. `frontend/src/features/demo/DemoSession.tsx`
19. `frontend/src/components/phone/PhoneFrame.tsx`
20. `frontend/src/app/globals.css`
21. relevant files under `frontend/src/features/shared/`
22. relevant fixtures under `data/fixtures/demo/`

Also inspect `docs/01-demo-story.md` and `docs/03-architecture.md` before making architectural decisions.

Do not rely on assumptions from previous conversations when repository documentation provides the answer.

If instructions conflict:
- `AGENTS.md` and `docs/` take precedence.
- Then `.AGENTS/`.
- Then skills.
- Then this task prompt.

Before coding, briefly state internally what constraints you found and make sure your implementation respects them.

============================================================
1. HACKATHON AI COMPLIANCE — FIRST REPOSITORY CHANGE
============================================================

This is a meaningful AI-assisted coding task.

Before implementing the UI:

1. Save THIS ENTIRE PROMPT verbatim as:

`prompts/004-arq-ui.md`

Do not summarize it.
Do not rewrite it.
Do not omit the reference to the attached screenshots.

2. Follow `.skills/hackathon-ai-rules/SKILL.md`.

3. Check whether `AI_USAGE.md` exists.

- If it exists, APPEND an entry for this task.
- If it does not exist, create it using the repository's hackathon AI rules before continuing.

The entry must disclose Claude Code / Claude Opus as assisting with:
- ARQ UI recreation
- frontend component implementation
- responsive mobile layout
- visual adaptation from provided screenshots
- COMPAS entry-point integration

Reference:

`prompts/004-arq-ui.md`

Do not rewrite historical prompt logs.

============================================================
2. TASK GOAL
============================================================

Recreate the ARQ mobile application home experience shown in the four attached screenshots with high visual fidelity.

The objective is NOT to create a generic fintech UI.

The objective is to make the `/arq` simulated surface immediately recognizable as the ARQ experience shown in the references while remaining clearly a hackathon simulation in repository documentation.

This ARQ surface represents:

Pedro
Role: PAYER

It is one of three simulated wallet surfaces:

- ARQ → Pedro / payer
- Nequi → Andrea / delegate
- Nequi Negocios → merchant

The ARQ UI must remain reusable inside:

`/demo`

where all three phones are shown together.

============================================================
3. IMPORTANT PRODUCT BOUNDARY
============================================================

COMPAS is NOT a standalone application.

Do NOT create:

- a COMPAS dashboard
- a separate COMPAS app
- a separate top-level COMPAS route
- a generic SaaS-style interface
- a banking backend in the browser

COMPAS must appear as a feature EMBEDDED inside the simulated ARQ wallet.

For this task, the ARQ experience is the host wallet.

The user should feel:

"I am inside ARQ and ARQ has a COMPAS capability."

NOT:

"I left ARQ and opened a different application."

COMPAS remains:

an embedded authorization and policy layer.

Money stays where it is.
COMPAS moves permission, not money.

============================================================
4. SOURCE OF TRUTH FOR VISUAL DESIGN
============================================================

The FOUR screenshots attached to this prompt are the visual source of truth.

Study them carefully before coding.

Important observations from the references:

SCREENSHOT 1:
- full ARQ home at the top of the page
- dark green hero/background
- Android-style status region
- top pills:
  - user/profile icon
  - `Beneficios`
  - gift / `$25 USDc`
- main balance:
  - US flag
  - `$0.00`
  - `USDc · Datos de cuenta`
- small carousel indicator
- quick actions:
  - `Recargar`
  - `Convertir`
  - QR button
- white content begins below
- business promo card
- cards section
- bottom navigation

SCREENSHOT 2:
- page is vertically scrolled
- top utility bar remains visible/sticky
- transaction section
- exchange-rate section
- bottom navigation remains fixed

SCREENSHOT 3:
- demonstrates ARQ's internal navigation pattern
- a new screen slides from the RIGHT
- previous screen remains visually behind during transition
- new screen has a back arrow/header
- use this interaction pattern for the future COMPAS subview

SCREENSHOT 4:
- lower home-page content
- exchange-rate block
- `Otras formas de pago`
- `Pagar una factura`
- `Grupos`
- expense-sharing promotional card
- subtle ARQ wordmark/watermark
- fixed bottom navigation

Do not invent a completely different layout.

============================================================
5. VISUAL STYLE
============================================================

Use the screenshots as the primary source.

Approximate sampled colors from the provided reference may be used as starting points:

ARQ dark green:
approximately `#002F1B`

Secondary dark green:
approximately `#09482D`

Muted green pill/background:
approximately `#718D85`

Mint/card accent:
approximately `#78E2B1`

Main page background:
approximately `#F9F9F8`

White:
`#FFFFFF`

Use neutral black/gray typography matching the screenshots.

Do NOT blindly use these values if inspection of the screenshots suggests a better match.

Typography:
- use the existing/system sans-serif stack
- do not add an external font dependency unless clearly necessary
- weights, spacing and sizing should mimic the screenshots

Visual characteristics:
- rounded pills
- generous white spacing
- thin separators
- soft light-gray cards
- almost no shadows
- clean mobile banking aesthetic
- large balance typography
- fixed bottom navigation
- sticky top ARQ utility bar while scrolling

============================================================
6. MOBILE DIMENSIONS / RESPONSIVENESS
============================================================

The reference screenshots are approximately 738 × 1600 pixels, around a modern tall Android phone aspect ratio.

Build the UI responsively.

The actual component must NOT hardcode the screenshot pixel resolution.

Preferred design behavior:

At `/arq`:
- mobile browser: use the available viewport naturally
- desktop browser: center a realistic phone-width experience
- target logical width around 390–420 CSS px
- keep proportions close to the screenshot

Inside `/demo`:
- `ArqExperience` must fit inside `PhoneFrame`
- no horizontal overflow caused by hardcoded widths
- the exact same `ArqExperience` implementation is reused

Do not duplicate ARQ UI for `/arq` and `/demo`.

============================================================
7. IMPLEMENTATION SCOPE
============================================================

PRIMARY files may include:

`frontend/src/features/arq/ArqExperience.tsx`

and new components under:

`frontend/src/features/arq/`

For example, componentize by meaningful visible sections, such as:

- ARQ shell
- top/status bar
- balance hero
- quick actions
- business promo
- cards section
- transactions section
- exchange-rate section
- other-payments section
- groups section
- bottom navigation
- COMPAS entry
- COMPAS placeholder shell

Do NOT create dozens of microscopic one-line components.

Prefer components corresponding to meaningful UI sections.

You may make a MINIMAL change to:

`frontend/src/components/phone/PhoneFrame.tsx`

ONLY if necessary to support an edge-to-edge wallet experience inside `/demo`.

If you modify `PhoneFrame`, it must remain generic and must not contain ARQ-specific styling.

You may adjust:

`frontend/src/app/arq/page.tsx`

so the route presents the wallet experience correctly on desktop/mobile.

You may adjust:

`frontend/src/app/globals.css`

only for reusable/global needs.

Do not move business/domain logic into CSS or page files.

============================================================
8. ARQ HOME CONTENT TO RECREATE
============================================================

Recreate the visible sections from the screenshots.

A. TOP UTILITY AREA

Include:
- status/time area
- user/profile circular icon
- `Beneficios` pill
- `$25 USDc` gift pill

Use lightweight inline SVG/CSS icons.

Do not install a large icon package just for this task unless there is a strong reason.

B. BALANCE HERO

Recreate:
- Colombian/US currency visual context as in screenshot
- `$0.00`
- `USDc · Datos de cuenta`
- dropdown chevron
- two-dot/page indicator

C. PRIMARY ACTIONS

Recreate:
- `Recargar`
- `Convertir`
- QR action

The buttons need visual hover/press states for web accessibility.

They do NOT need real banking functionality.

Do not fake banking behavior.

D. BUSINESS PROMO

Recreate the general card:

`Cobra de EE. UU. con tu empresa`

Supporting text and:

`Registra tu empresa →`

Create the simple building illustration using CSS/SVG shapes.

Do NOT download or copy proprietary ARQ image assets.

E. TARJETAS

Recreate:
- dark green card
- mint card
- add-card tile
- masked suffixes similar to screenshot

These are DEMO UI only.

Do not create real payment-card data.

F. TRANSACCIONES

Recreate the visible transaction presentation:

- icon circles
- title
- date
- positive/negative amount alignment
- muted secondary values

Values may be hardcoded as clearly local visual demo content.

Do not connect to backend for this.

G. TASA DE CONVERSIÓN

Recreate:
- USDc/COP
- percentage indicator
- Compra
- Venta
- carousel dots

Use the visible screenshot values ONLY as demo display values.

They must NOT be described in code/comments as live exchange rates.

Prefer a nearby comment or fixture semantics indicating they are visual demo data.

H. OTRAS FORMAS DE PAGO

Recreate:

`Pagar una factura`

with icon, subtitle and right chevron.

I. GRUPOS

Recreate the expense-sharing card:

`Divide gastos con amigos y familiares`

and:

`Crear un grupo →`

Create the group illustration with simple CSS/SVG shapes.

J. BOTTOM NAVIGATION

Fixed navigation matching the screenshot:

- Inicio
- Crédito
- Transferir
- Invertir
- Ahorrar

`Inicio` is selected.

The content area must include sufficient bottom padding so fixed navigation does not cover content.

============================================================
9. COMPAS ENTRY POINT
============================================================

This task must also make COMPAS look like an ARQ-native feature.

Do NOT redesign the home around COMPAS.

Do NOT create an oversized hackathon button.

Add exactly ONE subtle COMPAS entry inside:

`Otras formas de pago`

directly after:

`Pagar una factura`

Recommended copy:

Title:
`COMPAS`

Subtitle:
`Destina dinero con un propósito`

Use a small compass-like icon consistent with the visual language of the existing row.

It should look like a native ARQ list item.

This is important:

COMPAS is integrated into the wallet.
It should NOT visually look like an advertisement for another product.

============================================================
10. COMPAS CLICK BEHAVIOR — UI SHELL ONLY
============================================================

When the user clicks the COMPAS row:

reproduce the internal navigation language observed in screenshot 3.

The COMPAS view should slide in from the RIGHT inside the ARQ experience.

Do not navigate to a separate `/compas` application.

Keep the same ARQ host surface.

The view should have:
- white background
- top back arrow
- simple title:
  `COMPAS`
- short supporting text such as:
  `Destina dinero con un propósito`
- an ARQ-consistent layout

For THIS task, stop there.

You may create a minimal initial visual shell for the future mandate flow, but DO NOT implement:

- mandate creation
- recipient selection
- Andrea selection
- Gladys beneficiary logic
- medication policy logic
- Open Payments grants
- backend requests
- payment execution
- AI classification

Those are explicitly OUT OF SCOPE.

The only required interaction is:

ARQ Home
    ->
tap COMPAS
    ->
ARQ-native COMPAS shell slides in
    ->
back arrow
    ->
ARQ Home

Keep that interaction local to the frontend.

============================================================
11. DO NOT TOUCH DOMAIN / BACKEND
============================================================

Do NOT modify:

`backend/`

Do NOT modify domain rules.

Do NOT modify Open Payments gateway interfaces.

Do NOT implement Open Payments.

Do NOT modify merchant classification.

Do NOT add database code.

Do NOT add API endpoints.

Do NOT change policy-engine semantics.

This task is FRONTEND UI ONLY.

============================================================
12. DEMO SESSION COMPATIBILITY
============================================================

`ArqExperience` is currently rendered:

1. directly at `/arq`
2. inside `/demo`

Preserve this.

Do not introduce required props that break `DemoStage` unnecessarily.

If local ARQ navigation state is needed for:

HOME <-> COMPAS

keep it local to the ARQ experience unless there is a concrete reason to add it to shared demo state.

Do NOT put ARQ-specific navigation state inside the backend.

The existing `DemoSessionProvider` represents the shared scenario.

Do not break it.

============================================================
13. BRAND / SIMULATION SAFETY
============================================================

This repository already defines ARQ as a simulated embedding surface.

Maintain that boundary.

Do not:
- claim affiliation with ARQ
- claim a real ARQ integration
- call ARQ APIs
- scrape ARQ
- download proprietary ARQ assets
- introduce real customer data

It is acceptable for the internal hackathon demo surface to visually resemble the provided references.

Use:
- CSS
- HTML
- inline SVG
- text
- simple geometric illustrations

to reproduce the UI.

============================================================
14. ACCESSIBILITY / INTERACTION QUALITY
============================================================

Even though this is a visual demo:

- buttons must be real `<button>` elements where appropriate
- provide useful aria-labels for icon-only controls
- maintain reasonable contrast
- do not make entire noninteractive cards focusable
- respect reduced-motion preference for the COMPAS slide transition if practical
- do not rely on color alone for meaning

============================================================
15. IMPLEMENTATION QUALITY
============================================================

Prefer:
- semantic components
- TypeScript
- Tailwind classes already used by the project
- small reusable SVG/icon components where appropriate
- no unnecessary dependency additions

Avoid:
- huge single JSX file
- absolute positioning for the whole screen
- screenshot-as-background hacks
- `<img>` containing the screenshot
- canvas recreation of the screenshot
- base64 image dumps
- pixel-perfect code that only works at one viewport
- fake data pretending to be live data

The result must be a REAL DOM implementation.

============================================================
16. VISUAL FIDELITY PRIORITIES
============================================================

Prioritize fidelity in this order:

1. overall ARQ composition
2. dark-green hero proportions
3. typography hierarchy
4. sticky top area
5. balance and quick actions
6. white content sections and spacing
7. fixed bottom nav
8. card/list styling
9. icons/illustrations
10. small decorative details

Do not spend excessive time matching irrelevant system-level Android details.

The wallet UI matters more than recreating Samsung navigation controls.

============================================================
17. RESPONSIVE SCROLL BEHAVIOR
============================================================

The screenshot series demonstrates that the ARQ home is vertically scrollable.

Implement:

- sticky/fixed top utility bar behavior similar to the screenshots
- hero/balance area scrolls out naturally
- white content continues vertically
- bottom navigation remains fixed
- no nested scrollbars unless required by `/demo`

At `/demo`, the phone surface should preferably have its own vertical scrolling area so each simulated phone behaves like a device.

Do not make the entire three-phone page impossible to use because one phone captures all scrolling.

Use judgment and preserve existing DemoStage usability.

============================================================
18. REFERENCE DATA
============================================================

For visual-only ARQ content such as:

- `$0.00`
- `$25 USDc`
- card suffixes
- transactions
- exchange-rate numbers

it is acceptable to use local constants inside the ARQ UI layer.

Clearly treat them as demo UI data.

Do not modify the shared COMPAS medication/alcohol fixtures simply to support decorative ARQ home content.

The shared COMPAS fixtures should continue representing the actual demo story, not generic wallet-decoration data.

============================================================
19. NO PREMATURE COMPAS BUSINESS FLOW
============================================================

DO NOT implement the actual COMPAS mandate screen in this task.

Specifically do not build forms for:

- $40
- MEDICATION
- Gladys
- Andrea
- expiry
- beneficiary
- purpose selection

That will be a separate task after the host wallet UI is stable.

This task ends at:

"COMPAS exists as a native ARQ feature and its shell can be opened."

============================================================
20. VERIFY AFTER IMPLEMENTATION
============================================================

From `frontend/`, run:

npm run lint
npm run typecheck
npm run build

Do not run commands from repository root as if it were a Node workspace.

If a local browser-preview capability is available, inspect:

`/arq`

at approximately:
- 390 × 844
- 412 × 915

and inspect:

`/demo`

to ensure ARQ still renders correctly alongside the other two surfaces.

Check visually:

- no horizontal overflow
- sticky top region works
- bottom nav stays fixed
- long page scroll works
- COMPAS row fits naturally
- COMPAS slide-in works
- back works
- `/demo` remains usable

============================================================
21. FILE SCOPE
============================================================

EXPECTED TO MODIFY:

- `frontend/src/features/arq/ArqExperience.tsx`
- potentially new files under `frontend/src/features/arq/`
- `frontend/src/app/arq/page.tsx` if needed
- `frontend/src/components/phone/PhoneFrame.tsx` only if generically necessary
- `frontend/src/app/globals.css` only if necessary
- `prompts/004-arq-ui.md`
- `AI_USAGE.md`

EXPECTED NOT TO MODIFY:

- `backend/**`
- `contracts/**`
- Open Payments interfaces
- domain models
- policy engine
- data medication/alcohol fixtures
- Nequi UI implementation
- Nequi Negocios UI implementation
- infrastructure
- research docs

If you find that another file truly needs modification, explain why before making a broad architectural change.

============================================================
22. DO NOT COMMIT / DO NOT PUSH
============================================================

Do not commit.

Do not push.

Leave the working tree ready for human review.

============================================================
23. FINAL RESPONSE
============================================================

When complete, report:

1. Root/project instruction files you actually read.
2. Skills you loaded/read.
3. Files created.
4. Files modified.
5. Files deliberately not touched.
6. ARQ component structure.
7. How `/arq` behaves.
8. How the ARQ component remains compatible with `/demo`.
9. How COMPAS is integrated visually.
10. Confirmation that no COMPAS business logic/Open Payments logic was implemented.
11. Confirmation that the reference screenshots were NOT embedded as images.
12. `npm run lint` result.
13. `npm run typecheck` result.
14. `npm run build` result.
15. Any visual difference from the references that remains and why.
16. Confirmation that this exact prompt was saved at `prompts/004-arq-ui.md`.
17. AI_USAGE.md status.

Do not simply say "done".
