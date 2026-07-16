import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Lock, Leaf, Star, Car, Tent } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useMyCollectives, useCollectives } from '@/hooks/use-collective'
import { useMyStaffChannels } from '@/hooks/use-staff-channels'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/toast'

interface ChatSwitcherDropdownProps {
  currentCollectiveId?: string
  currentChannelId?: string
}

export function ChatSwitcherDropdown({
  currentCollectiveId,
  currentChannelId,
}: ChatSwitcherDropdownProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { user, profile, isStaff, isAdmin, isSuperAdmin } = useAuth()
  const isGlobalStaff = isStaff || isAdmin || isSuperAdmin
  const { data: myCollectives } = useMyCollectives()
  const { data: allCollectives } = useCollectives()
  const { data: staffChannels } = useMyStaffChannels()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const primaryChatId = profile?.primary_chat_id ?? undefined

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const collectives = myCollectives?.map((m) => {
    const c = m.collectives as { id: string; name: string; slug: string; cover_image_url: string | null } | null
    return c ? { id: m.collective_id, name: c.name, coverUrl: c.cover_image_url } : null
  }).filter(Boolean) as { id: string; name: string; coverUrl: string | null }[] ?? []

  // Campout group chats and carpool breakouts are NOT staff chats - render
  // them in their own sections so the Staff Channels group stays scoped to
  // actual staff communications (collective/state/national).
  const allChannels = staffChannels ?? []
  const channels = allChannels.filter((c) => (c.type as string) !== 'carpool_breakout' && (c.type as string) !== 'campout')
  const campoutChats = allChannels.filter((c) => (c.type as string) === 'campout')
  const carpoolChats = allChannels.filter((c) => (c.type as string) === 'carpool_breakout')

  // Staff/admin: show collectives they're NOT a member of
  const myCollectiveIds = new Set(collectives.map((c) => c.id))
  const otherCollectives = isGlobalStaff
    ? (allCollectives ?? [])
        .filter((c) => !myCollectiveIds.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, coverUrl: c.cover_image_url }))
    : []

  const hasOptions = collectives.length > 1 || channels.length > 0 || campoutChats.length > 0 || carpoolChats.length > 0 || otherCollectives.length > 0

  const handleSetPrimary = async (collectiveId: string) => {
    if (!user) return
    const newPrimary = primaryChatId === collectiveId ? null : collectiveId
    const { error } = await supabase
      .from('profiles')
      .update({ primary_chat_id: newPrimary })
      .eq('id', user.id)
    if (error) {
      toast.error('Failed to update default chat')
      return
    }
    queryClient.invalidateQueries({ queryKey: ['profile'] })
    toast.success(newPrimary ? 'Set as your default chat' : 'Default chat cleared')
  }

  if (!hasOptions) return null

  return (
    <div data-eos-id="src/components/chat-switcher-dropdown.tsx#0" data-eos-v="2" ref={dropdownRef} className="relative">
      <button data-eos-id="src/components/chat-switcher-dropdown.tsx#1"
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-primary-500 hover:bg-primary-100 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none"
        aria-label="Switch chat"
        aria-expanded={open}
      >
        <ChevronDown data-eos-id="src/components/chat-switcher-dropdown.tsx#2" size={16} className={cn('transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence data-eos-id="src/components/chat-switcher-dropdown.tsx#3">
        {open && (
          <motion.div data-eos-id="src/components/chat-switcher-dropdown.tsx#4"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-full mt-2 z-50 w-60 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-13rem-var(--safe-bottom,0px))] rounded-sm bg-white shadow-sm ring-1 ring-neutral-200/70 overflow-hidden"
          >
            <div data-eos-id="src/components/chat-switcher-dropdown.tsx#5" className="max-h-[inherit] overflow-y-auto py-1">
              {/* Collectives */}
              {collectives.length > 0 && (
                <div data-eos-id="src/components/chat-switcher-dropdown.tsx#6">
                  <p data-eos-id="src/components/chat-switcher-dropdown.tsx#7" className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 px-3 pt-1.5 pb-0.5">Collectives</p>
                  {collectives.map((c) => {
                    const isPrimary = primaryChatId === c.id
                    const isCurrent = c.id === currentCollectiveId

                    return (
                      <div data-eos-id="src/components/chat-switcher-dropdown.tsx#8" key={c.id} className="flex items-center">
                        <button data-eos-id="src/components/chat-switcher-dropdown.tsx#9"
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            if (!isCurrent) navigate(`/chat/${c.id}`)
                          }}
                          className={cn(
                            'flex flex-1 items-center gap-2.5 pl-3 pr-1 py-1.5 text-left text-[13px] transition-colors duration-100 cursor-pointer',
                            isCurrent
                              ? 'bg-primary-50 text-primary-900 font-semibold'
                              : 'text-neutral-700 hover:bg-neutral-50',
                          )}
                        >
                          <div data-eos-id="src/components/chat-switcher-dropdown.tsx#10" className="h-6 w-6 rounded-md overflow-hidden shrink-0 relative bg-primary-100">
                            {c.coverUrl ? (
                              <img data-eos-src="dynamic" data-eos-src-label="Cover url" data-eos-id="src/components/chat-switcher-dropdown.tsx#11" src={c.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                            ) : (
                              <div data-eos-id="src/components/chat-switcher-dropdown.tsx#12" className="flex h-full w-full items-center justify-center bg-secondary-600">
                                <Leaf data-eos-id="src/components/chat-switcher-dropdown.tsx#13" size={11} className="text-white" />
                              </div>
                            )}
                          </div>
                          <span data-eos-id="src/components/chat-switcher-dropdown.tsx#14" data-eos-var="c.name" data-eos-var-label="Name" data-eos-var-scope="item" className="truncate flex-1">{c.name}</span>
                          {isPrimary && (
                            <span data-eos-id="src/components/chat-switcher-dropdown.tsx#15" className="text-[9px] font-bold text-primary-500 bg-primary-100 px-1.5 py-0.5 rounded-full shrink-0">
                              Default
                            </span>
                          )}
                        </button>
                        {/* Set as default button (only show when user has 2+ collectives) */}
                        {collectives.length > 1 && (
                          <button data-eos-id="src/components/chat-switcher-dropdown.tsx#16"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSetPrimary(c.id)
                            }}
                            className={cn(
                              'flex items-center justify-center h-7 w-7 rounded-full mr-1.5 transition-colors duration-150 cursor-pointer select-none',
                              isPrimary
                                ? 'text-primary-500 hover:bg-primary-100'
                                : 'text-neutral-300 hover:text-neutral-500 hover:bg-neutral-50',
                            )}
                            aria-label={isPrimary ? 'Remove as default chat' : 'Set as default chat'}
                            title={isPrimary ? 'Remove as default' : 'Set as default'}
                          >
                            <Star data-eos-id="src/components/chat-switcher-dropdown.tsx#17" size={12} className={isPrimary ? 'fill-current' : ''} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Staff channels */}
              {channels.length > 0 && (
                <div data-eos-id="src/components/chat-switcher-dropdown.tsx#18">
                  {collectives.length > 0 && <div data-eos-id="src/components/chat-switcher-dropdown.tsx#19" className="h-px bg-neutral-100 mx-3 my-1" />}
                  <p data-eos-id="src/components/chat-switcher-dropdown.tsx#20" className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 px-3 pt-1.5 pb-0.5">Staff Channels</p>
                  {channels.map((ch) => (
                    <button data-eos-id="src/components/chat-switcher-dropdown.tsx#21"
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        if (ch.id !== currentChannelId) navigate(`/chat/channel/${ch.id}`)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors duration-100 cursor-pointer',
                        ch.id === currentChannelId
                          ? 'bg-primary-50 text-primary-900 font-semibold'
                          : 'text-neutral-700 hover:bg-neutral-50',
                      )}
                    >
                      <div data-eos-id="src/components/chat-switcher-dropdown.tsx#22" className="h-6 w-6 rounded-md bg-plum-600 flex items-center justify-center shrink-0">
                        <Lock data-eos-id="src/components/chat-switcher-dropdown.tsx#23" size={11} className="text-white" />
                      </div>
                      <span data-eos-id="src/components/chat-switcher-dropdown.tsx#24" data-eos-var="ch.name" data-eos-var-label="Name" data-eos-var-scope="item" className="truncate">{ch.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Campout group chats - per-event, ticket holders */}
              {campoutChats.length > 0 && (
                <div data-eos-id="src/components/chat-switcher-dropdown.tsx#25">
                  {(collectives.length > 0 || channels.length > 0) && <div data-eos-id="src/components/chat-switcher-dropdown.tsx#26" className="h-px bg-neutral-100 mx-3 my-1" />}
                  <p data-eos-id="src/components/chat-switcher-dropdown.tsx#27" className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 px-3 pt-1.5 pb-0.5">Campouts</p>
                  {campoutChats.map((ch) => (
                    <button data-eos-id="src/components/chat-switcher-dropdown.tsx#28"
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        if (ch.id !== currentChannelId) navigate(`/chat/channel/${ch.id}`)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors duration-100 cursor-pointer',
                        ch.id === currentChannelId
                          ? 'bg-primary-50 text-primary-900 font-semibold'
                          : 'text-neutral-700 hover:bg-neutral-50',
                      )}
                    >
                      <div data-eos-id="src/components/chat-switcher-dropdown.tsx#29" className="h-6 w-6 rounded-md bg-primary-600 flex items-center justify-center shrink-0">
                        <Tent data-eos-id="src/components/chat-switcher-dropdown.tsx#30" size={11} className="text-white" />
                      </div>
                      <span data-eos-id="src/components/chat-switcher-dropdown.tsx#31" data-eos-var="ch.name" data-eos-var-label="Name" data-eos-var-scope="item" className="truncate">{ch.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Carpool chats - per-event breakouts */}
              {carpoolChats.length > 0 && (
                <div data-eos-id="src/components/chat-switcher-dropdown.tsx#32">
                  {(collectives.length > 0 || channels.length > 0 || campoutChats.length > 0) && <div data-eos-id="src/components/chat-switcher-dropdown.tsx#33" className="h-px bg-neutral-100 mx-3 my-1" />}
                  <p data-eos-id="src/components/chat-switcher-dropdown.tsx#34" className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 px-3 pt-1.5 pb-0.5">Carpool Chats</p>
                  {carpoolChats.map((ch) => (
                    <button data-eos-id="src/components/chat-switcher-dropdown.tsx#35"
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        if (ch.id !== currentChannelId) navigate(`/chat/channel/${ch.id}`)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors duration-100 cursor-pointer',
                        ch.id === currentChannelId
                          ? 'bg-primary-50 text-primary-900 font-semibold'
                          : 'text-neutral-700 hover:bg-neutral-50',
                      )}
                    >
                      <div data-eos-id="src/components/chat-switcher-dropdown.tsx#36" className="h-6 w-6 rounded-md bg-success-600 flex items-center justify-center shrink-0">
                        <Car data-eos-id="src/components/chat-switcher-dropdown.tsx#37" size={11} className="text-white" />
                      </div>
                      <span data-eos-id="src/components/chat-switcher-dropdown.tsx#38" data-eos-var="ch.name" data-eos-var-label="Name" data-eos-var-scope="item" className="truncate">{ch.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* All collectives (staff/admin only) */}
              {otherCollectives.length > 0 && (
                <div data-eos-id="src/components/chat-switcher-dropdown.tsx#39">
                  {(collectives.length > 0 || channels.length > 0 || campoutChats.length > 0 || carpoolChats.length > 0) && <div data-eos-id="src/components/chat-switcher-dropdown.tsx#40" className="h-px bg-neutral-100 mx-3 my-1" />}
                  <p data-eos-id="src/components/chat-switcher-dropdown.tsx#41" className="text-[9px] uppercase tracking-wider font-bold text-neutral-400 px-3 pt-1.5 pb-0.5">All Collectives</p>
                  {otherCollectives.map((c) => {
                    const isCurrent = c.id === currentCollectiveId
                    return (
                      <button data-eos-id="src/components/chat-switcher-dropdown.tsx#42"
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setOpen(false)
                          if (!isCurrent) navigate(`/chat/${c.id}`)
                        }}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors duration-100 cursor-pointer',
                          isCurrent
                            ? 'bg-primary-50 text-primary-900 font-semibold'
                            : 'text-neutral-700 hover:bg-neutral-50',
                        )}
                      >
                        <div data-eos-id="src/components/chat-switcher-dropdown.tsx#43" className="h-6 w-6 rounded-md overflow-hidden shrink-0 bg-primary-100">
                          {c.coverUrl ? (
                            <img data-eos-src="dynamic" data-eos-src-label="Cover url" data-eos-id="src/components/chat-switcher-dropdown.tsx#44" src={c.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                          ) : (
                            <div data-eos-id="src/components/chat-switcher-dropdown.tsx#45" className="flex h-full w-full items-center justify-center bg-secondary-600">
                              <Leaf data-eos-id="src/components/chat-switcher-dropdown.tsx#46" size={11} className="text-white" />
                            </div>
                          )}
                        </div>
                        <span data-eos-id="src/components/chat-switcher-dropdown.tsx#47" data-eos-var="c.name" data-eos-var-label="Name" data-eos-var-scope="item" className="truncate">{c.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
