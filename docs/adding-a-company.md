# Adding a new company

A **company** on Vastrika is an independent storefront (a tenant). Each one gets its own shop URL, theme, catalogue, orders, and a store-owner login. Shoppers on one house never see another house’s bag, prices, or admin.

This guide is for the **platform operator**. Store staff cannot create a new company.

## Before you start

1. The API and web app are running (`server/` on port 4000, Vite on 5173).
2. You can sign in as a platform operator.
   - Demo: `super@vastrika.market` / `Super@123`
   - Production: your own `super_admin` account.
3. You have, from the business:
   - Display name (e.g. *Nivaa Studio*)
   - Preferred URL slug (e.g. `nivaa-studio`)
   - Owner’s name and email (this becomes their admin login)
   - A password they will use (see rules below)
   - City and phone (optional)
   - A starting theme (optional; default is Heritage Luxury)

**Slug rules:** lowercase letters, numbers, and hyphens only (`atelier-noor`). It must be unique across the platform.

**Owner password rules:** at least 8 characters, with one uppercase letter, one lowercase letter, and one number.

**Email rules:** the owner email must not already exist on any account (shopper or staff).

## 1. Create the company

1. Open [http://localhost:5173/login](http://localhost:5173/login) (or your production login).
2. Sign in with the platform operator account. You land on `/super-admin`.
3. Go to **Stores**.
4. Under **Onboard a business**, fill in:

   | Field | Required | Notes |
   | --- | --- | --- |
   | Business name | Yes | Shown in the header and on the platform directory |
   | Storefront slug | No | Generated from the name if you leave it blank |
   | Owner name | No | Defaults to `{Business name} Owner` |
   | Owner email | Yes | Login for `/admin` and the store’s public contact email |
   | Owner password | Yes | Give this to the owner over a private channel |
   | Phone | No | Copied onto the owner account and the store record |
   | City | No | Defaults to `India` |
   | Starting theme | No | Look & feel until they customise Appearance |

5. Click **Create storefront**.

The company is **active immediately**. You should see it in the storefronts table. The shop URL is:

```
/store/{slug}
```

Example: `/store/nivaa-studio`

A store-owner user is created in the same step. The password is not stored in plaintext and is not shown again in the admin UI — send it to the owner yourself.

## 2. Hand over to the owner

Give them:

- Storefront: `https://<your-domain>/store/{slug}`
- Admin: `https://<your-domain>/login` then they are sent to `/admin`
- Email and password you set above

They should change the password after first sign-in (**Account** is for shoppers; staff password change is under the store admin account page if you expose it, or you can rotate it later from the database). Until they stock the shop, the storefront is a live but empty house: announcement bar only, no products.

## 3. Owner checklist (first launch)

Have the owner (or your onboarding team) work through `/admin` in this order.

### Settings

**Admin → Settings**

- Confirm name, tagline, city, address, contact email/phone
- Support email and phone (shown to shoppers)
- Storefront language: English or हिन्दी
- Announcement bar text

### Appearance

**Admin → Appearance**

- Colours, type, header, and product-card style (starts from the theme you picked)
- Homepage sections (hero, category grid, product grids, newsletter, …)
- Navigation labels and links
- Click **Publish** or shoppers still see the empty published homepage

### Categories

**Admin → Categories**

- Add the trees shoppers will browse (e.g. Sarees → Banarasi, Wedding, Festive)
- Toggle **Show** so they appear on the storefront

### Products

**Admin → Products → New product**

Required:

- Product name
- Selling price (₹), greater than zero

Recommended:

- MRP, SKU, stock on hand
- Fabric, weave, colour, occasion, region
- Image URLs (https only; up to 10)
- **Save & publish** — drafts do not appear in the shop

### Banners

**Admin → Banners**

- Add campaign slides with desktop and mobile images
- **Publish** them, then attach their IDs to the homepage carousel in Appearance and publish that too

### Collections, coupons, team

- **Collections** group products for homepage rows (New arrivals, Best sellers).
- **Coupons** — e.g. a first-order `WELCOME10`.
- **Team** — invite staff as store admin, manager, content, or inventory. Only a platform operator can create or change the **store owner**.

When at least one published product exists, open `/store/{slug}` in a private window and place a test order.

## 4. Optional: custom domain

By default the company is reached at `/store/{slug}`. To serve `www.their-house.com`:

1. Point their DNS (CNAME/A) at the platform.
2. As platform operator, `PATCH /stores/{id}` with `{ "domain": "www.their-house.com" }`.
3. Storefront resolution tries **custom domain first**, then the `/store/:slug` path. No redeploy is required.

Plans (`starter`, `growth`, `enterprise`) are also set only by the platform operator, via the same PATCH body (`subscription`).

## 5. Suspend or reopen

On **Stores**, use **Suspend** / **Activate**.

- Suspended: shoppers see an unavailable notice; the resolve API returns 403.
- Activate: the house is reachable and can take orders again.

## 6. API (same as the form)

Platform session required (`Authorization: Bearer …` from `POST /auth/login`).

```http
POST /stores
Content-Type: application/json

{
  "name": "Nivaa Studio",
  "slug": "nivaa-studio",
  "ownerName": "Ananya Rao",
  "email": "ananya@nivaa.example",
  "ownerPassword": "ChangeMe1",
  "phone": "+91 90000 00000",
  "city": "Bengaluru",
  "themeId": "soft-luxe",
  "subscription": "growth"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `name` | Yes | Max 80 characters |
| `slug` | No | Slugified from `name` if omitted |
| `email` | Yes | Owner login and store contact |
| `ownerPassword` | Yes | Password rules above |
| `ownerName` | No | Defaults to `{name} Owner` |
| `phone`, `city`, `tagline`, `coverImage`, `domain` | No | |
| `themeId` | No | See themes below |
| `subscription` | No | `starter` (default), `growth`, or `enterprise` |

**201** returns the store record plus `owner: { name, email, role }` (never the password).

**409** if the slug or email is already taken.

## Themes

Use the `themeId` from this list. Owners can retune colours and type later without changing id.

| `themeId` | Name |
| --- | --- |
| `heritage-luxury` | Heritage Luxury (default) |
| `soft-luxe` | Soft Luxe |
| `artisan-earth` | Artisan Earth |
| `festive-modern` | Festive Modern |
| `ethnic-atelier` | Ethnic Atelier |
| `contemporary-luxury` | Contemporary Luxury |
| `modern-minimal` | Modern Minimal |
| `festive-india` | Festive India |

Preview any look: `/store/atelier-noor?previewTheme=soft-luxe` (signed-in or not).

## What a new company does *not* get

Seeded demo houses ship with products, banners, and a full homepage. A company you onboard here starts clean on purpose:

- No products, categories, collections, or coupons
- Homepage sections empty until Appearance is published
- Navigation empty until they add items
- No sample orders or reviews

Do not copy another tenant’s catalogue into a new house. Each company should publish its own photography and names.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| “That storefront slug is already taken” | Pick another slug. Slugs are global. |
| “An account with this email already exists” | Use a different owner email, or delete/rename the old user. |
| Owner lands on a shopper account | They registered at `/store/.../login` as a customer. Owner accounts are created only by this onboarding flow. |
| Storefront says unavailable | Status is `suspended`. Activate it on Stores. |
| Empty homepage after adding products | Products are live on `/store/{slug}/products`. The home page only shows what Appearance has published. |
| Images missing | URLs must be `http` or `https`. `javascript:` and relative junk are stripped. |
| Cannot open `/admin` as super admin for that house | Super-admin is platform-scoped. Use the owner login (or impersonate by signing in as them). |
