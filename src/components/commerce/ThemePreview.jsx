import { themeToCssVars } from '../../theme/themes.js'
import { cx } from '../../utils/index.js'

/** Mini storefront used when picking a theme in admin and on the landing page. */
export function ThemePreview({ theme, storeName = 'Your house', className }) {
  if (!theme) return null
  const style = themeToCssVars(theme)
  return (
    <div
      className={cx('theme-live-preview', className)}
      style={style}
      data-theme={theme.id}
      aria-hidden="true"
    >
      <div className="tlp-bar">
        <span className="tlp-logo">{storeName}</span>
        <span className="tlp-nav">Shop · Wedding · Festive</span>
        <span className="tlp-icon" />
      </div>
      <div className="tlp-hero">
        <p className="tlp-kicker">New season</p>
        <strong>Weaves, considered</strong>
        <span className="tlp-cta">Shop the edit</span>
      </div>
      <div className="tlp-cards">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
