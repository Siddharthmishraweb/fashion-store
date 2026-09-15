import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveImage } from '../common/index.jsx'
import { useMedia } from '../../hooks/index.js'
import { safeUrl } from '../../utils/security.js'

export function HeroCarousel({ banners = [], config = {}, base }) {
  const slides = banners.filter((b) => b && (b.desktopImage || b.mobileImage))
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduceMotion = useMedia('(prefers-reduced-motion: reduce)')
  const touchStart = useRef(null)
  const count = slides.length

  const go = useCallback((next) => {
    if (!count) return
    setIndex(((next % count) + count) % count)
  }, [count])

  useEffect(() => {
    setIndex((i) => (i < count ? i : 0))
  }, [count])

  useEffect(() => {
    if (!config.autoplay || reduceMotion || paused || count < 2) return undefined
    const id = setInterval(() => setIndex((i) => (i + 1) % count), Math.max(2500, config.autoplaySpeed || 5000))
    return () => clearInterval(id)
  }, [config.autoplay, config.autoplaySpeed, reduceMotion, paused, count])

  if (!count) return null
  const slide = slides[index]
  const href = safeUrl(slide.ctaUrl, { allowExternal: false }) || `${base}/products`

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Featured collections"
      onMouseEnter={() => config.pauseOnHover !== false && setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return
        const delta = e.changedTouches[0].clientX - touchStart.current
        if (Math.abs(delta) > 50) go(index + (delta < 0 ? 1 : -1))
        touchStart.current = null
      }}
    >
      <div
        className={`hero-slide overlay-${slide.overlay || 'center'} tone-${slide.theme || 'light'}`}
        role="group"
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${count}: ${slide.heading}`}
      >
        <ResponsiveImage
          desktop={slide.desktopImage}
          tablet={slide.tabletImage}
          mobile={slide.mobileImage}
          alt={slide.heading || ''}
          priority={index === 0}
          className="hero-img"
        />
        <div className="hero-copy" style={{ textAlign: slide.align || 'center' }}>
          {slide.subtitle ? <p className="caption">{slide.subtitle}</p> : null}
          <h1>{slide.heading}</h1>
          {slide.ctaText ? (
            <Link className="btn btn-hero" to={href}>{slide.ctaText}</Link>
          ) : null}
        </div>
      </div>

      {config.showArrows !== false && count > 1 ? (
        <div className="hero-nav">
          <button type="button" aria-label="Previous slide" onClick={() => go(index - 1)}>‹</button>
          <button type="button" aria-label="Next slide" onClick={() => go(index + 1)}>›</button>
        </div>
      ) : null}

      {config.showDots !== false && count > 1 ? (
        <div className="dots" role="tablist" aria-label="Choose slide">
          {slides.map((s, i) => (
            <button
              key={s.id || i}
              type="button"
              role="tab"
              className={i === index ? 'on' : ''}
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => go(i)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
