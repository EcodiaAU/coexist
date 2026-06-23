'use client'

import { useState } from 'react'
import { getBrowserSupabase } from '@/lib/supabase-browser'

const PRESETS = [25, 50, 100, 250]

export function DonateForm() {
  const [amount, setAmount] = useState<number>(50)
  const [custom, setCustom] = useState('')
  const [frequency, setFrequency] = useState<'one_time' | 'monthly'>('one_time')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [error, setError] = useState('')

  const effectiveAmount = custom ? Math.round(Number(custom)) : amount

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!Number.isFinite(effectiveAmount) || effectiveAmount < 1) {
      setError('Please enter an amount of $1 or more.')
      return
    }
    setState('submitting')
    try {
      const supabase = getBrowserSupabase()
      const { data, error: fnErr } = await supabase.functions.invoke('public-checkout', {
        body: {
          type: 'donation',
          amount: effectiveAmount,
          frequency,
          donor_email: email || undefined,
          donor_name: name || undefined,
        },
      })
      if (fnErr || !data?.url) throw new Error(fnErr?.message || 'No checkout URL')
      window.location.href = data.url as string
    } catch {
      setState('error')
      setError('Could not start checkout. Please try again, or email hello@coexistaus.org.')
    }
  }

  const inputCls =
    'w-full border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition-colors duration-200 focus:border-primary-400'

  return (
    <form onSubmit={onSubmit} className="border border-neutral-200 bg-white p-6 sm:p-8">
      {/* Frequency toggle */}
      <div className="flex border border-neutral-200">
        {(['one_time', 'monthly'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFrequency(f)}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold uppercase tracking-wider transition-colors duration-200 ${
              frequency === f ? 'bg-olive-700 text-white' : 'bg-white text-neutral-600 hover:text-neutral-900'
            }`}
          >
            {f === 'one_time' ? 'One-time' : 'Monthly'}
          </button>
        ))}
      </div>

      {/* Amount presets */}
      <div className="mt-5 grid grid-cols-4 gap-px bg-neutral-200">
        {PRESETS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              setAmount(a)
              setCustom('')
            }}
            className={`py-3 text-lg font-normal tabular-nums transition-colors duration-200 ${
              !custom && amount === a
                ? 'bg-olive-700 text-white'
                : 'bg-white text-neutral-800 hover:bg-neutral-50 hover:text-olive-700'
            }`}
          >
            ${a}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <label className="text-xs font-semibold text-neutral-600">Or enter an amount</label>
        <div className="mt-1 flex items-center border border-neutral-200 bg-white px-4 focus-within:border-primary-400">
          <span className="text-neutral-500">$</span>
          <input
            type="number"
            min={1}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Custom amount"
            className="w-full bg-transparent px-2 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          className={inputCls}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email for your receipt"
          className={inputCls}
        />
      </div>

      <button
        type="submit"
        disabled={state === 'submitting'}
        className="mt-5 w-full bg-olive-700 px-7 py-3.5 text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-olive-800 disabled:opacity-60"
      >
        {state === 'submitting'
          ? 'Taking you to checkout…'
          : `Donate $${Number.isFinite(effectiveAmount) && effectiveAmount > 0 ? effectiveAmount : ''}${frequency === 'monthly' ? '/month' : ''}`}
      </button>
      {error && <p className="mt-3 text-sm text-error-500">{error}</p>}
      <p className="mt-3 text-center text-xs text-neutral-400">
        Secure checkout by Stripe. No account needed. Co-Exist Australia Ltd, ACNC registered charity.
      </p>
    </form>
  )
}
