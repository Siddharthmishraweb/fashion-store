export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  STORE_OWNER: 'store_owner',
  STORE_ADMIN: 'store_admin',
  STORE_MANAGER: 'store_manager',
  CONTENT_MANAGER: 'content_manager',
  INVENTORY_MANAGER: 'inventory_manager',
  CUSTOMER: 'customer',
}

export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.STORE_OWNER]: [
    'store.dashboard',
    'store.products',
    'store.categories',
    'store.collections',
    'store.orders',
    'store.customers',
    'store.inventory',
    'store.banners',
    'store.homepage',
    'store.coupons',
    'store.reviews',
    'store.analytics',
    'store.appearance',
    'store.settings',
    'store.users',
  ],
  [ROLES.STORE_ADMIN]: [
    'store.dashboard',
    'store.products',
    'store.categories',
    'store.collections',
    'store.orders',
    'store.customers',
    'store.inventory',
    'store.banners',
    'store.homepage',
    'store.coupons',
    'store.reviews',
    'store.analytics',
    'store.appearance',
    'store.settings',
  ],
  [ROLES.STORE_MANAGER]: [
    'store.dashboard',
    'store.products',
    'store.orders',
    'store.customers',
    'store.inventory',
  ],
  [ROLES.CONTENT_MANAGER]: [
    'store.dashboard',
    'store.banners',
    'store.homepage',
    'store.appearance',
    'store.collections',
    'store.categories',
  ],
  [ROLES.INVENTORY_MANAGER]: [
    'store.dashboard',
    'store.products',
    'store.inventory',
  ],
  [ROLES.CUSTOMER]: ['account'],
}

export function hasPermission(role, permission) {
  const list = ROLE_PERMISSIONS[role] || []
  return list.includes('*') || list.includes(permission)
}

export const STORE_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DRAFT: 'draft',
}

export const ORDER_STATUS = [
  'placed',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
  'refunded',
]

export const PRODUCT_BADGES = [
  'new',
  'bestseller',
  'trending',
  'limited',
  'handwoven',
  'exclusive',
  'sale',
]

/** Catalogue attributes offered as dropdowns; “None” lets the merchant type a custom value. */
export const PRODUCT_ATTRIBUTES = {
  fabric: ['Silk', 'Cotton', 'Organza', 'Chanderi', 'Linen', 'Georgette', 'Tussar', 'Maheshwari', 'Muslin', 'Tissue', 'Muga'],
  weave: ['Banarasi', 'Kanjivaram', 'Paithani', 'Ikat', 'Jamdani', 'Patola', 'Bandhani', 'Kalamkari', 'Kota', 'Maheshwari', 'Ghicha', 'Muga', 'Zari', 'Plain'],
  color: ['Green', 'Ruby', 'Gold', 'Ivory', 'Blush', 'Indigo', 'Emerald', 'Teal', 'Sand', 'Maroon', 'Crimson', 'Sage', 'White', 'Ochre', 'Champagne', 'Honey', 'Red', 'Pink', 'Blue', 'Black', 'Yellow', 'Orange', 'Purple', 'Brown', 'Grey'],
  pattern: ['Floral', 'Floral jaal', 'Temple', 'Zari booti', 'Embroidery', 'Checks', 'Peacock', 'Ikat', 'Geometric', 'Stripes', 'Solid', 'Bandhani', 'Shimmer', 'Narrative', 'Motif', 'Texture', 'Normal'],
  occasion: ['Wedding', 'Festive', 'Party', 'Everyday', 'Work'],
  region: ['Banaras', 'Kanchipuram', 'Chanderi', 'Lucknow', 'Rajasthan', 'Maharashtra', 'Telangana', 'Bhagalpur', 'Gujarat', 'Patan', 'Madhya Pradesh', 'Bengal', 'West Bengal', 'Andhra', 'Assam', 'Mumbai'],
}

export const HOMEPAGE_BLOCKS = [
  { type: 'announcement', label: 'Announcement' },
  { type: 'hero_banner', label: 'Hero Banner' },
  { type: 'carousel', label: 'Carousel' },
  { type: 'category_grid', label: 'Category Grid' },
  { type: 'product_grid', label: 'Product Grid' },
  { type: 'product_slider', label: 'Product Slider' },
  { type: 'collection_banner', label: 'Collection Banner' },
  { type: 'image_text', label: 'Image + Text' },
  { type: 'full_width_image', label: 'Full Width Image' },
  { type: 'split_editorial', label: 'Split Editorial' },
  { type: 'video', label: 'Video Section' },
  { type: 'brand_story', label: 'Brand Story' },
  { type: 'shop_by_fabric', label: 'Shop by Fabric' },
  { type: 'shop_by_occasion', label: 'Shop by Occasion' },
  { type: 'shop_by_region', label: 'Shop by Region' },
  { type: 'testimonials', label: 'Testimonials' },
  { type: 'instagram', label: 'Instagram Grid' },
  { type: 'newsletter', label: 'Newsletter' },
  { type: 'countdown', label: 'Countdown' },
  { type: 'featured_brands', label: 'Featured Brands' },
  { type: 'recently_viewed', label: 'Recently Viewed' },
  { type: 'recommended', label: 'Recommended Products' },
]
