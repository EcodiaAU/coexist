'use client'

import { useState } from 'react'

type State = 'idle' | 'submitting' | 'done' | 'error'

const TOPICS = ['General enquiry', 'Partnership', 'Volunteering', 'Media', 'Something else']

export function ContactForm() {
  const [state, setState] = useState<State>('idle')
  const [form, setForm] = useState({ name: '', email: '', topic: TOPICS[0], message: '' })

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('submitting')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      setState(res.ok ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div className="border-t border-neutral-200 py-8 text-center">
        <p className="text-lg font-normal text-neutral-900">Thanks for reaching out</p>
        <p className="mt-2 text-neutral-600">We have got your message and will be in touch soon.</p>
      </div>
    )
  }

  const input =
    'w-full border-0 border-b border-neutral-300 bg-transparent rounded-none px-0 py-2.5 text-sm outline-none focus:border-olive-700 transition-colors'

  return (
    <form onSubmit={onSubmit} className="space-y-6 border-t border-neutral-200 pt-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-neutral-600">Name</span>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} className={`mt-1 ${input}`} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-neutral-600">Email</span>
          <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={`mt-1 ${input}`} />
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-neutral-600">Topic</span>
        <select value={form.topic} onChange={(e) => set('topic', e.target.value)} className={`mt-1 ${input}`}>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-neutral-600">Message</span>
        <textarea
          required
          rows={5}
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          className={`mt-1 ${input}`}
        />
      </label>
      <button
        type="submit"
        disabled={state === 'submitting'}
        className="w-full rounded-none bg-olive-700 px-7 py-3 text-sm font-medium text-white transition-colors hover:bg-olive-800 disabled:opacity-60"
      >
        {state === 'submitting' ? 'Sending…' : 'Send message'}
      </button>
      {state === 'error' && (
        <p className="text-sm text-error-500">Something went wrong. Please email hello@coexistaus.org directly.</p>
      )}
    </form>
  )
}
