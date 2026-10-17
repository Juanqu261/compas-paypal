# Development

Prefer the smallest change that keeps the hackathon demo buildable. Do not add a library, a database, or a workspace tool without a concrete need.

Run commands from the project directory:

```text
cd frontend
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

```text
cd backend
npm install
npm run dev
npm run typecheck
npm test
npm run op:smoke   # real Open Payments run; needs backend/.env
```

There is no root `package.json` and no frontend test script. Domain and policy tests live in `backend/tests`.

Demo fixtures are labeled `demo/test data`. An unimplemented integration throws. It does not return a fake success.

Do not claim a simulated provider integration is real.
