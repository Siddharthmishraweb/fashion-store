/*
 * The set of homepage sections the builder may place. Mirrors HOMEPAGE_BLOCKS
 * in src/config/constants.js; a section type the client does not know how to
 * render is rejected here rather than stored and silently skipped later.
 */
export const HOMEPAGE_BLOCK_TYPES = [
  'announcement',
  'hero_banner',
  'carousel',
  'category_grid',
  'product_grid',
  'product_slider',
  'collection_banner',
  'image_text',
  'full_width_image',
  'split_editorial',
  'video',
  'brand_story',
  'shop_by_fabric',
  'shop_by_occasion',
  'shop_by_region',
  'testimonials',
  'instagram',
  'newsletter',
  'countdown',
  'featured_brands',
  'recently_viewed',
  'recommended',
]
