import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/cn'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        // Tailwind prose styling for markdown content
        'prose prose-sm max-w-none',
        'prose-headings:font-heading prose-headings:text-neutral-900 prose-headings:font-bold',
        'prose-h1:text-xl prose-h2:text-lg prose-h3:text-base',
        'prose-p:text-neutral-700 prose-p:leading-relaxed',
        'prose-a:text-primary-600 prose-a:underline prose-a:decoration-primary-300 hover:prose-a:decoration-primary-500',
        'prose-strong:text-neutral-900 prose-strong:font-semibold',
        'prose-code:text-primary-700 prose-code:bg-neutral-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-primary-900 prose-pre:text-primary-100 prose-pre:rounded-sm prose-pre:text-xs',
        'prose-blockquote:border-l-primary-300 prose-blockquote:text-primary-600 prose-blockquote:not-italic',
        'prose-ul:text-neutral-700 prose-ol:text-neutral-700',
        'prose-li:marker:text-primary-400',
        'prose-hr:border-neutral-200',
        'prose-img:rounded-sm prose-img:shadow-sm',
        'prose-table:text-sm',
        'prose-th:text-primary-800 prose-th:font-semibold prose-th:bg-primary-50',
        'prose-td:text-primary-700',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
