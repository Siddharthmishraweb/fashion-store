-- =============================================================================
-- Vastrika commerce schema
--
-- Two ideas shape this design:
--
-- 1. Read model in the row. Products, stores, and banners carry a `payload`
--    jsonb column holding the exact JSON the API returns. Reads select that
--    column as text and never deserialize it. Writes recompute it.
-- 2. Filter on typed columns. Everything the catalogue filters or sorts by is a
--    real column with a real index, so the jsonb is never searched.
--
-- Tenant isolation is enforced by `tenant_id` on every tenant-owned table plus
-- authorization in the route layer; ON DELETE CASCADE keeps orphans impossible.
-- =============================================================================

create extension if not exists pg_trgm;

-- ------------------------------------------------------------------- stores
create table if not exists stores (
  id               text primary key,
  slug             text not null unique,
  domain           text unique,
  name             text not null,
  tagline          text not null default '',
  email            text not null default '',
  phone            text not null default '',
  city             text not null default '',
  address          text not null default '',
  announcement     text not null default '',
  status           text not null default 'active'
                   check (status in ('active', 'suspended', 'draft')),
  subscription     text not null default 'starter'
                   check (subscription in ('starter', 'growth', 'enterprise')),
  theme_id         text not null,
  theme            jsonb not null,
  theme_draft      jsonb not null,
  homepage         jsonb not null default '{"version":1,"status":"published","sections":[]}',
  homepage_draft   jsonb not null default '{"version":1,"status":"draft","sections":[]}',
  navigation       jsonb not null default '{"items":[]}',
  navigation_draft jsonb not null default '{"items":[]}',
  branding         jsonb not null default '{}',
  settings         jsonb not null default '{}',
  social           jsonb not null default '{}',
  versions         jsonb not null default '[]',
  logo_text        text,
  logo             text,
  favicon          text,
  cover_image      text,
  gmv              numeric(14, 2) not null default 0,
  orders_count     integer not null default 0,
  products_count   integer not null default 0,
  customers_count  integer not null default 0,
  -- Prebuilt GET /stores/resolve body. Reads return this column as text and
  -- never deserialize it; writes rebuild it. That makes the storefront boot
  -- a single indexed lookup instead of five joins plus a JSON.stringify.
  storefront_payload jsonb,
  draft_updated_at timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists stores_status_idx on stores (status);
create index if not exists stores_name_trgm_idx on stores using gin (name gin_trgm_ops);

-- -------------------------------------------------------------------- users
create table if not exists users (
  id            text primary key,
  email         text not null unique,
  name          text not null,
  phone         text not null default '',
  password_hash text not null,
  role          text not null default 'customer'
                check (role in ('super_admin', 'store_owner', 'store_admin',
                                'store_manager', 'content_manager',
                                'inventory_manager', 'customer')),
  tenant_id     text references stores (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Lookups are always case-insensitive on email.
create unique index if not exists users_email_lower_idx on users (lower(email));
create index if not exists users_tenant_role_idx on users (tenant_id, role);

-- Stateless tokens still record their session for audit and bulk revocation.
create table if not exists sessions (
  id         text primary key,
  user_id    text not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  ip         text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

create table if not exists revoked_sessions (
  session_id text primary key,
  expires_at timestamptz not null
);

create index if not exists revoked_expiry_idx on revoked_sessions (expires_at);

-- Brute-force protection, keyed per email and per source address.
create table if not exists login_attempts (
  identifier   text primary key,
  attempts     integer not null default 0,
  first_at     timestamptz not null default now(),
  locked_until timestamptz
);

-- --------------------------------------------------------------- categories
create table if not exists categories (
  id         text primary key,
  tenant_id  text not null references stores (id) on delete cascade,
  parent_id  text references categories (id) on delete cascade,
  slug       text not null,
  name       text not null,
  image      text,
  published  boolean not null default true,
  sort_order integer not null default 0,
  unique (tenant_id, slug)
);

create index if not exists categories_tenant_idx on categories (tenant_id, published, sort_order);
create index if not exists categories_parent_idx on categories (parent_id);

-- -------------------------------------------------------------- collections
create table if not exists collections (
  id          text primary key,
  tenant_id   text not null references stores (id) on delete cascade,
  name        text not null,
  type        text not null default 'manual' check (type in ('manual', 'dynamic')),
  product_ids text[] not null default '{}',
  rules       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists collections_tenant_idx on collections (tenant_id);

-- ----------------------------------------------------------------- products
create table if not exists products (
  id             text primary key,
  tenant_id      text not null references stores (id) on delete cascade,
  slug           text not null,
  name           text not null,
  brand          text not null default '',
  sku            text not null default '',
  description    text not null default '',
  category_id    text,
  subcategory_id text,
  category_slug  text not null default 'sarees',
  price          numeric(12, 2) not null default 0,
  mrp            numeric(12, 2) not null default 0,
  gst            numeric(5, 2) not null default 5,
  fabric         text not null default '',
  color          text not null default '',
  colors         text[] not null default '{}',
  pattern        text not null default '',
  occasion       text not null default '',
  region         text not null default '',
  weave          text not null default '',
  tags           text[] not null default '{}',
  badges         text[] not null default '{}',
  inventory      integer not null default 0,
  reserved       integer not null default 0,
  rating         numeric(3, 2) not null default 0,
  review_count   integer not null default 0,
  published      boolean not null default false,
  featured       boolean not null default false,
  sold_count     integer not null default 0,
  -- Sort key for "discount"; generated so the index stays in step with prices.
  discount_pct   numeric(6, 3) generated always as (
                   case when mrp > 0 then ((mrp - price) / mrp) * 100 else 0 end
                 ) stored,
  payload        jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- The catalogue is always filtered by tenant first; every index leads with it.
create index if not exists products_tenant_pub_created_idx
  on products (tenant_id, published, created_at desc);
create index if not exists products_tenant_pub_price_idx
  on products (tenant_id, published, price);
create index if not exists products_tenant_pub_rating_idx
  on products (tenant_id, published, rating desc);
create index if not exists products_tenant_pub_discount_idx
  on products (tenant_id, published, discount_pct desc);
create index if not exists products_tenant_category_idx
  on products (tenant_id, category_slug);
create index if not exists products_tenant_inventory_idx
  on products (tenant_id, inventory);
create index if not exists products_tenant_sold_idx
  on products (tenant_id, sold_count desc);

-- Facet filters arrive as multi-value OR conditions; these support = and IN.
create index if not exists products_facet_fabric_idx on products (tenant_id, fabric);
create index if not exists products_facet_occasion_idx on products (tenant_id, occasion);
create index if not exists products_facet_region_idx on products (tenant_id, region);
create index if not exists products_facet_weave_idx on products (tenant_id, weave);
create index if not exists products_facet_pattern_idx on products (tenant_id, pattern);
create index if not exists products_facet_brand_idx on products (tenant_id, brand);
create index if not exists products_colors_idx on products using gin (colors);
create index if not exists products_badges_idx on products using gin (badges);
create index if not exists products_tags_idx on products using gin (tags);

-- Full-text for whole words, trigram for the partial matches search-as-you-type
-- produces. Both are needed: to_tsquery cannot match "banar" inside "Banarasi".
alter table products
  add column if not exists search tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(fabric, '') || ' ' ||
      coalesce(weave, '') || ' ' || coalesce(region, '') || ' ' || coalesce(occasion, '') || ' ' ||
      coalesce(pattern, '') || ' ' || coalesce(color, '')
    )
  ) stored;

create index if not exists products_search_idx on products using gin (search);
create index if not exists products_name_trgm_idx on products using gin (name gin_trgm_ops);

-- ------------------------------------------------------------------ banners
create table if not exists banners (
  id            text primary key,
  tenant_id     text not null references stores (id) on delete cascade,
  name          text not null default 'Untitled banner',
  heading       text not null default '',
  subtitle      text not null default '',
  cta_text      text not null default '',
  cta_url       text not null default '',
  desktop_image text not null default '',
  tablet_image  text not null default '',
  mobile_image  text not null default '',
  overlay       text not null default 'center' check (overlay in ('center', 'left', 'right')),
  align         text not null default 'center' check (align in ('center', 'left', 'right')),
  theme         text not null default 'light' check (theme in ('light', 'dark')),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  start_date    date,
  end_date      date,
  sort_order    integer not null default 0,
  payload       jsonb not null,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists banners_tenant_order_idx on banners (tenant_id, sort_order);
create index if not exists banners_live_idx on banners (tenant_id, status, start_date, end_date);

-- ---------------------------------------------------------------- customers
create table if not exists customers (
  id             text primary key,
  tenant_id      text not null references stores (id) on delete cascade,
  user_id        text references users (id) on delete set null,
  name           text not null,
  email          text not null,
  phone          text not null default '',
  lifetime_value numeric(12, 2) not null default 0,
  orders_count   integer not null default 0,
  addresses      jsonb not null default '[]',
  created_at     timestamptz not null default now(),
  unique (tenant_id, email)
);

create index if not exists customers_tenant_idx on customers (tenant_id, created_at desc);
create index if not exists customers_email_idx on customers (lower(email));
create index if not exists customers_name_trgm_idx on customers using gin (name gin_trgm_ops);

-- ------------------------------------------------------------------- orders
-- Human-readable order numbers come from a sequence rather than random digits,
-- so two concurrent checkouts can never collide.
create sequence if not exists order_number_seq start 10001;

create table if not exists orders (
  id             text primary key,
  number         text not null unique,
  tenant_id      text not null references stores (id) on delete cascade,
  customer_id    text,
  user_id        text references users (id) on delete set null,
  customer_name  text not null default '',
  customer_email text not null default '',
  status         text not null default 'placed'
                 check (status in ('placed', 'confirmed', 'packed', 'shipped',
                                   'out_for_delivery', 'delivered', 'cancelled',
                                   'returned', 'refunded')),
  payment_status text not null default 'pending'
                 check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  payment_method text not null default 'upi'
                 check (payment_method in ('upi', 'card', 'netbanking', 'cod')),
  items          jsonb not null default '[]',
  address        jsonb not null default '{}',
  totals         jsonb not null default '{}',
  timeline       jsonb not null default '[]',
  tracking       jsonb,
  note           text not null default '',
  total          numeric(12, 2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orders_tenant_created_idx on orders (tenant_id, created_at desc);
create index if not exists orders_tenant_status_idx on orders (tenant_id, status, created_at desc);
create index if not exists orders_user_idx on orders (user_id, created_at desc);
create index if not exists orders_customer_idx on orders (customer_id, created_at desc);
create index if not exists orders_number_trgm_idx on orders using gin (number gin_trgm_ops);

-- ------------------------------------------------------------------ coupons
create table if not exists coupons (
  id           text primary key,
  tenant_id    text not null references stores (id) on delete cascade,
  code         text not null,
  type         text not null default 'percent' check (type in ('percent', 'fixed')),
  value        numeric(10, 2) not null default 0,
  min_order    numeric(12, 2) not null default 0,
  max_discount numeric(12, 2) not null default 0,
  first_order  boolean not null default false,
  usage_limit  integer not null default 1000,
  used         integer not null default 0,
  expires_at   date,
  product_ids  text[] not null default '{}',
  category_ids text[] not null default '{}',
  created_at   timestamptz not null default now(),
  unique (tenant_id, code)
);

-- --------------------------------------------------- reviews and questions
create table if not exists reviews (
  id         text primary key,
  tenant_id  text not null references stores (id) on delete cascade,
  product_id text not null references products (id) on delete cascade,
  user_id    text references users (id) on delete set null,
  author     text not null,
  rating     integer not null check (rating between 1 and 5),
  title      text not null default '',
  body       text not null default '',
  images     jsonb not null default '[]',
  verified   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists reviews_product_idx on reviews (product_id, created_at desc);
create index if not exists reviews_tenant_idx on reviews (tenant_id, created_at desc);
-- One review per person per product.
create unique index if not exists reviews_unique_author_idx
  on reviews (product_id, user_id) where user_id is not null;

create table if not exists questions (
  id         text primary key,
  tenant_id  text not null references stores (id) on delete cascade,
  product_id text not null references products (id) on delete cascade,
  question   text not null,
  answer     text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists questions_product_idx on questions (product_id, created_at desc);

-- ------------------------------------------------------------ notifications
create table if not exists notifications (
  id         text primary key,
  tenant_id  text not null references stores (id) on delete cascade,
  audience   text not null default 'admin' check (audience in ('admin', 'customer')),
  type       text not null default 'system',
  title      text not null,
  body       text not null default '',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_tenant_idx
  on notifications (tenant_id, audience, created_at desc);

-- ------------------------------------------------------- marketing capture
create table if not exists waitlist (
  id         text primary key,
  tenant_id  text references stores (id) on delete cascade,
  product_id text references products (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  unique (product_id, email)
);

create table if not exists newsletter_subscribers (
  id         text primary key,
  tenant_id  text references stores (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

-- --------------------------------------------- platform-wide editorial data
-- Testimonials, the Instagram strip, and popular searches are small key/value
-- documents rather than tables of their own.
create table if not exists platform_content (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Daily rollups so the dashboard never aggregates the orders table live.
create table if not exists daily_stats (
  tenant_id text not null references stores (id) on delete cascade,
  day       date not null,
  orders    integer not null default 0,
  gmv       numeric(14, 2) not null default 0,
  primary key (tenant_id, day)
);

create index if not exists daily_stats_day_idx on daily_stats (day);

-- Applied on clusters that already had an older schema.sql, so a migrate
-- without --drop still picks up the read-model columns.
alter table stores add column if not exists storefront_payload jsonb;
alter table products add column if not exists sold_count integer not null default 0;
