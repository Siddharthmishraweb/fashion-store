# GitHub Pages and the mock vault

## Can the backend run on GitHub Pages?

**No.** GitHub Pages only serves static files. It cannot run the Fastify process or Postgres in `server/`.

What *can* run on Pages:

| Piece | On GitHub Pages? |
| --- | --- |
| React storefront | Yes |
| In-browser mock API (`USE_MOCK=true`) | Yes — it ships inside the frontend bundle |
| Fastify + Postgres | No — host this on Railway, Render, Fly.io, or a VM |

With **`USE_MOCK=true`** the site is fully usable on Pages: catalogue, cart, checkout, and both admin consoles talk to the mock in the browser. That is the default for this workflow.

With **`USE_MOCK=false`** the frontend still deploys to Pages, but it calls a real API. Set `VITE_API_URL` to that origin (and allow the Pages origin in the API’s `CORS_ORIGINS`).

## Vault key: `USE_MOCK`

Source of truth, in order:

1. GitHub Actions **secret** `USE_MOCK` (Settings → Secrets and variables → Actions → Secrets)
2. GitHub Actions **variable** `USE_MOCK` (same page, Variables tab)
3. Local `.env` `VITE_USE_MOCK`
4. `src/config/vault.js` → `USE_MOCK`

Values:

- `true` — mock data
- `false` — real API at `VITE_API_URL`

## Enable Pages (one-time)

1. Repo **Settings → Pages**
2. **Source:** GitHub Actions
3. Push to `main` (or run the **GitHub Pages** workflow manually)

The site will be:

`https://<user>.github.io/fashion-store/`

## Flip mock vs real after deploy

| Goal | Set |
| --- | --- |
| Demo on Pages, no server | Secret/variable `USE_MOCK` = `true` |
| Talk to a hosted API | `USE_MOCK` = `false` and variable `VITE_API_URL` = `https://your-api.example` |

Then re-run the **GitHub Pages** workflow so the frontend rebuilds with the new flags (Vite inlines them at build time).

## Local

```bash
# Mock (or leave VITE_USE_MOCK unset and set vault.USE_MOCK = true)
VITE_USE_MOCK=true npm run dev

# Real API (server running on :4000)
VITE_USE_MOCK=false VITE_API_URL=/api npm run dev
```
