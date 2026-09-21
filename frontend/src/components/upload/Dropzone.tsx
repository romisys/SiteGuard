import { FileVideo, Image as ImageIcon, Upload, X } from 'lucide-react'
import { useEffect, useId, useState, type DragEvent } from 'react'

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
export const DEFAULT_MAX_BYTES = 100 * 1024 * 1024

interface DropzoneProps {
  file: File | null
  onChange: (file: File | null) => void
  maxBytes?: number
}

export function validateFile(file: File, maxBytes: number): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Unsupported file type. Use JPG, PNG, WebP, MP4, MOV or WebM.`
  }
  if (file.size > maxBytes) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`
  }
  return null
}

export function Dropzone({ file, onChange, maxBytes = DEFAULT_MAX_BYTES }: DropzoneProps) {
  const inputId = useId()
  const errorId = useId()
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handle(candidate: File | undefined) {
    if (!candidate) return
    const problem = validateFile(candidate, maxBytes)
    setError(problem)
    if (!problem) onChange(candidate)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragging(false)
    handle(e.dataTransfer.files?.[0])
  }

  if (file) {
    const isVideo = file.type.startsWith('video/')
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start gap-4">
          <div className="w-40 shrink-0 overflow-hidden rounded-md bg-muted" style={{ aspectRatio: '16 / 10' }}>
            {previewUrl && (isVideo
              ? <video src={previewUrl} className="size-full object-cover" muted playsInline aria-label={`Preview of ${file.name}`} />
              : <img src={previewUrl} alt={`Preview of ${file.name}`} className="size-full object-cover" />)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-sm font-medium text-fg-strong">
              {isVideo ? <FileVideo className="size-4 shrink-0" aria-hidden /> : <ImageIcon className="size-4 shrink-0" aria-hidden />}
              <span className="truncate">{file.name}</span>
            </p>
            <p className="mt-1 text-xs text-fg-muted">{(file.size / 1024 / 1024).toFixed(1)} MB · {file.type}</p>
          </div>
          <button
            type="button"
            onClick={() => { setError(null); onChange(null) }}
            aria-label="Remove file"
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-md text-fg-muted transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="peer sr-only"
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setDragging(false) }}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg ${
          dragging ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-fg-muted'
        }`}
      >
        <Upload className="size-8 text-fg-muted" aria-hidden />
        <span className="text-sm font-medium text-fg-strong">Upload a photo or video of the site</span>
        <span className="text-xs text-fg-muted">Drag and drop, or click to browse · JPG, PNG, WebP, MP4, MOV, WebM · up to {Math.round(maxBytes / 1024 / 1024)} MB</span>
      </label>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-danger">{error}</p>
      )}
    </div>
  )
}
