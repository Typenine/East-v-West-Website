import { NextRequest } from 'next/server'
import { createSuggestion, setUserDoc, setTeamPin } from '@/server/db/queries'
import { putObjectText, putObjectBytes, getObjectText } from '@/server/storage/r2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdmin(req: NextRequest): boolean {
  const adminSecret = process.env.EVW_ADMIN_SECRET || '002023'
  const hdr = req.headers.get('x-admin-key')
  if (hdr && hdr === adminSecret) return true
  const cookie = req.cookies.get('evw_admin')?.value
  if (cookie && cookie === adminSecret) return true
  return false
}

type BlobMeta = { pathname: string; url: string; contentType?: string }

async function listAll(prefix: string): Promise<BlobMeta[]> {
  const { list } = await import('@vercel/blob')
  const out: BlobMeta[] = []
  let cursor: string | undefined = undefined
  while (true) {
    const res = await list({ prefix, cursor } as { prefix: string; cursor?: string })
    const arr = (res?.blobs as BlobMeta[]) || []
    out.push(...arr)
    cursor = (res as any)?.cursor || undefined
    if (!cursor) break
  }
  return out
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) return null
    return await r.text()
  } catch { return null }
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) return null
    const ab = await r.arrayBuffer()
    return new Uint8Array(ab)
  } catch { return null }
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 })
  const summary: Record<string, number> = {
    suggestionsImported: 0,
    userDocsImported: 0,
    teamPinsImported: 0,
    snapshotsCopied: 0,
    tradeblockCopied: 0,
    authLogsCopied: 0,
    heartbeatsCopied: 0,
    otherJsonCopied: 0,
    binariesCopied: 0,
  }

  try {
    // Suggestions (itemized)
    const sug = await listAll('suggestions/')
    for (const b of sug) {
      const txt = await fetchText(b.url)
      if (!txt) continue
      try {
        const j = JSON.parse(txt) as { id?: string; content?: string; category?: string | null; createdAt?: string }
        const text = (j.content || '').trim()
        if (!text) continue
        const createdAt = j.createdAt ? new Date(j.createdAt) : undefined
        await createSuggestion({ userId: null, text, category: j.category || null, createdAt })
        summary.suggestionsImported++
      } catch {}
    }
  } catch {}

  try {
    // User docs
    const users = await listAll('auth/users/')
    for (const b of users) {
      const m = b.pathname.match(/^auth\/users\/([^/]+)\.json$/)
      if (!m) continue
      const userId = m[1]
      const txt = await fetchText(b.url)
      if (!txt) continue
      try {
        const j = JSON.parse(txt) as { team?: string; version?: number; updatedAt?: string; votes?: any; tradeBlock?: any; tradeWants?: any }
        const team = typeof j.team === 'string' ? j.team : 'Unknown'
        await setUserDoc({
          userId,
          team,
          version: typeof j.version === 'number' ? j.version : 0,
          updatedAt: j.updatedAt ? new Date(j.updatedAt) : new Date(),
          votes: (j as any).votes ?? null,
          tradeBlock: (j as any).tradeBlock ?? null,
          tradeWants: (j as any).tradeWants ?? null,
        })
        summary.userDocsImported++
      } catch {}
    }
  } catch {}

  try {
    // Team pins (per-team)
    const pins = await listAll('auth/pins/')
    for (const b of pins) {
      const m = b.pathname.match(/^auth\/pins\/([a-z0-9-]+)\.json$/)
      if (!m) continue
      const slug = m[1]
      const txt = await fetchText(b.url)
      if (!txt) continue
      try {
        const j = JSON.parse(txt) as { hash?: string; salt?: string; pinVersion?: number; updatedAt?: string }
        if (!j.hash || !j.salt) continue
        await setTeamPin(slug, { hash: j.hash, salt: j.salt, pinVersion: Number(j.pinVersion || 1), updatedAt: j.updatedAt ? new Date(j.updatedAt) : new Date() })
        summary.teamPinsImported++
      } catch {}
    }
  } catch {}

  try {
    // Team pins (global maps)
    for (const key of ['auth/team-pins.json', 'evw/team-pins.json']) {
      const files = await listAll(key)
      for (const b of files) {
        const txt = await fetchText(b.url)
        if (!txt) continue
        try {
          const map = JSON.parse(txt) as Record<string, { hash: string; salt: string; pinVersion?: number; updatedAt?: string }>
          for (const [team, v] of Object.entries(map)) {
            const slug = team.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            await setTeamPin(slug, { hash: v.hash, salt: v.salt, pinVersion: Number(v.pinVersion || 1), updatedAt: v.updatedAt ? new Date(v.updatedAt) : new Date() })
            summary.teamPinsImported++
          }
        } catch {}
      }
    }
  } catch {}

  // Copy JSON logs/snapshots into R2 at the same keys
  async function copyJsonPrefix(pref: string, counterKey: keyof typeof summary) {
    try {
      const arr = await listAll(pref)
      for (const b of arr) {
        const txt = await fetchText(b.url)
        if (!txt) continue
        await putObjectText({ key: b.pathname, text: txt })
        summary[counterKey]++
      }
    } catch {}
  }

  await copyJsonPrefix('logs/lineups/snapshots/', 'snapshotsCopied')
  await copyJsonPrefix('tradeblock/', 'tradeblockCopied')
  await copyJsonPrefix('logs/auth/', 'authLogsCopied')
  await copyJsonPrefix('logs/activity/heartbeats/', 'heartbeatsCopied')

  // Copy other JSONs and binaries as best-effort
  try {
    const roots = ['', 'evw/', 'public/', 'data/']
    for (const r of roots) {
      const arr = await listAll(r)
      for (const b of arr) {
        const path = b.pathname || ''
        if (/^(suggestions\/|auth\/users\/|auth\/pins\/|auth\/team-pins\.json|evw\/team-pins\.json|logs\/lineups\/snapshots\/|tradeblock\/|logs\/auth\/|logs\/activity\/heartbeats\/)/.test(path)) continue
        if (path.endsWith('.json') || (b.contentType || '').includes('application/json')) {
          const txt = await fetchText(b.url)
          if (!txt) continue
          await putObjectText({ key: path, text: txt })
          summary.otherJsonCopied++
        } else {
          const bytes = await fetchBytes(b.url)
          if (!bytes) continue
          await putObjectBytes({ key: `migrated/${path.replace(/^\/+/, '')}`, body: bytes, contentType: b.contentType || 'application/octet-stream' })
          summary.binariesCopied++
        }
      }
    }
  } catch {}

  return Response.json({ ok: true, summary })
}
