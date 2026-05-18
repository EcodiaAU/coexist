import { Helmet } from 'react-helmet-async'

const SITE_URL = 'https://app.coexistaus.org'
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`
const SITE_NAME = 'Co-Exist'
const SITE_DESCRIPTION =
  "Australia's young adult conservation platform. Join events, connect with collectives, and protect the environment."

interface OGMetaProps {
  title: string
  description: string
  url?: string
  image?: string
  type?: 'website' | 'article' | 'profile'
  noindex?: boolean
  canonicalPath?: string
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

export function OGMeta({
  title,
  description,
  url,
  image,
  type = 'website',
  noindex = false,
  canonicalPath,
  jsonLd,
}: OGMetaProps) {
  const fullTitle = `${title} | ${SITE_NAME}`
  const canonicalUrl = canonicalPath ? `${SITE_URL}${canonicalPath}` : url
  const ogImage = image || DEFAULT_OG_IMAGE

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      {/* Robots */}
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Canonical */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="en_AU" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={title} />

      {/* App Links (Smart App Banners + deep linking) */}
      <meta name="apple-itunes-app" content="app-id=COEXIST_APP_ID" />
      {canonicalUrl && (
        <meta
          property="al:ios:url"
          content={canonicalUrl.replace(/^https?:\/\/[^/]+/, 'coexist:/')}
        />
      )}
      {canonicalUrl && (
        <meta
          property="al:android:url"
          content={canonicalUrl.replace(/^https?:\/\/[^/]+/, 'coexist:/')}
        />
      )}
      <meta property="al:android:package" content="org.coexistaus.app" />
      <meta property="al:web:should_fallback" content="true" />

      {/* JSON-LD Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(
            Array.isArray(jsonLd)
              ? jsonLd
              : jsonLd,
          )}
        </script>
      )}
    </Helmet>
  )
}

export { SITE_URL, SITE_NAME, SITE_DESCRIPTION, DEFAULT_OG_IMAGE }
