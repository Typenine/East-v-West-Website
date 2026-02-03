import { promises as fs } from 'fs';
import path from 'path';
import { sendEmail } from '@/lib/utils/email';
import { getKV } from '@/lib/server/kv';
import {
  listSuggestions as dbListSuggestions,
  createSuggestion as dbCreateSuggestion,
  setSuggestionSponsor,
  getSuggestionSponsorsMap,
  setSuggestionProposer,
  getSuggestionProposersMap,
  getSuggestionVagueMap,
  addSuggestionEndorsement,
  getSuggestionEndorsementsMap,
  getSuggestionVoteTagsMap,
  setSuggestionGroup,
  getSuggestionGroupsMap,
  getSuggestionTitlesMap,
  setSuggestionTitle,
  getSuggestionDisplayNumbersMap,
  backfillSuggestionDisplayNumbers,
} from '@/server/db/queries';
import { requireTeamUser } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type Suggestion = {
  id: string;
  title?: string;
  content: string;
  category?: string;
  createdAt: string; // ISO string
  status?: 'draft' | 'open' | 'accepted' | 'rejected';
  resolvedAt?: string;
  sponsorTeam?: string;
  proposerTeam?: string;
  vague?: boolean;
  endorsers?: string[];
  voteTag?: 'voted_on' | 'vote_passed' | 'vote_failed';
  groupId?: string;
  groupPos?: number;
  displayNumber?: number;
};

const DATA_PATH = path.join(process.cwd(), 'data', 'suggestions.json');
const NOTIFY_EMAIL = process.env.SUGGESTIONS_NOTIFY_EMAIL || 'patrickmmcnulty62@gmail.com';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_SUGGESTIONS_WEBHOOK_URL;
const SITE_URL = process.env.SITE_URL;

// Track posted suggestion IDs to prevent duplicates (in-memory, resets on restart)
const postedToDiscord = new Set<string>();

async function postToDiscord(suggestion: Suggestion, teamName?: string): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) return;
  if (postedToDiscord.has(suggestion.id)) return; // idempotent
  postedToDiscord.add(suggestion.id);

  // Build stable detail URL (not an anchor)
  const base = (SITE_URL || '').replace(/\/$/, '');
  const link = suggestion.id && base ? `${base}/suggestions/${suggestion.id}` : undefined;

  // Title for embed
  const embedTitle = suggestion.title
    ? `📋 ${suggestion.title}`
    : '📋 New Suggestion';

  // Build compact description: category only (no long content dump)
  let description = '';
  if (suggestion.category) description += `**Category:** ${suggestion.category}\n`;
  if (teamName) description += `**Proposed by:** ${teamName}\n`;
  // Add link inside embed description for visibility
  if (link) description += `\n🔗 **[View Suggestion](${link})**`;

  const embed = {
    title: embedTitle,
    description,
    url: link,
    color: 0x3b82f6, // blue
    timestamp: suggestion.createdAt,
  };

  // Plain text link at top level for maximum visibility
  const plainContent = link
    ? `📋 **New Suggestion${suggestion.title ? `: ${suggestion.title}` : ''}**\n${link}`
    : undefined;

  const payload = {
    content: plainContent,
    embeds: [embed],
    allowed_mentions: { parse: [] },
  };

  const doPost = async (): Promise<Response> => {
    return fetch(DISCORD_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  };

  try {
    let res = await doPost();
    // Handle rate limit with one retry
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const delayMs = retryAfter ? parseFloat(retryAfter) * 1000 : 1000;
      await new Promise((r) => setTimeout(r, Math.min(delayMs, 5000)));
      res = await doPost();
    }
    if (!res.ok) {
      console.warn('[suggestions] Discord webhook failed', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.warn('[suggestions] Discord webhook error', e);
  }
}

async function readSuggestions(): Promise<Suggestion[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Suggestion[];
    return [];
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeSuggestions(items: Suggestion[]) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(items, null, 2), 'utf8');
}

async function readSuggestionsLocalAll(): Promise<Suggestion[]> {
  const out: Record<string, Suggestion> = {};
  const files = [
    path.join(process.cwd(), 'data', 'suggestions.json'),
    path.join(process.cwd(), 'logs', 'suggestions.json'),
    path.join(process.cwd(), 'public', 'suggestions.json'),
  ];
  try {
    const dir = path.join(process.cwd(), 'data', 'suggestions');
    const entries = await fs.readdir(dir).catch(() => [] as string[]);
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, name), 'utf8');
        const j = JSON.parse(raw) as unknown;
        const it = j as Suggestion;
        if (it && it.id) out[it.id] = it;
      } catch {}
    }
  } catch {}
  for (const f of files) {
    try {
      const raw = await fs.readFile(f, 'utf8');
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) {
        for (const it of j as Suggestion[]) if (it && (it as Suggestion).id) out[(it as Suggestion).id] = it as Suggestion;
      }
    } catch {}
  }
  return Object.values(out);
}

