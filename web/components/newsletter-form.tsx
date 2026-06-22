'use client'

import { useState } from 'react'

type State = 'idle' | 'submitting' | 'done' | 'error'

export function NewsletterForm({ className = '' }: { className?: string }) {
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
      <p className={`text-sm text-primary-700 ${className}`}>
        Thanks for joining. Look out for our next update.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className={`flex flex-col gap-2 sm:flex-row ${className}`}>
      <input
        type="text"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        placeholder="First name"
        className="w-full rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-primary-400 sm:w-28"
        aria-label="First name"
      />
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="w-full rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-primary-400"
        aria-label="Email address"
      />
      <button
        type="submit"
        disabled={state === 'submitting'}
        className="rounded-full bg-olive-700 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-olive-800 disabled:opacity-60"
      >
        {state === 'submitting' ? '…' : 'Join'}
      </button>
      {state === 'error' && (
        <span className="self-center text-xs text-error-500">Something went wrong</span>
      )}
    </form>
  )
}
