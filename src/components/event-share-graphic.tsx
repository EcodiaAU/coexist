import { forwardRef } from 'react'
import { APP_NAME, TAGLINE } from '@/lib/constants'

/* ====================================================================== */
/*  EventShareGraphic                                                      */
/*                                                                         */
/*  Renders a Co-Exist-branded share graphic for an event in one of three  */
/*  Instagram-friendly aspect ratios. Designed to be rendered off-screen   */
/*  and captured to PNG by html2canvas.                                    */
/*                                                                         */
/*  - 1:1   square    1080x1080  (IG square)                               */
/*  - 4:5   portrait  1080x1350  (IG feed-optimal)                         */
/*  - 16:9  landscape 1920x1080  (IG story / FB / general)                 */
/* ====================================================================== */

export type ShareSize = 'square' | 'portrait' | 'landscape'

export interface ShareSizeSpec {
  width: number
  height: number
  label: string
  aspect: string
}

// eslint-disable-next-line react-refresh/only-export-components
export const SHARE_SIZES: Record<ShareSize, ShareSizeSpec> = {
  square:    { width: 1080, height: 1080, label: 'Square',    aspect: '1:1'  },
  portrait:  { width: 1080, height: 1350, label: 'Portrait',  aspect: '4:5'  },
  landscape: { width: 1920, height: 1080, label: 'Landscape', aspect: '16:9' },
}

export interface EventShareGraphicProps {
  size: ShareSize
  title: string
  dateLabel: string         // e.g. "Sat, 10 May - 9:00 AM"
  locationLabel: string     // venue name OR address text
  collectiveName?: string | null
  coverImageUrl?: string | null
  /** Brand-like fallback when no cover image is available. */
  fallbackGradient?: boolean
  /** When true, set position absolute to keep this off-screen (for capture). */
  offscreen?: boolean
}

/* Co-Exist primary palette - sourced from src/styles/globals.css @theme block */
const BRAND_GREEN_400 = '#869e62'
const BRAND_GREEN_600 = '#5d7340'
const BRAND_GREEN_700 = '#4a5c34'
const BRAND_CREAM     = '#fafaf5'

/* ------------------------------------------------------------------ */
/*  Inline store badges (SVG)                                          */
/* ------------------------------------------------------------------ */

function AppStoreBadge({ height = 56 }: { height?: number }) {
  const w = height * (140 / 42)
  return (
    <svg
      width={w}
      height={height}
      viewBox="0 0 140 42"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Download on the App Store"
    >
      <rect width="140" height="42" rx="8" fill="#000" />
      <path
        d="M30.4 22.2c0-3.4 2.8-5 2.9-5.1-1.6-2.3-4-2.6-4.9-2.6-2.1-.2-4 1.2-5.1 1.2-1.1 0-2.7-1.2-4.4-1.2-2.3.1-4.4 1.3-5.5 3.4-2.4 4.1-.6 10.1 1.7 13.4 1.1 1.6 2.5 3.4 4.2 3.3 1.7-.1 2.4-1.1 4.5-1.1 2.1 0 2.7 1.1 4.5 1.1 1.9 0 3-1.6 4.2-3.2 1.3-1.8 1.8-3.6 1.9-3.7-.1 0-3.6-1.4-3.6-5.5zM27.1 12.6c.9-1.1 1.6-2.7 1.4-4.3-1.4 0-3.1.9-4.1 2-.9 1-1.7 2.6-1.5 4.1 1.6.2 3.2-.7 4.2-1.8z"
        fill="#fff"
      />
      <text x="46" y="17" fill="#fff" fontFamily="-apple-system, system-ui, sans-serif" fontSize="8.5" fontWeight="400">
        Download on the
      </text>
      <text x="46" y="32" fill="#fff" fontFamily="-apple-system, system-ui, sans-serif" fontSize="15" fontWeight="600">
        App Store
      </text>
    </svg>
  )
}