export async function GET() {
  // legacy params ignored
  try {
    const rows = await dbListSuggestions();
    if (Array.isArray(rows) && rows.length > 0) {
      type Row = { id: string; text: string; category: string | null; createdAt: string | Date; status?: string; resolvedAt?: Date | null };
      let items = (rows as Row[]).map((r) => ({
        id: String(r.id),
        content: String(r.text),
        category: r.category || undefined,
        createdAt: new Date(r.createdAt).toISOString(),
        status: (r.status as Suggestion['status']) || 'open',
        resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : undefined,
      } as Suggestion));
      // Backfill display numbers if needed (best-effort, non-blocking)
      try {
        await backfillSuggestionDisplayNumbers();
      } catch {}
      // Overlay display numbers from DB column
      try {
        const dmap = await getSuggestionDisplayNumbersMap();
        if (dmap && Object.keys(dmap).length > 0) {
          items = items.map((it) => ({ ...it, displayNumber: dmap[it.id] || it.displayNumber }));
        }
      } catch {}
      // Overlay sponsors from DB column if present
      try {
        const dbMap = await getSuggestionSponsorsMap();
        if (dbMap && Object.keys(dbMap).length > 0) {
          items = items.map((it) => ({ ...it, sponsorTeam: dbMap[it.id] || it.sponsorTeam }));
        }
      } catch {}
      // Overlay titles from DB column if present
      try {
        const tmap = await getSuggestionTitlesMap();
        if (tmap && Object.keys(tmap).length > 0) {
          items = items.map((it) => ({ ...it, title: tmap[it.id] || it.title }));
        }
      } catch {}
      // Overlay proposers from DB column if present
      try {
        const pmap = await getSuggestionProposersMap();
        if (pmap && Object.keys(pmap).length > 0) {
          items = items.map((it) => ({ ...it, proposerTeam: pmap[it.id] || it.proposerTeam }));
        }
      } catch {}
      // Overlay vague flags
      try {
        const vmap = await getSuggestionVagueMap();
        if (vmap && Object.keys(vmap).length > 0) {
          items = items.map((it) => ({ ...it, vague: vmap[it.id] ?? it.vague }));
        }
      } catch {}
      // Overlay endorsements array
      try {
        const emap = await getSuggestionEndorsementsMap();
        if (emap && Object.keys(emap).length > 0) {
          items = items.map((it) => ({ ...it, endorsers: emap[it.id] || it.endorsers }));
        }
      } catch {}
      // Overlay voteTag map
      try {
        const tmap = await getSuggestionVoteTagsMap();
        if (tmap && Object.keys(tmap).length > 0) {
          items = items.map((it) => ({ ...it, voteTag: (tmap as Record<string, 'voted_on' | 'vote_passed' | 'vote_failed'>)[it.id] || it.voteTag }));
        }
      } catch {}
      // Overlay group info
      try {
        const gmap = await getSuggestionGroupsMap();
        if (gmap && Object.keys(gmap).length > 0) {
          items = items.map((it) => ({ ...it, groupId: (gmap[it.id]?.groupId) || it.groupId, groupPos: (gmap[it.id]?.groupPos) || it.groupPos }));
        }
      } catch {}
      // Overlay sponsor teams from KV map if present
      try {
        const kv = await getKV();
        if (kv) {
          const mapRaw = (await kv.get('suggestions:sponsors')) as string | null;
          if (mapRaw) {
            const map = JSON.parse(mapRaw) as Record<string, string>;
            items = items.map((it) => ({ ...it, sponsorTeam: map[it.id] || it.sponsorTeam }));
          }
        }
      } catch {}
      // Fallback: overlay sponsorTeam from local suggestions if KV not populated
      try {
        const local = await readSuggestionsLocalAll();
        const smap: Record<string, string | undefined> = {};
        const pmap: Record<string, string | undefined> = {};
        const vmap: Record<string, boolean | undefined> = {};
        type LegacyLocal = Suggestion & { proposerTeam?: string; vague?: boolean };
        for (const it of local as LegacyLocal[]) if (it && it.id) {
          smap[it.id] = it.sponsorTeam;
          pmap[it.id] = it.proposerTeam;
          vmap[it.id] = typeof it.vague === 'boolean' ? it.vague : undefined;
        }
        if (Object.keys(smap).length > 0) items = items.map((it) => ({ ...it, sponsorTeam: it.sponsorTeam || smap[it.id] }));
        if (Object.keys(pmap).length > 0) items = items.map((it) => ({ ...it, proposerTeam: it.proposerTeam || pmap[it.id] }));
        if (Object.keys(vmap).length > 0) items = items.map((it) => ({ ...it, vague: it.vague ?? vmap[it.id] }));
      } catch {}
      return Response.json(items);
    }
  } catch {}
  try {
    const kv = await getKV();
    if (kv) {
      const raw = (await kv.get('suggestions:items')) as string | null;
      if (raw && typeof raw === 'string') {
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr)) {
          const items = (arr as Suggestion[]).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          return Response.json(items);
        }
      }
    }
  } catch {}

  try {
    const local = await readSuggestionsLocalAll();
    if (local.length > 0) return Response.json(local.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  } catch {}
  return Response.json([]);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : undefined;
    const endorse = body && typeof body.endorse === 'boolean' ? Boolean(body.endorse) : false;
    type NewItemBody = { content?: string; category?: string; title?: string; rules?: { title?: string; proposal?: string; issue?: string; fix?: string; conclusion?: string } };
    const itemsBodyRaw: NewItemBody[] | null = Array.isArray(body.items) ? (body.items as NewItemBody[]) : null;

    // Multi-item path (grouped submission)
    if (itemsBodyRaw && itemsBodyRaw.length > 0) {
      type NewItem = { content?: string; category?: string; title?: string; endorse?: boolean; rules?: { title?: string; proposal?: string; issue?: string; fix?: string; conclusion?: string; reference?: { title?: string; code?: string }; effective?: string } };
      const itemsParsed: Array<{ content: string; category?: string; title?: string; endorse?: boolean }> = [];
      const itemsRulesMeta: Array<{ ruleLine?: string; effectiveLine?: string; title?: string }> = [];

      // For Rules category, require login
      const hasRulesItem = (itemsBodyRaw as NewItem[]).some((r) => (r.category || '').toLowerCase() === 'rules');
      let rulesIdentTeam: string | undefined;
      if (hasRulesItem) {
        try {
          const ident = await requireTeamUser();
          if (ident && ident.team) rulesIdentTeam = ident.team;
        } catch {}
        if (!rulesIdentTeam) {
          return Response.json({ error: 'You must be logged in to submit Rules suggestions.' }, { status: 401 });
        }
      }

      for (const raw of itemsBodyRaw as NewItem[]) {
        const cat = typeof raw.category === 'string' ? raw.category.trim() : '';
        if (!cat) {
          return Response.json({ error: 'Category is required for each suggestion.' }, { status: 400 });
        }
        // If Rules with prompts
        if (cat && cat.toLowerCase() === 'rules' && raw.rules) {
          const ruleTitle = String(raw.rules.title || '').trim();
          if (!ruleTitle) {
            return Response.json({ error: 'Title is required for Rules suggestions.' }, { status: 400 });
          }
          const proposal = String(raw.rules.proposal || '').trim();
          const issue = String(raw.rules.issue || '').trim();
          const fix = String(raw.rules.fix || '').trim();
          const conclusion = String(raw.rules.conclusion || '').trim();
          if (!proposal || !issue || !fix || !conclusion) {
            return Response.json({ error: 'Rules items require proposal, issue, fix, and conclusion.' }, { status: 400 });
          }
          const refTitle = String(raw.rules.reference?.title || '').trim();
          const refCode = String(raw.rules.reference?.code || '').trim();
          const effRaw = String(raw.rules.effective || '').trim();
          const eff = effRaw ? effRaw : '';
          const ruleLine = (refTitle || refCode) ? `Rule: ${refTitle}${refCode ? ` ${refCode}` : ''}` : undefined;
          const effectiveLine = eff ? `Effective: ${eff}` : undefined;
          const header = [ruleLine, effectiveLine].filter(Boolean).join('\n');
          const bodyLines = `Proposal: ${proposal}\nIssue: ${issue}\nHow it fixes: ${fix}\nConclusion: ${conclusion}`;
          const assembled = header ? `${header}\n${bodyLines}` : bodyLines;
          itemsParsed.push({ content: assembled, category: 'Rules', title: ruleTitle, endorse: Boolean(raw.endorse) });
          itemsRulesMeta.push({ ruleLine, effectiveLine, title: ruleTitle });
        } else {
          const text = String(raw.content || '').trim();
          const itemTitle = String(raw.title || '').trim();
          // Title is required for all new suggestions
          if (!itemTitle) return Response.json({ error: 'Title is required for each suggestion.' }, { status: 400 });
          if (!text || text.length < 3) return Response.json({ error: 'Each item must be at least 3 characters.' }, { status: 400 });
          if (text.length > 5000) return Response.json({ error: 'Item too long (max 5000 chars).' }, { status: 400 });
          itemsParsed.push({ content: text, category: cat || undefined, title: itemTitle, endorse: Boolean(raw.endorse) });
          itemsRulesMeta.push({ title: itemTitle });
        }
      }
      if (itemsParsed.length === 0) return Response.json({ error: 'No valid items' }, { status: 400 });

      // basic IP rate-limit 10/min
      try {
        const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
        const kv = await getKV();
        if (kv) {
          const key = `rl:suggestions:${ip}`;
          const n = await kv.incr(key);
          if (kv.expire && n === 1) await kv.expire(key, 60);
          if (n > 10) return Response.json({ error: 'Too many requests' }, { status: 429 });
        }
      } catch {}

      // Determine identity once for endorsing items
      let identTeam: string | undefined;
      if ((itemsParsed || []).some((i) => i.endorse)) {
        try {
          const ident = await requireTeamUser();
          if (ident && ident.team) identTeam = ident.team;
        } catch {}
      }

      const groupId = `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const created: Suggestion[] = [];
      for (let i = 0; i < itemsParsed.length; i++) {
        const ipt = itemsParsed[i];
        // DB row
        const s: Suggestion = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: ipt.title,
          content: ipt.content,
          category: ipt.category,
          createdAt: new Date().toISOString(),
        };
        try {
          const row = await dbCreateSuggestion({ userId: null, text: s.content, category: s.category || null });
          if (row && row.id) {
            s.id = String(row.id);
            s.createdAt = new Date(row.createdAt).toISOString();
          }
        } catch {}
        // Persist title if provided
        try { if (s.id && (ipt.title || '').trim()) { await setSuggestionTitle(s.id, ipt.title!.trim()); } } catch {}
        // Persist proposer for Rules items if logged-in Rules submitter exists
        try {
          if (s.id && (ipt.category || '').toLowerCase() === 'rules' && rulesIdentTeam) {
            await setSuggestionProposer(s.id, rulesIdentTeam);
            s.proposerTeam = rulesIdentTeam;
          }
        } catch {}
        // Persist proposer/sponsor and endorsement
        // Prevent self-endorsement for Rules submissions at creation time
        const isRulesItem = (ipt.category || '').toLowerCase() === 'rules';
        const endorseThis = Boolean(itemsParsed[i]?.endorse) && Boolean(identTeam) && !isRulesItem;
        try { if (endorseThis && s.id) await setSuggestionSponsor(s.id, identTeam!); } catch {}
        try { if (endorseThis && s.id) await setSuggestionProposer(s.id, identTeam!); } catch {}
        try { if (endorseThis && s.id) await addSuggestionEndorsement(s.id, identTeam!); } catch {}
        // Group assignment
        try { if (s.id) await setSuggestionGroup(s.id, groupId, i + 1); s.groupId = groupId; s.groupPos = i + 1; } catch {}
        created.push(s);
      }

      // Try to persist a local/log copy (best-effort) and KV sponsor cache
      try {
        const arr = await readSuggestions();
        for (const s of created) arr.push(s);
        await writeSuggestions(arr);
      } catch {}
      try {
        if (identTeam) {
          const kv = await getKV();
          if (kv) {
            const key = 'suggestions:sponsors';
            const raw = (await kv.get(key)) as string | null;
            const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
            for (let i = 0; i < created.length; i++) {
              const s = created[i];
              if (itemsParsed[i]?.endorse) map[s.id] = identTeam;
            }
            await kv.set(key, JSON.stringify(map));
          }
        }
      } catch {}

      // Notify email
      try {
        const lines = created.map((s, idx) => `#${idx + 1}${s.category ? ` [${s.category}]` : ''}: ${s.content.slice(0, 240)}${s.content.length > 240 ? '…' : ''}`).join('\n\n');
        await sendEmail({
          to: NOTIFY_EMAIL,
          subject: `New suggestions (${created.length})`,
          text: `A new suggestion group was submitted at ${created[0]?.createdAt}. Items: ${created.length}.\n\n${lines}`,
          html: `<p>A new suggestion group was submitted at <strong>${created[0]?.createdAt}</strong>. Items: <strong>${created.length}</strong>.</p>`
            + created.map((s, idx) => `<p><strong>#${idx + 1}${s.category ? ` [${s.category}]` : ''}</strong></p><pre style="white-space:pre-wrap;word-wrap:break-word;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace">${s.content.replace(/</g,'&lt;')}</pre>`).join('')
        });
      } catch (e) {
        console.warn('[suggestions] notify email failed', e);
      }

      // Discord webhook (best-effort, non-blocking)
      for (const s of created) {
        postToDiscord(s, identTeam).catch(() => {});
      }

      return Response.json({ ok: true, groupId, items: created }, { status: 201 });
    }

    // Single-item legacy path
    if (!category || !category.trim()) {
      return Response.json({ error: 'Category is required.' }, { status: 400 });
    }
    if (!content || content.length < 3) {
      return Response.json({ error: 'Content must be at least 3 characters.' }, { status: 400 });
    }
    if (content.length > 5000) {
      return Response.json({ error: 'Content too long (max 5000 chars).' }, { status: 400 });
    }

    // basic IP rate-limit 10/min
    try {
      const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
      const kv = await getKV();
      if (kv) {
        const key = `rl:suggestions:${ip}`;
        const n = await kv.incr(key);
        if (kv.expire && n === 1) await kv.expire(key, 60);
        if (n > 10) return Response.json({ error: 'Too many requests' }, { status: 429 });
      }
    } catch {}

    const now = new Date().toISOString();
    const item: Suggestion = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      category: category && category.length > 0 ? category : undefined,
      createdAt: now,
    };
    // If endorsing and authenticated, attach sponsorTeam via KV map
    let sponsorTeam: string | undefined;
    let proposerTeam: string | undefined;
    if (endorse) {
      try {
        const ident = await requireTeamUser();
        if (ident && ident.team) {
          sponsorTeam = ident.team;
          proposerTeam = ident.team; // reveal proposer only when they opt-in by endorsing
        }
      } catch {}
    }
    // DB first
    try {
      const row = await dbCreateSuggestion({ userId: null, text: item.content, category: item.category || null });
      if (row && row.id) {
        item.id = String(row.id);
        item.createdAt = new Date(row.createdAt).toISOString();
      }
    } catch {}
    // No title supported on single-item legacy path currently

    try {
      const items = await readSuggestions();
      // persist sponsorTeam too when present
      if (sponsorTeam) item.sponsorTeam = sponsorTeam;
      if (proposerTeam) item.proposerTeam = proposerTeam;
      items.push(item);
      await writeSuggestions(items);
    } catch {}
    // Persist sponsor in DB (authoritative)
    try {
      if (sponsorTeam && item.id) await setSuggestionSponsor(item.id, sponsorTeam);
    } catch {}
    // Persist proposer in DB (authoritative)
    try {
      if (proposerTeam && item.id) await setSuggestionProposer(item.id, proposerTeam);
    } catch {}
    // Add endorsement record for endorsing team
    try {
      if (sponsorTeam && item.id) await addSuggestionEndorsement(item.id, sponsorTeam);
    } catch {}
    // Record sponsor team in KV map (best-effort caching)
    try {
      if (sponsorTeam) {
        const kv = await getKV();
        if (kv) {
          const key = 'suggestions:sponsors';
          const raw = (await kv.get(key)) as string | null;
          const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
          map[item.id] = sponsorTeam;
          await kv.set(key, JSON.stringify(map));
        }
      }
    } catch {}
    // Fire notification email (best-effort)
    try {
      await sendEmail({
        to: NOTIFY_EMAIL,
        subject: `New suggestion${item.category ? ` (${item.category})` : ''}`,
        text: `A new suggestion was submitted at ${item.createdAt}.\n\nCategory: ${item.category || 'N/A'}\n\n${item.content}`,
        html: `<p>A new suggestion was submitted at <strong>${item.createdAt}</strong>.</p><p><strong>Category:</strong> ${item.category || 'N/A'}</p><pre style="white-space:pre-wrap;word-wrap:break-word;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace">${item.content.replace(/</g,'&lt;')}</pre>`
      });
    } catch (e) {
      console.warn('[suggestions] notify email failed', e);
    }

    // Discord webhook (best-effort, non-blocking)
    postToDiscord(item, sponsorTeam).catch(() => {});

    return Response.json(item, { status: 201 });
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    console.error('POST /api/suggestions failed', err);
    const msg = err && (err.code === 'EROFS' || err.code === 'EACCES')
      ? 'Persistent storage not configured for filesystem. Submission saved in database.'
      : 'Failed to save suggestion';
    return Response.json({ error: msg }, { status: 500 });
  }
}
