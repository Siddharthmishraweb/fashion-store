const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.75',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

export function IconHeart({ filled = false, size = 20 }) {
  return (
    <svg width={size} height={size} {...svgProps} fill={filled ? 'currentColor' : 'none'}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  )
}

export function IconSearch({ size = 20 }) {
  return (
    <svg width={size} height={size} {...svgProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function IconBag({ size = 20 }) {
  return (
    <svg width={size} height={size} {...svgProps}>
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V7a3 3 0 0 1 6 0v1" />
    </svg>
  )
}

export function IconUser({ size = 20 }) {
  return (
    <svg width={size} height={size} {...svgProps}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 19a7 7 0 0 1 14 0" />
    </svg>
  )
}

export function IconHome({ size = 20 }) {
  return (
    <svg width={size} height={size} {...svgProps}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  )
}

export function IconMenu({ size = 20 }) {
  return (
    <svg width={size} height={size} {...svgProps}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}
