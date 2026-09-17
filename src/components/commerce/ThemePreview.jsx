import { themeToCssVars } from '../../theme/themes.js'
import { cx } from '../../utils/index.js'

/** Mini storefront used when picking a theme in admin and on the landing page. */
export function ThemePreview({ theme, storeName = 'Your house', className }) {
  if (!theme) return null
  const style = themeToCssVars(theme)
  const sareeGallery = theme.id === 'six-yards'
  return (
    <div
      className={cx('theme-live-preview', sareeGallery && 'is-saree-gallery', className)}
      style={style}
      data-theme={theme.id}
      aria-hidden="true"
    >
      <div className="tlp-bar">
        <span className="tlp-logo">{storeName}</span>
        <span className="tlp-nav">{sareeGallery ? 'Sarees · Weaves · Wedding' : 'Shop · Wedding · Festive'}</span>
        <span className="tlp-icon" />
      </div>
      {sareeGallery ? <div className="tlp-search" /> : null}
      <div className={cx('tlp-hero', sareeGallery && 'tlp-hero-saree')}>
        <p className="tlp-kicker">{sareeGallery ? 'Festive sarees' : 'New season'}</p>
        <strong>{sareeGallery ? 'Six yards, considered' : 'Weaves, considered'}</strong>
        <span className="tlp-cta">{sareeGallery ? 'Shop the pallu' : 'Shop the edit'}</span>
      </div>
      <div className={cx('tlp-cards', sareeGallery && 'tlp-cards-round')}>
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
