# Co-Exist Design System

This document defines the visual language for the Co-Exist app. Every component and page must follow these rules.

## Core Principles
- **Less is more.** If something can be removed without losing function, remove it.
- **White canvas.** Pages are `bg-white` or `bg-surface-1` (#fafafa). Cards are `bg-white`.
- **Photography-forward.** Real images do the talking. Cards with images use full-bleed layouts.
- **Numbers are the hero.** Stats use large bold numerals. Labels are small uppercase grey.
- **Nature watermarks.** Cards get a subtle Lucide icon watermark (6% opacity, 72px, bottom-right). Activity-type-specific.
- **No decorative noise.** No floating circles, no gradient blobs, no decorative SVG patterns, no background animations.

## Color Usage
- **Brand green** (`#869e62` / primary-400): Used sparingly - CTAs, the impact band on home, hero banners. Never as a card background.
- **Activity colors**: sky (shore), sprout (land regen), bark (nature walk), plum (retreat), coral (film), moss (camp/marine). Used ONLY on small icon badges and activity tag pills. Never as card backgrounds.
- **Neutrals**: True greys. `neutral-900` for values/headings, `neutral-500` for labels, `neutral-400` for section headings, `neutral-100` for borders.
- **NO colored card backgrounds.** Cards are white. Period.

## Cards
- `bg-white border border-neutral-100 shadow-sm rounded-2xl`
- If the card has a cover image: the image fills the entire card top (or entire card for overlay style). Text overlays on a dark gradient (`from-black/60 via-black/25 to-transparent`).
- Activity tag pill floats **top-left** on image cards.
- Nature watermark icon in bottom-right at 6% opacity.
- Pass `watermark={activityType}` or `watermark={true}` to the Card component.

## Stat Cards
- White card, `border border-neutral-100 shadow-sm`
- Icon in a small pastel badge: `bg-{color}-50 text-{color}-600` (e.g. `bg-sky-50 text-sky-600`)
- Value: `text-neutral-900 font-bold text-2xl-3xl tabular-nums`
- Label: `text-neutral-500 text-xs uppercase tracking-wider`
- Optional delta mark: pill with `bg-success-50 text-success-600` for positive, `bg-error-50 text-error-600` for negative
- Optional MiniBar fill underneath for bounded metrics

## Typography Hierarchy
- **Section headings**: `text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400` - "journal header" style
- **Card titles**: `font-heading font-semibold text-neutral-900`
- **Card meta**: `text-caption text-neutral-500`
- **Detail labels**: `text-[11px] uppercase tracking-wider font-semibold text-neutral-400`
- **Detail values**: `text-[15px] font-bold text-neutral-900`
- **Hero numbers**: `font-heading text-3xl-4xl font-extrabold text-neutral-900 tabular-nums`

## Spacing
- Bento grids use `gap-3.5` to `gap-4` (14-16px gutters)
- Section spacing: `space-y-6` between major sections
- Card padding: `p-4` to `p-6`
- Corner radius: `rounded-2xl` (16px) for cards, `rounded-xl` (12px) for icon badges

## Shadows
- `shadow-sm` only (0 1px 2px rgba(0,0,0,0.05))
- No colored shadows, no large shadows, no custom shadow values

## Text Colors
- **Values/headings/body**: `text-neutral-900` - NEVER `text-primary-800`
- **Muted/meta/descriptions**: `text-neutral-500` - NEVER `text-primary-400`
- **Subtle/placeholders/icons**: `text-neutral-400` - NEVER `text-primary-300`
- **Only use `text-primary-*`** for: button variant text, active nav/tab states, badge text in branded badge backgrounds (e.g. `bg-primary-100 text-primary-800`)

## Borders
- **Card/structural borders**: `border-neutral-100` - NEVER `border-primary-100`
- **Input/form borders**: `border-neutral-200` (unchecked), `border-neutral-300` (hover)
- **Dividers**: `border-neutral-100` - NEVER `border-primary-100/40`
- **Only use `border-primary-*`** for: checked form controls, active selection states, focus rings

## What to Kill on Sight
- `bg-gradient-to-br` on cards (unless it's a CTA or hero banner)
- Decorative floating circles/dots/rings/glows
- `bg-primary-100/30`, `bg-moss-50/40`, or any tinted card/section backgrounds
- Custom shadows like `shadow-[0_6px_28px_...]` - use `shadow-sm` only
- Warm-tinted anything (`rgba(74, 74, 66, ...)`)
- `text-primary-*` for body text (use `text-neutral-*`)
- `border-primary-*` on cards or structural elements (use `border-neutral-100`)
- Opacity fractions on backgrounds (e.g. `bg-primary-50/60`) - use flat tokens
- `hover:bg-primary-50` on non-CTA elements (use `hover:bg-neutral-50`)

## Component Imports
```tsx
import { Card } from '@/components/card'           // Card, Card.Overlay, Card.Badge, Card.Content, Card.Title, Card.Meta
import { StatCard } from '@/components/stat-card'   // flat white stat card
import { AdminHeroStat } from '@/components/admin-hero-stat' // admin dashboard stats
import { MiniBar, MiniRing, MiniSparkline, DeltaMark } from '@/components/micro-viz'
import { cn } from '@/lib/cn'
```

## File Structure
- Pages: `src/pages/`
- Components: `src/components/`
- Styles: `src/styles/globals.css`
- Tailwind theme: defined in `@theme` block in globals.css