function GooglePlayBadge({ height = 56 }: { height?: number }) {
  const w = height * (155 / 42)
  return (
    <svg
      width={w}
      height={height}
      viewBox="0 0 155 42"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Get it on Google Play"
    >
      <rect width="155" height="42" rx="8" fill="#000" />
      {/* Stylised Play triangle (multi-colour gradient approximation) */}
      <g transform="translate(11 8)">
        <path d="M0 0v26l11.2-13L0 0z" fill="#00d4ff" />
        <path d="M0 0l11.2 13L17 7.6 4.5 0H0z" fill="#00f076" />
        <path d="M0 26l4.5-1L17 18.4 11.2 13 0 26z" fill="#ff3a44" />
        <path d="M11.2 13l5.8 5.4 5.4-3.1c2.2-1.3 2.2-3.4 0-4.6L17 7.6 11.2 13z" fill="#ffce00" />
      </g>
      <text x="46" y="17" fill="#fff" fontFamily="Roboto, system-ui, sans-serif" fontSize="8.5" fontWeight="400">
        GET IT ON
      </text>
      <text x="46" y="32" fill="#fff" fontFamily="Roboto, system-ui, sans-serif" fontSize="15" fontWeight="600">
        Google Play
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Wordmark (matches white-wordmark.webp aesthetic)                   */
/* ------------------------------------------------------------------ */

function CoExistWordmark({ size = 36, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <span
      style={{
        fontFamily: 'system-ui, -apple-system, "Helvetica Neue", sans-serif',
        fontSize: size,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        color,
        lineHeight: 1,
      }}
    >
      Co<span style={{ opacity: 0.85 }}>-</span>Exist
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Truncate helper                                                    */
/* ------------------------------------------------------------------ */

function clamp(text: string, max: number): string {
  if (!text) return ''
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}

/* ====================================================================== */
/*  Component                                                              */
/* ====================================================================== */

export const EventShareGraphic = forwardRef<HTMLDivElement, EventShareGraphicProps>(
  function EventShareGraphic(
    {
      size,
      title,
      dateLabel,
      locationLabel,
      collectiveName,
      coverImageUrl,
      fallbackGradient = true,
      offscreen = false,
    },
    ref,
  ) {
    const spec = SHARE_SIZES[size]
    const w = spec.width
    const h = spec.height

    const offscreenStyle: React.CSSProperties = offscreen
      ? {
          position: 'fixed',
          top: '0',
          left: '-99999px',
          pointerEvents: 'none',
        }
      : {}

    const wrapperStyle: React.CSSProperties = {
      width: `${w}px`,
      height: `${h}px`,
      background: BRAND_CREAM,
      color: BRAND_GREEN_700,
      fontFamily: 'system-ui, -apple-system, "Helvetica Neue", sans-serif',
      overflow: 'hidden',
      position: offscreen ? 'fixed' : 'relative',
      ...offscreenStyle,
    }

    /* Layout differs per size. Square + portrait stack vertically, landscape is two-column. */

    if (size === 'landscape') {
      return (
        <div ref={ref} style={wrapperStyle} data-share-size={size}>
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {/* Left column - cover image */}
            <div
              style={{
                width: '54%',
                height: '100%',
                position: 'relative',
                background: coverImageUrl
                  ? `url(${coverImageUrl}) center / cover no-repeat`
                  : fallbackGradient
                    ? `linear-gradient(135deg, ${BRAND_GREEN_400} 0%, ${BRAND_GREEN_700} 100%)`
                    : BRAND_GREEN_600,
              }}
            >
              {/* Corner wordmark over image */}
              <div style={{ position: 'absolute', top: 36, left: 40 }}>
                <CoExistWordmark size={42} color="#fff" />
              </div>
              {/* Bottom-fade gradient for text legibility on right edge */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `linear-gradient(90deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.18) 100%)`,
                }}
              />
            </div>

            {/* Right column - text + branding */}
            <div
              style={{
                flex: 1,
                padding: '64px 72px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: BRAND_GREEN_400,
                    marginBottom: 28,
                  }}
                >
                  Join us
                </div>
                <h1
                  style={{
                    fontSize: 88,
                    lineHeight: 1.02,
                    fontWeight: 800,
                    letterSpacing: '-0.025em',
                    color: BRAND_GREEN_700,
                    margin: 0,
                    marginBottom: 36,
                    wordBreak: 'break-word',
                  }}
                >
                  {clamp(title, 90)}
                </h1>
                <div style={{ fontSize: 30, fontWeight: 600, color: BRAND_GREEN_600, lineHeight: 1.4 }}>
                  {dateLabel}
                </div>
                <div
                  style={{
                    fontSize: 26,
                    color: BRAND_GREEN_600,
                    opacity: 0.85,
                    marginTop: 10,
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}
                >
                  {clamp(locationLabel, 80)}
                </div>
                {collectiveName && (
                  <div
                    style={{
                      fontSize: 22,
                      color: BRAND_GREEN_400,
                      marginTop: 18,
                      fontWeight: 600,
                    }}
                  >
                    by {clamp(collectiveName, 50)}
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 20, color: BRAND_GREEN_600, marginBottom: 20, fontWeight: 600 }}>
                  Find this event on {APP_NAME}
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <AppStoreBadge height={64} />
                  <GooglePlayBadge height={64} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    /* Square + Portrait - vertical layout, cover image on top */
    const imgHeight = size === 'portrait' ? 720 : 540
    const titleSize = size === 'portrait' ? 88 : 76
    const dateSize  = size === 'portrait' ? 34 : 30

    return (
      <div ref={ref} style={wrapperStyle} data-share-size={size}>
        {/* Top: cover image OR brand-gradient block */}
        <div
          style={{
            width: '100%',
            height: imgHeight,
            position: 'relative',
            background: coverImageUrl
              ? `url(${coverImageUrl}) center / cover no-repeat`
              : fallbackGradient
                ? `linear-gradient(135deg, ${BRAND_GREEN_400} 0%, ${BRAND_GREEN_700} 100%)`
                : BRAND_GREEN_600,
          }}
        >
          {/* Wordmark in top-left over the image */}
          <div style={{ position: 'absolute', top: 32, left: 40 }}>
            <CoExistWordmark size={size === 'portrait' ? 42 : 38} color="#fff" />
          </div>
          {/* Soft bottom-fade so any text peeking over remains legible if cover */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(180deg, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.10) 100%)`,
            }}
          />
        </div>

        {/* Bottom: title, date, location, branding */}
        <div
          style={{
            flex: 1,
            padding: size === 'portrait' ? '48px 56px' : '40px 56px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: h - imgHeight,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: BRAND_GREEN_400,
                marginBottom: 20,
              }}
            >
              Join us
            </div>
            <h1
              style={{
                fontSize: titleSize,
                lineHeight: 1.02,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                color: BRAND_GREEN_700,
                margin: 0,
                marginBottom: 24,
                wordBreak: 'break-word',
              }}
            >
              {clamp(title, size === 'portrait' ? 110 : 90)}
            </h1>
            <div style={{ fontSize: dateSize, fontWeight: 600, color: BRAND_GREEN_600, lineHeight: 1.4 }}>
              {dateLabel}
            </div>
            <div
              style={{
                fontSize: dateSize - 4,
                color: BRAND_GREEN_600,
                opacity: 0.85,
                marginTop: 8,
                lineHeight: 1.4,
                wordBreak: 'break-word',
              }}
            >
              {clamp(locationLabel, 80)}
            </div>
            {collectiveName && (
              <div
                style={{
                  fontSize: 22,
                  color: BRAND_GREEN_400,
                  marginTop: 14,
                  fontWeight: 600,
                }}
              >
                by {clamp(collectiveName, 50)}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 18, color: BRAND_GREEN_600, marginBottom: 14, fontWeight: 600 }}>
              Find this event on {APP_NAME}  ·  {TAGLINE}
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <AppStoreBadge height={56} />
              <GooglePlayBadge height={56} />
            </div>
          </div>
        </div>
      </div>
    )
  },
)
