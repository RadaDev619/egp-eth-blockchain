# Scripts

This folder is reserved for setup, deployment, demo reset, and verification scripts.

Current demo reset commands are exposed through npm scripts:

```bash
npm run db:up
npm run demo:seed
npm run demo:reset
```

`db:up` starts a local PostgreSQL 16 container using `docker-compose.yml`.

`demo:seed` loads deterministic mock NDI personas, role permissions, `TDR-DEMO-001`, and sample blocked audit evidence.

`demo:reset` force-resets the local Prisma database with `prisma db push --force-reset`, then runs the same seed. Use it immediately before judging to return the app to a known mock-mode baseline.

PostgreSQL must be running before either command can write demo data.

If `DATABASE_URL` is not set, these demo scripts use the local development default from `backend/.env.example`:

```text
postgresql://egp:egp@localhost:5432/egp_trust?schema=public
```
