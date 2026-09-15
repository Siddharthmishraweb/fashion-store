# Vastrika

Multi-tenant marketplace for independent saree and fashion houses — storefronts, store admin, and a platform admin.

## Stack

- React 19 + Vite storefront
- Fastify 5 + Postgres API in `server/`

## Scripts

```bash
npm install
npm run dev
```

API (from `server/`):

```bash
npm install
npm run db
npm run migrate
npm run seed
npm run dev
```

Copy `.env.example` to `.env` in both the repo root and `server/` before running.

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
