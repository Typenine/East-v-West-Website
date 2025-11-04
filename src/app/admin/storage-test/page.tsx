'use client'

import { useEffect, useState } from 'react'

type StorageHealth = {
  ok?: boolean
  mode?: 'path' | 'vhost' | null
  putSmoke?: string
  lastVerifiedAt?: string | null
} | null

export default function Page() {
  const [health, setHealth] = useState<StorageHealth>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string>('')
  const [viewUrl, setViewUrl] = useState<string>('')

  useEffect(() => {
    let mounted = true
    fetch('/api/health/storage', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (mounted) setHealth(j)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  async function onUpload() {
    if (!file) return
    setStatus('presigning...')
    setViewUrl('')
    try {
      const ct = file.type || 'application/octet-stream'
      const res = await fetch('/api/media/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: ct, ext: file.name.split('.').pop() || undefined }),
      })
      if (!res.ok) throw new Error('presign_failed')
      const { key, putUrl, getUrl } = await res.json()
      setStatus('uploading...')
      const up = await fetch(putUrl, { method: 'PUT', headers: { 'content-type': ct }, body: file })
      if (!up.ok) throw new Error(`upload_failed:${up.status}`)
      setViewUrl(getUrl)
      setStatus(`done: ${key}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(`error: ${msg}`)
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '32px auto', padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>R2 Storage Test</h1>
      <div style={{ fontSize: 14, marginBottom: 12 }}>
        <div>Mode: {health?.mode ?? 'unknown'}</div>
        <div>Put smoke: {health?.putSmoke ?? 'n/a'}</div>
      </div>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button onClick={onUpload} style={{ marginLeft: 8, padding: '6px 12px' }} disabled={!file}>
        Upload
      </button>
      {status ? <div style={{ marginTop: 12, fontSize: 14 }}>{status}</div> : null}
      {viewUrl ? (
        <div style={{ marginTop: 12 }}>
          <a href={viewUrl} target="_blank" rel="noreferrer">
            View uploaded file
          </a>
        </div>
      ) : null}
    </div>
  )
}
