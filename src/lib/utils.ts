// shadcn/ui expects `cn` at @/lib/utils. Co-Exist's canonical helper lives at
// @/lib/cn; this is a re-export shim so there is exactly one cn implementation.
export { cn } from './cn'
