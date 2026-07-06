import { EmptyState } from '@/components/empty-state'

/**
 * Friendly 404 for authenticated users hitting an unknown route.
 * Before this existed the catch-all route rendered the logged-out Welcome
 * screen even for signed-in members (QA P3-4), which read as being logged
 * out. Unauthenticated visitors still get the Welcome screen (see the
 * catch-all in App.tsx).
 */
export default function NotFoundPage() {
  return (
    <div className="min-h-dvh bg-white flex items-center justify-center px-6">
      <EmptyState
        illustration="search"
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={{ label: 'Go home', to: '/' }}
      />
    </div>
  )
}
