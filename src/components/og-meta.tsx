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
    <Helmet data-eos-id="src/components/og-meta.tsx#0" data-eos-v="2">
      <title data-eos-id="src/components/og-meta.tsx#1">{fullTitle}</title>
      <meta data-eos-id="src/components/og-meta.tsx#2" name="description" content={description} />

      {/* Robots */}
      {noindex && <meta data-eos-id="src/components/og-meta.tsx#3" name="robots" content="noindex, nofollow" />}

      {/* Canonical */}
      {canonicalUrl && <link data-eos-href="dynamic" data-eos-href-label="Canonical url" data-eos-href-scope="prop" data-eos-id="src/components/og-meta.tsx#4" rel="canonical" href={canonicalUrl} />}

      {/* Open Graph */}
      <meta data-eos-id="src/components/og-meta.tsx#5" property="og:title" content={fullTitle} />
      <meta data-eos-id="src/components/og-meta.tsx#6" property="og:description" content={description} />
      <meta data-eos-id="src/components/og-meta.tsx#7" property="og:type" content={type} />
      {canonicalUrl && <meta data-eos-id="src/components/og-meta.tsx#8" property="og:url" content={canonicalUrl} />}
      <meta data-eos-id="src/components/og-meta.tsx#9" property="og:image" content={ogImage} />
      <meta data-eos-id="src/components/og-meta.tsx#10" property="og:image:width" content="1200" />
      <meta data-eos-id="src/components/og-meta.tsx#11" property="og:image:height" content="630" />
      <meta data-eos-id="src/components/og-meta.tsx#12" property="og:image:alt" content={title} />
      <meta data-eos-id="src/components/og-meta.tsx#13" property="og:site_name" content={SITE_NAME} />
      <meta data-eos-id="src/components/og-meta.tsx#14" property="og:locale" content="en_AU" />

      {/* Twitter */}
      <meta data-eos-id="src/components/og-meta.tsx#15" name="twitter:card" content="summary_large_image" />
      <meta data-eos-id="src/components/og-meta.tsx#16" name="twitter:title" content={fullTitle} />
      <meta data-eos-id="src/components/og-meta.tsx#17" name="twitter:description" content={description} />
      <meta data-eos-id="src/components/og-meta.tsx#18" name="twitter:image" content={ogImage} />
      <meta data-eos-id="src/components/og-meta.tsx#19" name="twitter:image:alt" content={title} />

      {/* App Links (Smart App Banners + deep linking) */}
      <meta data-eos-id="src/components/og-meta.tsx#20" name="apple-itunes-app" content="app-id=COEXIST_APP_ID" />
      {canonicalUrl && (
        <meta data-eos-id="src/components/og-meta.tsx#21"
          property="al:ios:url"
          content={canonicalUrl.replace(/^https?:\/\/[^/]+/, 'coexist:/')}
        />
      )}
      {canonicalUrl && (
        <meta data-eos-id="src/components/og-meta.tsx#22"
          property="al:android:url"
          content={canonicalUrl.replace(/^https?:\/\/[^/]+/, 'coexist:/')}
        />
      )}
      <meta data-eos-id="src/components/og-meta.tsx#23" property="al:android:package" content="org.coexistaus.app" />
      <meta data-eos-id="src/components/og-meta.tsx#24" property="al:web:should_fallback" content="true" />

      {/* JSON-LD Structured Data */}
      {jsonLd && (
        <script data-eos-id="src/components/og-meta.tsx#25" data-eos-var="JSON.stringify" data-eos-var-label="Stringify" data-eos-var-scope="prop" type="application/ld+json">
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
