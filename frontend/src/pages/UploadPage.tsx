import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { Dropzone } from '../components/upload/Dropzone'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useHealth } from '../hooks/useHealth'
import { analysesKey } from '../hooks/useAnalyses'

export function UploadPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const health = useHealth()
  const [file, setFile] = useState<File | null>(null)
  const [siteName, setSiteName] = useState('')

  const geminiMissing = health.data?.gemini_configured === false

  const create = useMutation({
    mutationFn: () => api.createAnalysis(file!, siteName),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: analysesKey })
      navigate(`/analyses/${created.id}`)
    },
  })

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-fg-strong">New analysis</h1>
        <p className="text-sm text-fg-muted">Upload one photo or a short video. Gemini checks workers, PPE and site hazards.</p>
      </header>

      {geminiMissing && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-risk-moderate/40 bg-risk-moderate/10 p-3 text-sm text-fg-strong">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk-moderate" aria-hidden />
          <span>The backend has no <code className="font-mono">GEMINI_API_KEY</code> configured. Add it to <code className="font-mono">backend/.env</code> and restart the API.</span>
        </div>
      )}

      <Card>
        <form
          className="space-y-5"
          onSubmit={(e) => { e.preventDefault(); if (file) create.mutate() }}
        >
          <div>
            <label htmlFor="site-name" className="block text-sm font-medium text-fg-strong">Site name <span className="font-normal text-fg-muted">(optional)</span></label>
            <input
              id="site-name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              maxLength={200}
              placeholder="e.g. Tower A — 2nd floor slab"
              className="mt-1 block min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-fg-strong placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-fg-muted">Shown on the report and dashboard so you can tell analyses apart.</p>
          </div>

          <Dropzone file={file} onChange={setFile} />

          {create.error && (
            <p role="alert" className="text-sm text-danger">
              {create.error instanceof ApiError ? create.error.message : 'Upload failed. Please try again.'}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={!file || geminiMissing} loading={create.isPending}>
              {create.isPending ? 'Uploading…' : 'Analyze'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
