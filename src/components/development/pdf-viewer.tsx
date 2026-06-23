import { FileDown, ExternalLink, Presentation, FileText } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PdfViewerProps {
  url: string
  fileName?: string | null
  fileSizeBytes?: number | null
  className?: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileType(url: string, fileName?: string | null): 'pdf' | 'presentation' | 'document' {
  const lower = (fileName ?? url).toLowerCase()
  if (lower.endsWith('.pdf') || url.includes('application/pdf')) return 'pdf'
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt') || lower.endsWith('.key')) return 'presentation'
  return 'document'
}

function fileIcon(type: 'pdf' | 'presentation' | 'document') {
  switch (type) {
    case 'pdf': return <FileDown size={18} className="text-bark-600" />
    case 'presentation': return <Presentation size={18} className="text-bark-600" />
    default: return <FileText size={18} className="text-bark-600" />
  }
}

function fileLabel(type: 'pdf' | 'presentation' | 'document') {
  switch (type) {
    case 'pdf': return 'PDF Document'
    case 'presentation': return 'Presentation'
    default: return 'Document'
  }
}

export function PdfViewer({ url, fileName, fileSizeBytes, className }: PdfViewerProps) {
  const type = getFileType(url, fileName)
  const canPreview = type === 'pdf'

  return (
    <div className={cn('rounded-sm overflow-hidden border border-neutral-200', className)}>
      {/* Inline viewer for PDFs */}
      {canPreview && (
        <div className="w-full aspect-[3/4] max-h-[600px] bg-primary-50">
          <iframe
            src={`${url}#toolbar=1&navpanes=0`}
            title={fileName ?? 'PDF Document'}
            className="w-full h-full"
          />
        </div>
      )}

      {/* Presentation/doc  show a branded card with download */}
      {!canPreview && (
        <div className="flex flex-col items-center justify-center py-10 px-6 bg-primary-50">
          <div className="flex items-center justify-center w-16 h-16 rounded-md bg-white shadow-sm mb-3">
            {fileIcon(type)}
          </div>
          <p className="text-xs font-medium text-bark-500 mb-1">{fileLabel(type)}</p>
          <p className="text-sm font-semibold text-neutral-900 text-center max-w-xs truncate">
            {fileName ?? 'Document'}
          </p>
          {fileSizeBytes && (
            <p className="text-xs text-neutral-500 mt-0.5">{formatFileSize(fileSizeBytes)}</p>
          )}
        </div>
      )}

      {/* File info bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-t border-neutral-100">
        <div className="flex items-center justify-center w-9 h-9 rounded-sm bg-bark-100 shrink-0">
          {fileIcon(type)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-900 truncate">
            {fileName ?? 'Document'}
          </p>
          {fileSizeBytes && (
            <p className="text-xs text-neutral-500">{formatFileSize(fileSizeBytes)}</p>
          )}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download={fileName ?? undefined}
          className="inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-sm bg-primary-100 text-primary-700 text-xs font-semibold hover:bg-primary-200 transition-colors active:scale-[0.97]"
        >
          <ExternalLink size={12} />
          {canPreview ? 'Open' : 'Download'}
        </a>
      </div>
    </div>
  )
}

export default PdfViewer
