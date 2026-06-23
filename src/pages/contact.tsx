import { useState } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
    Mail,
    MapPin,
    Send,
    Globe,
    Instagram,
    Facebook,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { useToast } from '@/components/toast'
import { WaveTransition } from '@/components/wave-transition'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { contactFormSchema, safeValidate } from '@/lib/validation'
import { useAuth } from '@/hooks/use-auth'
import { useParallaxLayers } from '@/hooks/use-parallax-scroll'

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
}

/* ------------------------------------------------------------------ */
/*  Contact details                                                    */
/* ------------------------------------------------------------------ */

const CONTACT_INFO = [
  {
    icon: <Mail size={18} />,
    label: 'Email',
    value: 'hello@coexistaus.org',
    href: 'mailto:hello@coexistaus.org',
  },
  {
    icon: <Globe size={18} />,
    label: 'Website',
    value: 'coexistaus.org',
    href: 'https://coexistaus.org',
  },
  {
    icon: <Instagram size={18} />,
    label: 'Instagram',
    value: '@coexistaus',
    href: 'https://instagram.com/coexistaus',
  },
  {
    icon: <Facebook size={18} />,
    label: 'Facebook',
    value: '@coexistaus',
    href: 'https://facebook.com/coexistaus',
  },
]

const SUBJECT_OPTIONS = [
  { value: 'general', label: 'General Enquiry' },
  { value: 'collectives', label: 'Collectives & Events' },
  { value: 'partnerships', label: 'Partnerships & Sponsorship' },
  { value: 'media', label: 'Media & Press' },
  { value: 'feedback', label: 'Feedback & Suggestions' },
  { value: 'technical', label: 'App / Technical Issue' },
  { value: 'other', label: 'Other' },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ContactPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { profile } = useAuth()
  const toast = useToast()
  const { bgRef, fgRef, textRef } = useParallaxLayers({ textRange: 180, withScale: false })

  const [name, setName] = useState(
    profile?.first_name && profile?.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : profile?.display_name ?? ''
  )
  const [email, setEmail] = useState(profile?.email ?? '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const canSubmit = name.trim() && email.trim() && message.trim() && !sending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    const { success, data: validated, error: valError } = safeValidate(contactFormSchema, { name, email, subject, message })
    if (!success) {
      toast.toast.error(valError)
      return
    }

    setSending(true)
    try {
      const { error } = await supabase
        .from('contact_submissions')
        .insert({
          name: validated.name,
          email: validated.email,
          subject: validated.subject || null,
          message: validated.message,
          user_id: profile?.id ?? null,
        })

      if (error) throw error

      toast.toast.success('Message sent! We\'ll get back to you soon.')
      setSubject('')
      setMessage('')
    } catch {
      toast.toast.error('Something went wrong. Please try emailing us directly.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Page
      swipeBack
      noBackground
      className="!px-0 bg-white"
      stickyOverlay={<Header title="" back transparent className="collapse-header" />}
    >
      {/* Hero - layered image parallax */}
      <div className="relative -mt-px">
        <div className="relative w-full h-[110vw] min-h-[480px] sm:h-auto overflow-hidden">
          {/* Background layer */}
          <div
            ref={rm ? undefined : bgRef}
            className="h-full"
          >
            <img
              src="/img/contact-hero-bg.webp"
              alt="Contact Co-Exist"
              width={1920}
              height={1080}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="w-full h-full object-cover object-center sm:h-auto sm:object-fill block"
            />
          </div>

          {/* Foreground cutout */}
          <div
            ref={rm ? undefined : fgRef}
            className="absolute inset-0 z-[3]"
          >
            <img
              src="/img/contact-hero-fg.webp"
              alt=""
              width={1920}
              height={1084}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="w-full h-full object-cover object-center sm:h-auto sm:object-fill block"
            />
          </div>

          {/* Scrim for text legibility */}
          <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/40 via-black/20 to-transparent" />

          {/* Hero text */}
          <div
            ref={rm ? undefined : textRef}
            className="absolute inset-x-0 top-[13%] sm:top-[10%] z-[2] flex flex-col items-center px-6 will-change-transform"
          >
            <span role="heading" aria-level={1} className="font-heading text-[2.5rem] sm:text-[3.5rem] lg:text-[5rem] font-bold uppercase text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)] leading-[0.85] block text-center" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.5), 0 0 40px rgba(0,0,0,0.3)' }}>
              Contact
            </span>
          </div>
        </div>

        {/* Wave transition */}
        <WaveTransition size="lg" />
      </div>

      <motion.div
        className="px-3 space-y-6 pb-10 pt-6"
        initial="hidden"
        animate="visible"
        variants={shouldReduceMotion ? undefined : stagger}
      >
        <p className="text-sm text-neutral-500 text-center">
          We'd love to hear from you - questions, ideas, or just to say hi.
        </p>
        {/* Contact form */}
        <motion.form
          variants={shouldReduceMotion ? undefined : fadeUp}
          onSubmit={handleSubmit}
          className="rounded-md bg-surface-0 shadow-sm p-5 space-y-4"
        >
          <h2 className="font-heading text-[15px] font-semibold text-neutral-900">
            Send us a message
          </h2>

          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            required
          />

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <Dropdown
            label="Subject"
            options={SUBJECT_OPTIONS}
            value={subject}
            onChange={setSubject}
            placeholder="What's this about?"
          />

          <Input
            type="textarea"
            label="Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="How can we help?"
            required
            rows={5}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={sending}
            disabled={!canSubmit}
            icon={<Send size={16} />}
          >
            Send Message
          </Button>
        </motion.form>

        {/* Contact details */}
        <motion.section variants={shouldReduceMotion ? undefined : fadeUp}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400/70 mb-1.5 px-1">
            Get in touch
          </h3>
          <div className="rounded-md bg-surface-0 shadow-sm overflow-hidden">
            {CONTACT_INFO.map(({ icon, label, value, href }, idx) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-3.5 px-4 py-3.5',
                  'transition-colors duration-150',
                  'active:bg-surface-3',
                  idx > 0 && 'border-t border-neutral-100',
                )}
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-sm shrink-0 bg-primary-50 text-primary-600">
                  {icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-neutral-500 leading-tight">{label}</p>
                  <p className="text-[15px] font-medium text-neutral-900 truncate">{value}</p>
                </div>
              </a>
            ))}
          </div>
        </motion.section>

        {/* Location note */}
        <motion.div
          variants={shouldReduceMotion ? undefined : fadeUp}
          className="flex items-start gap-3 px-4 py-3.5 rounded-md bg-neutral-50"
        >
          <MapPin size={18} className="text-primary-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-medium text-neutral-700">
              Based in Australia
            </p>
            <p className="text-[12px] text-neutral-400 mt-0.5">
              Co-Exist Australia is a registered charity operating nationwide with collectives across the country.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </Page>
  )
}
