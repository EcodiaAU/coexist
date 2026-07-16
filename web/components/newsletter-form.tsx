'use client'

import { useState } from 'react'

type State = 'idle' | 'submitting' | 'done' | 'error'

export function NewsletterForm({
  className = '',
  tone = 'dark',
}: {
  className?: string
  tone?: 'dark' | 'light'
}) {
  const [state, setState] = useState<State>('idle')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('submitting')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, firstName }),
      })
      setState(res.ok ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <p data-eos-id="web/components/newsletter-form.tsx#0" className={`text-sm ${tone === 'light' ? 'text-oncream' : 'text-primary-700'} ${className}`}>
        You are in. Look out for our next update.
      </p>
    )
  }

  const inputCls =
    tone === 'light'
      ? 'border-0 border-b border-oncream/30 bg-transparent text-oncream placeholder:text-oncream/50'
      : 'border-0 border-b border-neutral-300 bg-transparent text-neutral-900 placeholder:text-neutral-400'

  const btn =
    tone === 'light'
      ? 'bg-sage text-olive-900 hover:bg-primary-200'
      : 'bg-sage text-olive-900 hover:bg-primary-200'

  return (
    <form data-eos-id="web/components/newsletter-form.tsx#1" onSubmit={onSubmit} className={`flex flex-col gap-2 sm:flex-row ${className}`}>
      <input data-eos-id="web/components/newsletter-form.tsx#2"
        type="text"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        placeholder="First name"
        className={`w-full rounded-none px-0 py-2 text-sm outline-none focus:border-b-2 sm:w-28 ${inputCls}`}
        aria-label="First name"
      />
      <input data-eos-id="web/components/newsletter-form.tsx#3"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className={`w-full rounded-none px-0 py-2 text-sm outline-none focus:border-b-2 ${inputCls}`}
        aria-label="Email address"
      />
      <button data-eos-id="web/components/newsletter-form.tsx#4"
        type="submit"
        disabled={state === 'submitting'}
        className={`rounded-none px-6 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors disabled:opacity-60 ${btn}`}
      >
        {state === 'submitting' ? '…' : 'Join'}
      </button>
      {state === 'error' && (
        <span data-eos-id="web/components/newsletter-form.tsx#5" className={`self-center text-xs ${tone === 'light' ? 'text-oncream/90' : 'text-error-500'}`}>Something went wrong</span>
      )}
    </form>
  )
}
