import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/button'
import { OGMeta } from '@/components/og-meta'
import { APP_NAME, TAGLINE } from '@/lib/constants'

export default function WelcomePage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <OGMeta
        title="Welcome"
        description="Co-Exist is Australia's youth conservation platform. Join local tree planting, beach cleanups, habitat restoration events, and connect with conservation collectives near you."
        canonicalPath="/welcome"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Co-Exist',
          description: "Australia's youth conservation platform. Join events, connect with collectives, and protect the environment.",
          url: 'https://app.coexistaus.org',
          applicationCategory: 'LifestyleApplication',
          operatingSystem: 'iOS, Android, Web',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' },
          creator: {
            '@type': 'Organization',
            name: 'Co-Exist Australia',
            url: 'https://www.coexistaus.org',
            sameAs: ['https://www.instagram.com/coexistaus'],
          },
        }}
      />

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        {/* Wordmark */}
        <motion.img
          src="/logos/black-wordmark.png"
          alt={APP_NAME}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-[70vw] max-w-md sm:w-[50vw] sm:max-w-lg h-auto"
        />

        {/* Tagline */}
        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 text-sm sm:text-base text-neutral-400 font-medium tracking-[0.2em] uppercase"
        >
          {TAGLINE}
        </motion.p>

        {/* Description */}
        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-6 max-w-xs text-center text-neutral-500 leading-relaxed"
        >
          Join thousands of young Australians protecting our environment, one event at a time.
        </motion.p>
      </div>

      {/* Bottom CTAs */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="px-4 sm:px-6 lg:px-8 pb-10 space-y-3 flex flex-col items-center"
        style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}
      >
        <Button
          variant="primary"
          size="lg"
          icon={<ArrowRight size={20} />}
          onClick={() => navigate('/signup')}
          className="w-56"
        >
          Get Started
        </Button>

        <Button
          variant="ghost"
          size="lg"
          onClick={() => navigate('/login')}
        >
          I have an account
        </Button>
      </motion.div>
    </div>
  )
}
