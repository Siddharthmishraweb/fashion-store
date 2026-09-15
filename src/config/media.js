const stock = (id, w) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`

/**
 * Curated, royalty-free imagery offered inside the banner and homepage editors
 * so a non-technical store owner can publish without hunting for a URL.
 */
export const STOCK_LIBRARY = [
  { id: 'drape-ruby', label: 'Ruby drape', photoId: 'photo-1610030469983-98e550d6193c' },
  { id: 'studio-light', label: 'Studio light', photoId: 'photo-1490481651871-ab68de25d43d' },
  { id: 'gold-zari', label: 'Gold zari', photoId: 'photo-1539109136881-3be0616acf4b' },
  { id: 'editorial', label: 'Editorial portrait', photoId: 'photo-1483985988355-763728e1935b' },
  { id: 'loom', label: 'At the loom', photoId: 'photo-1445205170370-4dba8bf1d44e' },
  { id: 'festive', label: 'Festive table', photoId: 'photo-1469334031218-e382a71b716b' },
  { id: 'pastel', label: 'Pastel weave', photoId: 'photo-1539109136881-3be0616acf4b' },
  { id: 'linen', label: 'Linen texture', photoId: 'photo-1558171813-4c8843f2e36c' },
  { id: 'jewellery', label: 'Heirloom gold', photoId: 'photo-1515562141207-7a88fb7ce338' },
  { id: 'window', label: 'Window light', photoId: 'photo-1509631179647-0177331693ae' },
].map((item) => ({
  ...item,
  thumb: stock(item.photoId, 320),
  mobile: stock(item.photoId, 800),
  tablet: stock(item.photoId, 1200),
  desktop: stock(item.photoId, 1800),
}))

export const BANNER_ASPECTS = {
  desktop: { label: 'Desktop', ratio: '16 / 7', guidance: '2400 × 1050 px or larger' },
  tablet: { label: 'Tablet', ratio: '4 / 3', guidance: '1600 × 1200 px' },
  mobile: { label: 'Mobile', ratio: '4 / 5', guidance: '1080 × 1350 px' },
}
