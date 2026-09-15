# Vastrika

Multi-tenant marketplace for independent saree and fashion houses — storefronts, store admin, and a platform admin.

## Stack

- React 19 + Vite storefront
- Fastify 5 + Postgres API in `server/`

## Run locally (frontend + backend)

You need **three terminals** from the repo root. The storefront talks to the API through the Vite proxy at `/api`.

### 1. Database

```bash
cd server
copy .env.example .env
npm install
npm run db
```

Leave this running. It starts a local Postgres (no Docker required).

On first setup, in a **second** `server/` terminal:

```bash
npm run migrate
npm run seed
```

If `server/.env` still points at port `5432`, change `DATABASE_URL` to the URL printed by `npm run db` (usually port `54329`).

### 2. API

```bash
cd server
npm run dev
```

API listens on [http://localhost:4000](http://localhost:4000).

### 3. Storefront

From the **repo root** (keep `VITE_USE_MOCK=false` in `.env` to use the real API):

```bash
copy .env.example .env
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Mock-only (no API/Postgres): set `VITE_USE_MOCK=true` in the root `.env`, then only `npm run dev` is required.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Platform | super@vastrika.market | Super@123 |
| Store owner | admin@atelier-noor.test | Admin@123 |
| Shopper | priya@example.com | Customer@123 |

## Storefronts

- `/store/atelier-noor`
- `/store/mayura-silks`
- `/store/kashika-looms`
- `/store/nivaa-studio`
- `/store/prithvi-atelier`
- `/store/utsav-edit`
- `/store/ivory-house`
- `/store/linen-lane`

Admin: `/admin` · Super admin: `/super-admin`

## Docs

- [Adding a new company](docs/adding-a-company.md) — onboard a storefront, create the owner login, and launch the shop.
- [GitHub Pages](docs/github-pages.md) — mock vault (`USE_MOCK`) and static deploy. The Node API cannot run on Pages.
