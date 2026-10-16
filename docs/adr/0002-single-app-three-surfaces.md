# ADR 0002 — One application, three surfaces

## Status

Accepted

## Context

The pitch needs Pedro's wallet, Andrea's wallet, and the pharmacy visible at the same time. Those are different institutions in the story, and it is tempting to build three apps.

## Decision

One Next.js app exposes `/demo`, `/arq`, `/nequi`, and `/nequi-negocios`. The standalone routes and `/demo` render `ArqExperience`, `NequiExperience`, and `NequiBusinessExperience`. `/demo` places those components in `PhoneFrame` under one `DemoSessionProvider`. No iframes.

Person, business, NGO, and government cases reuse the mandate. They do not become separate products. Only the family medication story is in the MVP UI.

## Consequences

Shared demo state has to live in this app. A visual redesign of a surface happens in one feature component and shows up on both its route and `/demo`.
