import { useMemo, type HTMLAttributes, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { linkifyText, openExternalChatLink, resolveChatLink } from '@/lib/chat-links'
import { isNativePlatform } from '@/lib/native-share'

interface LinkifiedTextProps extends Omit<HTMLAttributes<HTMLParagraphElement>, 'children'> {
  text: string
  linkClassName?: string
}

/**
 * Renders chat text with URLs and email addresses as tappable links.
 *
 * Every anchor is intercepted. A link to this app routes in-app (letting the
 * webview follow it would unload the SPA), everything else goes through
 * openExternalChatLink. The real href stays on the anchor for screen readers
 * and so a desktop cmd/ctrl/middle click still opens a new tab natively.
 */
export function LinkifiedText({ text, className, linkClassName, ...rest }: LinkifiedTextProps) {
  const navigate = useNavigate()
  const segments = useMemo(() => linkifyText(text), [text])

  const handleClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    // Let the bubble's long-press and the row's context menu keep working,
    // but a tap on a link must not also count as a tap on the bubble.
    e.stopPropagation()
    const native = isNativePlatform()
    if (!native && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) return
    e.preventDefault()
    const extraHosts = !native && typeof window !== 'undefined' ? [window.location.hostname] : []
    const target = resolveChatLink(href, extraHosts)
    if (target.kind === 'internal') {
      navigate(target.path)
      return
    }
    void openExternalChatLink(target)
  }

  return (
    <p {...rest} className={className}>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="chat-link"
            onClick={(e) => handleClick(e, seg.href)}
            className={cn(
              'underline underline-offset-2 decoration-1 font-medium text-primary-800 break-all cursor-pointer',
              linkClassName,
            )}
          >
            {seg.text}
          </a>
        ),
      )}
    </p>
  )
}
