export const FONT_CATALOG = {
  cormorant: {
    name: 'Cormorant Garamond',
    href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  },
  jost: {
    name: 'Jost',
    href: 'https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&display=swap',
  },
  playfair: {
    name: 'Playfair Display',
    href: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
  },
  nunito: {
    name: 'Nunito Sans',
    href: 'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700&display=swap',
  },
  fraunces: {
    name: 'Fraunces',
    href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap',
  },
  sourceSans: {
    name: 'Source Sans 3',
    href: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700&display=swap',
  },
  libre: {
    name: 'Libre Baskerville',
    href: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap',
  },
  outfit: {
    name: 'Outfit',
    href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',
  },
  karla: {
    name: 'Karla',
    href: 'https://fonts.googleapis.com/css2?family=Karla:wght@300;400;500;600;700&display=swap',
  },
  cinzel: {
    name: 'Cinzel',
    href: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&display=swap',
  },
  raleway: {
    name: 'Raleway',
    href: 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap',
  },
  ibmPlex: {
    name: 'IBM Plex Sans',
    href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
  },
  inter: {
    name: 'Inter',
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  },
  devanagari: {
    name: 'Noto Sans Devanagari',
    href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap',
  },
}

const loadedFonts = new Set()

export function loadFont(fontKey) {
  const font = FONT_CATALOG[fontKey]
  if (!font || loadedFonts.has(fontKey)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = font.href
  link.dataset.font = fontKey
  document.head.appendChild(link)
  loadedFonts.add(fontKey)
}

export function createTheme(partial) {
  return {
    id: 'heritage-luxury',
    name: 'Heritage Luxury',
    description: 'Cream grounds, deep traditional accents, editorial photography.',
    previewImage: '',
    layoutStyle: 'editorial',
    primaryColor: '#6B1D2A',
    secondaryColor: '#1F1A17',
    accentColor: '#C4A35A',
    backgroundColor: '#F7F1E8',
    surfaceColor: '#FFFDF8',
    textColor: '#1F1A17',
    mutedTextColor: '#6B6258',
    borderColor: '#E4D9C8',
    headingFont: 'cormorant',
    bodyFont: 'jost',
    borderRadius: '2px',
    buttonStyle: 'sharp',
    cardStyle: 'minimal',
    headerStyle: 'classic',
    footerStyle: 'columns',
    productCardStyle: 'minimal',
    bannerStyle: 'editorial',
    spacingScale: 1,
    typographyScale: 1,
    animationLevel: 'subtle',
    ...partial,
  }
}

export const THEMES = [
  createTheme({
    id: 'heritage-luxury',
    name: 'Heritage Luxury',
    description: 'Sophisticated cream palettes, deep maroon, and generous editorial whitespace.',
    layoutStyle: 'editorial',
    primaryColor: '#6B1D2A',
    secondaryColor: '#24181A',
    accentColor: '#C4A35A',
    backgroundColor: '#F6F0E6',
    surfaceColor: '#FFFDF8',
    textColor: '#24181A',
    mutedTextColor: '#6F645A',
    borderColor: '#E6DCCB',
    headingFont: 'cormorant',
    bodyFont: 'jost',
    bannerStyle: 'editorial',
    productCardStyle: 'minimal',
    headerStyle: 'classic',
  }),
  createTheme({
    id: 'soft-luxe',
    name: 'Soft Luxe',
    description: 'Feminine contemporary luxury with blush neutrals and clean product grids.',
    layoutStyle: 'fashion-forward',
    primaryColor: '#A45B66',
    secondaryColor: '#2C2424',
    accentColor: '#D9B7A8',
    backgroundColor: '#FBF6F2',
    surfaceColor: '#FFFFFF',
    textColor: '#2C2424',
    mutedTextColor: '#7A6C68',
    borderColor: '#EADDD6',
    headingFont: 'playfair',
    bodyFont: 'nunito',
    buttonStyle: 'soft',
    cardStyle: 'soft',
    headerStyle: 'centered',
    productCardStyle: 'bordered',
    bannerStyle: 'split',
  }),
  createTheme({
    id: 'artisan-earth',
    name: 'Artisan Earth',
    description: 'Handcrafted heritage with earthy clay, sand, and storytelling layouts.',
    layoutStyle: 'storytelling',
    primaryColor: '#7C4A2D',
    secondaryColor: '#2E261F',
    accentColor: '#A97843',
    backgroundColor: '#F3EBE0',
    surfaceColor: '#FBF7F0',
    textColor: '#2E261F',
    mutedTextColor: '#6E6256',
    borderColor: '#DDD0BE',
    headingFont: 'fraunces',
    bodyFont: 'sourceSans',
    bannerStyle: 'story',
    productCardStyle: 'editorial',
    footerStyle: 'editorial',
  }),
  createTheme({
    id: 'festive-modern',
    name: 'Festive Modern',
    description: 'Bold campaign imagery, strong category navigation, and merchandising energy.',
    layoutStyle: 'campaign',
    primaryColor: '#8B1E3F',
    secondaryColor: '#111111',
    accentColor: '#E2B857',
    backgroundColor: '#FAF6F0',
    surfaceColor: '#FFFFFF',
    textColor: '#1A1214',
    mutedTextColor: '#6A5A5E',
    borderColor: '#E8D9C8',
    headingFont: 'libre',
    bodyFont: 'outfit',
    headerStyle: 'split',
    bannerStyle: 'fullscreen',
    productCardStyle: 'overlay',
    buttonStyle: 'pill',
  }),
  createTheme({
    id: 'ethnic-atelier',
    name: 'Ethnic Atelier',
    description: 'Traditional Indian, product-centric, with rich saree categorization.',
    layoutStyle: 'catalog',
    primaryColor: '#7A1F2B',
    secondaryColor: '#1C1612',
    accentColor: '#C9922A',
    backgroundColor: '#F8F3EA',
    surfaceColor: '#FFFCF6',
    textColor: '#1C1612',
    mutedTextColor: '#6A5E52',
    borderColor: '#E3D6C2',
    headingFont: 'cormorant',
    bodyFont: 'karla',
    productCardStyle: 'bordered',
    bannerStyle: 'carousel',
  }),
  createTheme({
    id: 'contemporary-luxury',
    name: 'Contemporary Luxury',
    description: 'Ivory, black, and muted gold with editorial type and large photography.',
    layoutStyle: 'editorial-minimal',
    primaryColor: '#111111',
    secondaryColor: '#111111',
    accentColor: '#B8A06A',
    backgroundColor: '#F6F3EE',
    surfaceColor: '#FFFFFF',
    textColor: '#111111',
    mutedTextColor: '#6B655C',
    borderColor: '#E2DCD2',
    headingFont: 'cormorant',
    bodyFont: 'inter',
    headerStyle: 'minimal',
    footerStyle: 'centered',
    bannerStyle: 'fullscreen',
    productCardStyle: 'minimal',
    buttonStyle: 'sharp',
  }),
  createTheme({
    id: 'modern-minimal',
    name: 'Modern Minimal',
    description: 'White, charcoal, and beige with clean type and an extremely lightweight UI.',
    layoutStyle: 'minimal',
    primaryColor: '#2C2C2C',
    secondaryColor: '#2C2C2C',
    accentColor: '#C4B6A6',
    backgroundColor: '#FFFFFF',
    surfaceColor: '#FAFAF8',
    textColor: '#2C2C2C',
    mutedTextColor: '#6F6A64',
    borderColor: '#E8E2D9',
    headingFont: 'outfit',
    bodyFont: 'outfit',
    headerStyle: 'minimal',
    productCardStyle: 'minimal',
    bannerStyle: 'static',
    buttonStyle: 'sharp',
    animationLevel: 'none',
  }),
  createTheme({
    id: 'festive-india',
    name: 'Festive India',
    description: 'Rich Indian colour, wedding collections, and celebration merchandising.',
    layoutStyle: 'festive',
    primaryColor: '#6E1023',
    secondaryColor: '#1A0E10',
    accentColor: '#D4AF37',
    backgroundColor: '#F8F0E4',
    surfaceColor: '#FFF9F0',
    textColor: '#1A0E10',
    mutedTextColor: '#6E5A48',
    borderColor: '#E8D5B5',
    headingFont: 'cinzel',
    bodyFont: 'nunito',
    buttonStyle: 'pill',
    bannerStyle: 'fullscreen',
    productCardStyle: 'overlay',
    headerStyle: 'classic',
  }),
  createTheme({
    id: 'six-yards',
    name: 'Six Yards',
    description: 'Sarees only — white gallery, maroon wordmark, pill search, and rounded drape photography.',
    layoutStyle: 'saree-gallery',
    primaryColor: '#832729',
    secondaryColor: '#212529',
    accentColor: '#E8D5C4',
    backgroundColor: '#FFFFFF',
    surfaceColor: '#FFFFFF',
    textColor: '#212529',
    mutedTextColor: '#707070',
    borderColor: '#E8E0D6',
    headingFont: 'raleway',
    bodyFont: 'ibmPlex',
    borderRadius: '12px',
    buttonStyle: 'pill',
    cardStyle: 'soft',
    headerStyle: 'search-rail',
    footerStyle: 'columns',
    productCardStyle: 'gallery',
    bannerStyle: 'static',
    animationLevel: 'subtle',
  }),
]

export function getThemeById(id) {
  return THEMES.find((theme) => theme.id === id) || THEMES[0]
}

export function themeToCssVars(theme) {
  const heading = FONT_CATALOG[theme.headingFont]?.name || 'Cormorant Garamond'
  const body = FONT_CATALOG[theme.bodyFont]?.name || 'Jost'
  const radius = theme.borderRadius || '2px'
  return {
    '--color-primary': theme.primaryColor,
    '--color-secondary': theme.secondaryColor,
    '--color-accent': theme.accentColor,
    '--color-bg': theme.backgroundColor,
    '--color-surface': theme.surfaceColor,
    '--color-text': theme.textColor,
    '--color-muted': theme.mutedTextColor,
    '--color-border': theme.borderColor,
    '--font-heading': `"${heading}", "Times New Roman", serif`,
    '--font-body': `"${body}", system-ui, sans-serif`,
    '--radius': radius,
    '--radius-sm': radius,
    '--radius-md': theme.buttonStyle === 'pill' ? '999px' : radius,
    '--radius-lg': theme.cardStyle === 'soft' ? '16px' : radius,
    '--space-scale': String(theme.spacingScale || 1),
    '--type-scale': String(theme.typographyScale || 1),
    '--header-height': theme.headerStyle === 'search-rail' ? '72px' : theme.headerStyle === 'minimal' ? '64px' : '78px',
  }
}

export function applyTheme(theme, target = document.documentElement) {
  if (!theme) return
  loadFont(theme.headingFont)
  loadFont(theme.bodyFont)
  const vars = themeToCssVars(theme)
  Object.entries(vars).forEach(([key, value]) => target.style.setProperty(key, value))
  target.dataset.theme = theme.id
  target.dataset.header = theme.headerStyle
  target.dataset.card = theme.productCardStyle
  target.dataset.button = theme.buttonStyle
  target.dataset.banner = theme.bannerStyle
  target.dataset.footer = theme.footerStyle
  target.dataset.motion = theme.animationLevel || 'subtle'
}
