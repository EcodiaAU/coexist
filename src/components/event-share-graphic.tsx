import { forwardRef } from 'react'
import { APP_NAME } from '@/lib/constants'

/* ====================================================================== */
/*  EventShareGraphic                                                      */
/*                                                                         */
/*  Renders a Co-Exist-branded share graphic for an event in one of three  */
/*  Instagram-friendly aspect ratios. Designed to be rendered off-screen   */
/*  and captured to PNG by html2canvas.                                    */
/*                                                                         */
/*  - 1:1   square   1080x1080  (IG square)                                */
/*  - 4:5   portrait 1080x1350  (IG feed-optimal)                          */
/*  - 9:16  story    1080x1920  (IG story / TikTok / Reels)                */
/* ====================================================================== */

export type ShareSize = 'square' | 'portrait' | 'story'

export interface ShareSizeSpec {
  width: number
  height: number
  label: string
  aspect: string
}

// eslint-disable-next-line react-refresh/only-export-components
export const SHARE_SIZES: Record<ShareSize, ShareSizeSpec> = {
  square:   { width: 1080, height: 1080, label: 'Square',   aspect: '1:1'  },
  portrait: { width: 1080, height: 1350, label: 'Portrait', aspect: '4:5'  },
  story:    { width: 1080, height: 1920, label: 'Story',    aspect: '9:16' },
}

export interface EventShareGraphicProps {
  size: ShareSize
  title: string
  dateLabel: string
  locationLabel: string
  collectiveName?: string | null
  coverImageUrl?: string | null
  /** Brand-like fallback when no cover image is available. */
  fallbackGradient?: boolean
  /** When true, set position fixed to keep this off-screen (for capture). */
  offscreen?: boolean
}

/* Co-Exist brand palette */
const BRAND_GREEN     = '#879e62'   // impact-section / profile hero green
const BRAND_GREEN_MID = '#5d7340'   // primary-600
const BRAND_GREEN_DK  = '#4a5c34'   // primary-700

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
/*  Wordmark                                                            */
/* ------------------------------------------------------------------ */

// Native aspect ratio of /logos/white-wordmark.webp (1500x569).
// Pin both width and height explicitly: html2canvas can otherwise resolve
// `width: auto` against the flex parent's full width and stretch the logo.
const WORDMARK_RATIO = 1500 / 569

function CoExistWordmark({ height = 36 }: { height?: number }) {
  const width = Math.round(height * WORDMARK_RATIO)
  return (
    <img
      src="/logos/white-wordmark.webp"
      alt="Co-Exist"
      crossOrigin="anonymous"
      width={width}
      height={height}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
        flexShrink: 0,
        userSelect: 'none',
      }}
    />
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
/*  Component - unified full-bleed layout for all three sizes             */
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
      ? { position: 'fixed', top: 0, left: '-99999px', pointerEvents: 'none' }
      : {}

    const wrapperStyle: React.CSSProperties = {
      width: `${w}px`,
      height: `${h}px`,
      background: BRAND_GREEN,
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, "Helvetica Neue", sans-serif',
      overflow: 'hidden',
      position: offscreen ? 'fixed' : 'relative',
      ...offscreenStyle,
    }

    /* Size-responsive layout values.
     *
     * Bottom padding is large enough to keep the entire info stack
     * (title / date / location / store badges / footer line) out of the
     * platform safe-area cuts. IG Story bottom safe-zone is ~250px (caption
     * input + bottom nav); IG feed posts get clipped by the engagement bar
     * on save-to-camera-roll on some Android OEMs. 2026-05-16 Tate feedback:
     * the previous 60-84px values were too tight and the bottom UI was
     * getting cut off when the share image was saved. */
    const isStory    = size === 'story'
    const isPortrait = size === 'portrait'

    const sidePad   = isStory ? 72  : 64
    const topPad    = isStory ? 64  : 52
    const btmPad    = isStory ? 260 : isPortrait ? 150 : 120
    const logoSize  = isStory ? 120 : isPortrait ? 104 : 96
    const titleSize = isStory ? 100 : isPortrait ? 86 : 74
    const dateSize  = isStory ? 40  : isPortrait ? 35 : 31
    const badgeH    = isStory ? 68  : isPortrait ? 62 : 58
    const badgeMt   = isStory ? 40  : isPortrait ? 30 : 24
    const joinFz    = isStory ? 22  : 19
    const titleMax  = isStory ? 120 : isPortrait ? 110 : 90

    return (
      <div ref={ref} style={wrapperStyle} data-share-size={size}>

        {/* 1. Full-bleed cover - photo fills the entire canvas */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: coverImageUrl
              ? `url(${coverImageUrl}) center / cover no-repeat`
              : fallbackGradient
                ? `linear-gradient(145deg, ${BRAND_GREEN} 0%, ${BRAND_GREEN_DK} 100%)`
                : BRAND_GREEN_MID,
          }}
        />

        {/* 2. Top scrim - wordmark legibility */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0) 26%)',
          }}
        />

        {/* 3. Bottom scrim - text legibility over photo */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 34%, rgba(0,0,0,0.80) 100%)',
          }}
        />

        {/* 4. Content layer */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: `${topPad}px ${sidePad}px ${btmPad}px`,
          }}
        >
          {/* Top: wordmark */}
          <CoExistWordmark height={logoSize} />

          {/* Bottom: event info + store badges */}
          <div>
            <div
              style={{
                fontSize: joinFz,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
                marginBottom: isStory ? 22 : 16,
              }}
            >
              Join us
            </div>

            <h1
              style={{
                fontSize: titleSize,
                lineHeight: 1.05,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: '#fff',
                margin: 0,
                marginBottom: isStory ? 28 : 18,
                wordBreak: 'break-word',
              }}
            >
              {clamp(title, titleMax)}
            </h1>

            <div
              style={{
                fontSize: dateSize,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.92)',
                lineHeight: 1.3,
              }}
            >
              {dateLabel}
            </div>

            <div
              style={{
                fontSize: dateSize - 4,
                color: 'rgba(255,255,255,0.72)',
                marginTop: 8,
                lineHeight: 1.3,
                wordBreak: 'break-word',
              }}
            >
              {clamp(locationLabel, 80)}
            </div>

            {collectiveName && (
              <div
                style={{
                  fontSize: dateSize - 7,
                  color: 'rgba(255,255,255,0.62)',
                  marginTop: 10,
                  fontWeight: 600,
                }}
              >
                by Co-Exist {clamp(collectiveName, 50)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 14, marginTop: badgeMt }}>
              <AppStoreBadge height={badgeH} />
              <GooglePlayBadge height={badgeH} />
            </div>

            <div
              style={{
                marginTop: 16,
                fontSize: isStory ? 20 : 17,
                color: 'rgba(255,255,255,0.45)',
                fontWeight: 500,
                letterSpacing: '0.01em',
              }}
            >
              Find this event on {APP_NAME}
            </div>
          </div>
        </div>

      </div>
    )
  },
)
