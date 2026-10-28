# Frontend

One Next.js app for the demo.

| Route | Surface |
| --- | --- |
| `/` | Story and links |
| `/demo` | All three phones, one shared session |
| `/paypal` | Pedro, the payer |
| `/paypal-delegate` | Andrea, the delegate, on her own PayPal |
| `/paypal-business` | The online pharmacy, on PayPal Business |

The wallet screens are simulations. The COMPAS screens (`src/features/compas/`) call the backend through `/compas-api/*`, which proxies to `COMPAS_BACKEND_URL` (default `http://localhost:4000`). The frontend never decides policy and holds no PayPal credentials. "Aprobar en PayPal" opens the real sandbox in a new tab.

No screens exist yet for the analyst, merchant onboarding or errands. The backend contracts for them are in `contracts/errands/` and `contracts/merchant-onboarding/`.

## Run and test

```bash
npm install
npm run dev        # http://localhost:3000 (not 127.0.0.1)
npm run lint
npm run typecheck
npm test           # labels, amounts, dates, wizard
npm run build
```

For the COMPAS screens, also run the backend (`cd backend && npm run dev`).
