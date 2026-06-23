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
      <p className={`text-sm ${tone === 'light' ? 'text-oncream' : 'text-primary-700'} ${className}`}>
        You are in. Look out for our next update.
      </p>
    )
  }

  const btn =
    tone === 'light'
      ? 'bg-oncream text-olive-900 hover:bg-white'
      : 'bg-olive-700 text-white hover:bg-olive-800'

  return (
    <form onSubmit={onSubmit} className={`flex flex-col gap-2 sm:flex-row ${className}`}>
      <input
        type="text"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        placeholder="First name"
        className="w-full rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-primary-400 sm:w-28"
        aria-label="First name"
      />
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="w-full rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-primary-400"
        aria-label="Email address"
      />
      <button
        type="submit"
        disabled={state === 'submitting'}
        className={`rounded-full px-6 py-2 text-sm font-bold transition-colors disabled:opacity-60 ${btn}`}
      >
        {state === 'submitting' ? '…' : 'Join'}
      </button>
      {state === 'error' && (
        <span className={`self-center text-xs ${tone === 'light' ? 'text-oncream/90' : 'text-error-500'}`}>Something went wrong</span>
      )}
    </form>
  )
}
