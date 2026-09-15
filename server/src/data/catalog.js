/*
 * Demo catalogue used by `npm run seed`. This is fixture data for a working
 * demo environment, not production content: a real deployment seeds only the
 * platform operator account and onboards stores through the API.
 *
 * All store and brand names here are invented for this project.
 */

const img = (photoId, width = 900) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=80`

export const PHOTOS = {
  hero1: img('photo-1610030469983-98e550d6193c', 1800),
  hero1m: img('photo-1610030469983-98e550d6193c', 800),
  hero2: img('photo-1490481651871-ab68de25d43d', 1800),
  hero2m: img('photo-1490481651871-ab68de25d43d', 800),
  hero3: img('photo-1539109136881-3be0616acf4b', 1800),
  hero3m: img('photo-1539109136881-3be0616acf4b', 800),
  editorial: img('photo-1483985988355-763728e1935b', 1400),
  artisan: img('photo-1445205170370-4dba8bf1d44e', 1400),
  festive: img('photo-1469334031218-e382a71b716b', 1400),
  look1: img('photo-1610030469983-98e550d6193c'),
  look2: img('photo-1490481651871-ab68de25d43d'),
  look3: img('photo-1539109136881-3be0616acf4b'),
  look4: img('photo-1483985988355-763728e1935b'),
  look5: img('photo-1469334031218-e382a71b716b'),
  look6: img('photo-1539109136881-3be0616acf4b'),
  look7: img('photo-1445205170370-4dba8bf1d44e'),
  look8: img('photo-1509631179647-0177331693ae'),
  look9: img('photo-1475180098004-ca77b745d2d5'),
  look10: img('photo-1487222477894-8943e31ef7b2'),
  look11: img('photo-1496747611176-843222e1e57c'),
  look12: img('photo-1485968579686-d4eacf6c0b9e'),
  weave: img('photo-1445205170370-4dba8bf1d44e', 800),
  insta1: img('photo-1610030469983-98e550d6193c', 600),
  insta2: img('photo-1490481651871-ab68de25d43d', 600),
  insta3: img('photo-1539109136881-3be0616acf4b', 600),
  insta4: img('photo-1483985988355-763728e1935b', 600),
  insta5: img('photo-1469334031218-e382a71b716b', 600),
  insta6: img('photo-1445205170370-4dba8bf1d44e', 600),
}

export const LOOKS = [
  PHOTOS.look1, PHOTOS.look2, PHOTOS.look3, PHOTOS.look4, PHOTOS.look5, PHOTOS.look6,
  PHOTOS.look7, PHOTOS.look8, PHOTOS.look9, PHOTOS.look10, PHOTOS.look11, PHOTOS.look12,
  PHOTOS.hero1, PHOTOS.hero2, PHOTOS.editorial, PHOTOS.artisan,
]

export const CATALOG_BLUEPRINT = [
  { name: 'Kashi Banarasi Silk Saree', fabric: 'Silk', weave: 'Banarasi', region: 'Banaras', occasion: 'Wedding', pattern: 'Floral jaal', color: 'Ruby', price: 18990, mrp: 24990, badge: 'handwoven' },
  { name: 'Temple Border Kanjivaram', fabric: 'Silk', weave: 'Kanjivaram', region: 'Kanchipuram', occasion: 'Wedding', pattern: 'Temple', color: 'Gold', price: 32990, mrp: 39990, badge: 'exclusive' },
  { name: 'Moonlight Chanderi Saree', fabric: 'Chanderi', weave: 'Plain', region: 'Chanderi', occasion: 'Festive', pattern: 'Zari booti', color: 'Ivory', price: 8990, mrp: 11990, badge: 'new' },
  { name: 'Garden Organza Saree', fabric: 'Organza', weave: 'Organza', region: 'Lucknow', occasion: 'Party', pattern: 'Embroidery', color: 'Blush', price: 7490, mrp: 9990, badge: 'trending' },
  { name: 'Handloom Cotton Kota', fabric: 'Cotton', weave: 'Kota', region: 'Rajasthan', occasion: 'Everyday', pattern: 'Checks', color: 'Indigo', price: 3990, mrp: 5490, badge: 'bestseller' },
  { name: 'Paithani Peacock Pallu', fabric: 'Silk', weave: 'Paithani', region: 'Maharashtra', occasion: 'Wedding', pattern: 'Peacock', color: 'Emerald', price: 27990, mrp: 34990, badge: 'handwoven' },
  { name: 'Ikat Pochampally Silk', fabric: 'Silk', weave: 'Ikat', region: 'Telangana', occasion: 'Festive', pattern: 'Ikat', color: 'Teal', price: 12990, mrp: 15990, badge: 'exclusive' },
  { name: 'Tussar Ghicha Meadow', fabric: 'Tussar', weave: 'Ghicha', region: 'Bhagalpur', occasion: 'Work', pattern: 'Texture', color: 'Sand', price: 6990, mrp: 8990, badge: 'new' },
  { name: 'Bandhani Tie-Dye Georgette', fabric: 'Georgette', weave: 'Bandhani', region: 'Gujarat', occasion: 'Festive', pattern: 'Bandhani', color: 'Maroon', price: 5990, mrp: 7990, badge: 'sale' },
  { name: 'Patola Heritage Silk', fabric: 'Silk', weave: 'Patola', region: 'Patan', occasion: 'Wedding', pattern: 'Geometric', color: 'Crimson', price: 45990, mrp: 52990, badge: 'limited' },
  { name: 'Maheshwari River Weave', fabric: 'Maheshwari', weave: 'Maheshwari', region: 'Madhya Pradesh', occasion: 'Everyday', pattern: 'Stripes', color: 'Sage', price: 5490, mrp: 6990, badge: 'bestseller' },
  { name: 'Jamdani Muslin Bloom', fabric: 'Muslin', weave: 'Jamdani', region: 'Bengal', occasion: 'Festive', pattern: 'Floral', color: 'White', price: 15990, mrp: 19990, badge: 'handwoven' },
  { name: 'Linen Summer Saree', fabric: 'Linen', weave: 'Plain', region: 'West Bengal', occasion: 'Everyday', pattern: 'Solid', color: 'Ochre', price: 4490, mrp: 5990, badge: 'new' },
  { name: 'Zari Tissue Evening Saree', fabric: 'Tissue', weave: 'Zari', region: 'Banaras', occasion: 'Party', pattern: 'Shimmer', color: 'Champagne', price: 9990, mrp: 13990, badge: 'trending' },
  { name: 'Kalamkari Narrative Silk', fabric: 'Silk', weave: 'Kalamkari', region: 'Andhra', occasion: 'Festive', pattern: 'Narrative', color: 'Indigo', price: 11990, mrp: 14990, badge: 'exclusive' },
  { name: 'Assam Muga Gold Saree', fabric: 'Muga', weave: 'Muga', region: 'Assam', occasion: 'Wedding', pattern: 'Motif', color: 'Honey', price: 38990, mrp: 44990, badge: 'limited' },
]

export const CATEGORY_TREE = [
  {
    slug: 'sarees',
    name: 'Sarees',
    children: [
      { slug: 'banarasi', name: 'Banarasi' },
      { slug: 'kanjivaram', name: 'Kanjivaram' },
      { slug: 'chanderi', name: 'Chanderi' },
      { slug: 'organza', name: 'Organza' },
      { slug: 'silk', name: 'Silk' },
      { slug: 'cotton', name: 'Cotton' },
    ],
  },
  { slug: 'new-arrivals', name: 'New Arrivals', children: [] },
  { slug: 'best-sellers', name: 'Best Sellers', children: [] },
  { slug: 'wedding', name: 'Wedding', children: [] },
  { slug: 'festive', name: 'Festive', children: [] },
  { slug: 'collections', name: 'Collections', children: [] },
  { slug: 'fabrics', name: 'Fabrics', children: [] },
  { slug: 'regional', name: 'Regional', children: [] },
  { slug: 'accessories', name: 'Accessories', children: [] },
  { slug: 'sale', name: 'Sale', children: [] },
]

export const STORE_BLUEPRINTS = [
  {
    id: 'store_noor',
    slug: 'atelier-noor',
    name: 'Atelier Noor',
    tagline: 'Weaves of quiet luxury',
    themeId: 'heritage-luxury',
    domain: 'ateliernoor.example',
    email: 'hello@ateliernoor.example',
    phone: '+91 98765 11111',
    city: 'Bengaluru',
    announcement: 'Complimentary blouse stitching on weaves above ₹9,999 · Pan-India shipping',
  },
  {
    id: 'store_mayura',
    slug: 'mayura-silks',
    name: 'Mayura Silks',
    tagline: 'Celebration, tailored in silk',
    themeId: 'festive-india',
    domain: 'mayurasilks.example',
    email: 'hello@mayurasilks.example',
    phone: '+91 98765 22222',
    city: 'Jaipur',
    announcement: 'Wedding edit now open · Appointments in Jaipur & Delhi',
  },
  {
    id: 'store_kashika',
    slug: 'kashika-looms',
    name: 'Kashika Looms',
    tagline: 'From the looms of the old city',
    themeId: 'ethnic-atelier',
    domain: 'kashikalooms.example',
    email: 'hello@kashikalooms.example',
    phone: '+91 98765 33333',
    city: 'Varanasi',
    announcement: 'Handloom fortnight · Direct from master weavers',
  },
  {
    id: 'store_nivaa',
    slug: 'nivaa-studio',
    name: 'Nivaa Studio',
    tagline: 'Soft luxury for every hour',
    themeId: 'soft-luxe',
    domain: 'nivaastudio.example',
    email: 'hello@nivaastudio.example',
    phone: '+91 98765 44444',
    city: 'Mumbai',
    announcement: 'New season pastels have arrived',
  },
  {
    id: 'store_prithvi',
    slug: 'prithvi-atelier',
    name: 'Prithvi Atelier',
    tagline: 'Craft, colour, and the handmade',
    themeId: 'artisan-earth',
    domain: 'prithviatelier.example',
    email: 'hello@prithviatelier.example',
    phone: '+91 98765 55555',
    city: 'Ahmedabad',
    announcement: 'Each piece is numbered and signed by the artisan',
  },
  {
    id: 'store_utsav',
    slug: 'utsav-edit',
    name: 'Utsav Edit',
    tagline: 'Modern Indian, made to celebrate',
    themeId: 'festive-modern',
    domain: 'utsavedit.example',
    email: 'hello@utsavedit.example',
    phone: '+91 98765 66666',
    city: 'Hyderabad',
    announcement: 'Festive campaign live · Express shipping till Diwali',
  },
  {
    id: 'store_ivory',
    slug: 'ivory-house',
    name: 'Ivory House',
    tagline: 'Quiet gold. Considered form.',
    themeId: 'contemporary-luxury',
    domain: 'ivoryhouse.example',
    email: 'hello@ivoryhouse.example',
    phone: '+91 98765 77777',
    city: 'Delhi',
    announcement: 'Private viewing rooms by appointment',
  },
  {
    id: 'store_linen',
    slug: 'linen-lane',
    name: 'Linen Lane',
    tagline: 'Light weaves. Clear lines.',
    themeId: 'modern-minimal',
    domain: 'linenlane.example',
    email: 'hello@linenlane.example',
    phone: '+91 98765 88888',
    city: 'Chennai',
    announcement: 'Free shipping on all linen weaves',
  },
]

export const TESTIMONIALS = [
  { author: 'Ananya Rao', role: 'Bengaluru', quote: 'The pallu falls with the kind of weight that photographs never quite capture.' },
  { author: 'Meera Iyer', role: 'Chennai', quote: 'Quiet luxury, considered service, and weaves I will keep for decades.' },
  { author: 'Zara Khan', role: 'Delhi', quote: 'A storefront that feels like a private atelier rather than a catalogue.' },
]

export const INSTAGRAM = [
  PHOTOS.insta1, PHOTOS.insta2, PHOTOS.insta3, PHOTOS.insta4, PHOTOS.insta5, PHOTOS.insta6,
]

export const POPULAR_SEARCHES = ['Banarasi', 'Kanjivaram', 'Wedding silk', 'Organza', 'Handloom']
