import { useEffect, useRef } from 'react'

/**
 * Stretchy hero (iOS "rubber-band" header).
 *
 * When the page scroll container is over-scrolled past the top (native WKWebView
 * bounce reports a negative scrollTop), the referenced element scales up and
 * translates so it grows to fill the pulled-open region instead of exposing the
 * background behind it. This is the App Store / Apple Music hero feel.
 *
 * Fully self-contained: the hook resolves the page scroller by its stable
 * `#main-content` id, and imperatively re-enables top bounce on that scroller
 * only while the hero is mounted (restoring the previous value on unmount), so
 * the rest of the app keeps its non-bouncing feel. Desktop (`overflow-clip`,
 * non-scrolling) and reduced-motion users are no-ops.
 *
 * Attach the returned ref to a wrapper that contains the image (and its gradient)
 * but NOT the title/text overlay, so the text never distorts.
 */
export function useStretchyHero<T extends HTMLElement = HTMLDivElement>() {
  const heroRef = useRef<T>(null)

  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return

    const scroller = document.getElementById('main-content')
    if (!scroller) return

    // Respect reduced-motion: leave the hero static.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Grow from the top edge so the pull fills the gap above the hero.
    hero.style.transformOrigin = 'center top'
    hero.style.willChange = 'transform'

    // Enable native top bounce on this scroller for the hero's lifetime only.
    const prevOverscroll = scroller.style.overscrollBehaviorY
    scroller.style.overscrollBehaviorY = 'auto'

    let raf = 0
    const apply = () => {
      raf = 0
      const st = scroller.scrollTop
      const pull = st < 0 ? -st : 0
      if (pull > 0) {
        // Height measured live so a resized/late-loaded hero stays correct.
        const h = hero.offsetHeight || 1
        const scale = (h + pull) / h
        hero.style.transform = `translateY(${-pull}px) scale(${scale})`
      } else if (hero.style.transform) {
        hero.style.transform = ''
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }

    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      scroller.style.overscrollBehaviorY = prevOverscroll
      hero.style.transform = ''
      hero.style.willChange = ''
    }
  }, [])

  return heroRef
}
