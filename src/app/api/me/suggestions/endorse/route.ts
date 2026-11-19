import { NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { getDb } from '@/server/db/client';
import { suggestions } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import {
  addSuggestionEndorsement,
  removeSuggestionEndorsement,
  getSuggestionVagueMap,
  getSuggestionVoteTagsMap,
  getSuggestionProposersMap,
  getSuggestionTitlesMap,
  markBallotEligibleIfThreshold,
} from '@/server/db/queries';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_SUGGESTIONS_WEBHOOK_URL;
const SITE_URL = process.env.SITE_URL;

async function postBallotEligibleDiscord(
  suggestionId: string,
  eligibleCount: number,
  title?: string,
  category?: string,
  proposerTeam?: string
) {
  if (!DISCORD_WEBHOOK_URL) return;
  const base = (SITE_URL || '').replace(/\/$/, '');
  // Use stable detail URL (not anchor)
  const link = base ? `${base}/suggestions/${suggestionId}` : undefined;

  // Build embed with title, category, count, and proposer info
  const embedTitle = title ? `🗳️ Ballot Eligible: ${title}` : '🗳️ Ballot Eligible';
  let description = `**This suggestion has reached the ballot!**\n\n`;
  description += `**Endorsements:** ${eligibleCount}/3 (threshold met)\n`;
  if (category) description += `**Category:** ${category}\n`;
  if (proposerTeam) description += `**Proposed by:** ${proposerTeam}\n`;
  if (link) description += `\n🔗 **[View Suggestion](${link})**`;

  const embed = {
    title: embedTitle,
    description,
    url: link,
    color: 0x16a34a, // green
    timestamp: new Date().toISOString(),
  };

  // Plain text link at top level for maximum visibility - include title for identification
  const plainContent = link
    ? `🗳️ **Ballot Eligible${title ? `: ${title}` : ''}** (${eligibleCount}/3 endorsements)\n${link}`
    : undefined;

  const payload = { content: plainContent, embeds: [embed], allowed_mentions: { parse: [] } };
  const doPost = async (): Promise<Response> => fetch(DISCORD_WEBHOOK_URL!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  try {
    let res = await doPost();
    if (res.status === 429) {
      const ra = res.headers.get('Retry-After');
      const ms = ra ? parseFloat(ra) * 1000 : 1000;
      await new Promise((r) => setTimeout(r, Math.min(ms, 5000)));
      res = await doPost();
    }
    if (!res.ok) console.warn('[endorse] ballot webhook failed', res.status, await res.text().catch(() => ''));
  } catch (e) {
    console.warn('[endorse] ballot webhook error', e);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const ident = await requireTeamUser();
  if (!ident) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  type EndorseBody = { suggestionId?: string; endorse?: boolean };
  const body = (await req.json().catch(() => ({}))) as EndorseBody;
  const suggestionId = typeof body.suggestionId === 'string' ? body.suggestionId.trim() : '';
  const endorseRaw = body.endorse;
  const endorse = typeof endorseRaw === 'boolean' ? endorseRaw : null;
  if (!suggestionId) return Response.json({ error: 'suggestionId required' }, { status: 400 });
  if (endorse === null) return Response.json({ error: 'endorse boolean required' }, { status: 400 });

  // Block endorsement if suggestion has voteTag or vague flag set
  try {
    const [vagueMap, voteTagMap, proposerMap] = await Promise.all([
      getSuggestionVagueMap(),
      getSuggestionVoteTagsMap(),
      getSuggestionProposersMap(),
    ]);
    const isVague = vagueMap[suggestionId] === true;
    const hasVoteTag = !!voteTagMap[suggestionId];
    if (isVague || hasVoteTag) {
      return Response.json(
        { error: 'Cannot endorse a suggestion that has been voted on or needs clarification.' },
        { status: 403 }
      );
    }
    // Block self-endorsement (proposer cannot endorse their own suggestion)
    const proposer = proposerMap[suggestionId];
    if (proposer && proposer === ident.team && endorse) {
      return Response.json(
        { error: 'You cannot endorse your own proposal.' },
        { status: 403 }
      );
    }
  } catch (e) {
    console.warn('[endorse] Failed to check vague/voteTag/proposer', e);
  }

  try {
    const ok = endorse
      ? await addSuggestionEndorsement(suggestionId, ident.team)
      : await removeSuggestionEndorsement(suggestionId, ident.team);
    if (!ok) return Response.json({ error: 'Persist failed' }, { status: 500 });
    // If endorsed, check ballot eligibility atomically and notify once
    if (endorse) {
      try {
        const { becameEligible, eligibleCount } = await markBallotEligibleIfThreshold(suggestionId);
        if (becameEligible) {
          // Fetch title, category, and proposer for the Discord message
          let title: string | undefined;
          let category: string | undefined;
          let proposerTeam: string | undefined;
          try {
            // The suggestion group ID is a grouping key, not a category.
            // Fetch the actual category and text for this suggestion only.
            const [titlesMap, proposersMap, suggestionRows] = await Promise.all([
              getSuggestionTitlesMap(),
              getSuggestionProposersMap(),
              getDb()
                .select({ category: suggestions.category, text: suggestions.text })
                .from(suggestions)
                .where(eq(suggestions.id, suggestionId))
                .limit(1),
            ]);
            const suggestion = suggestionRows[0];
            category = suggestion?.category?.trim() || undefined;
            proposerTeam = proposersMap[suggestionId];

            // Older suggestions might have no saved title. Use their proposal
            // text instead of sending a generic "Ballot Eligible" notification.
            const proposalLine = suggestion?.text.match(/(?:^|\n)Proposal:\s*([^\n]+)/i)?.[1]?.trim();
            const firstLine = suggestion?.text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
            const fallbackTitle = (proposalLine || firstLine)?.replace(/^[^:]+:\s*/, '').trim();
            title = (titlesMap[suggestionId]?.trim() || fallbackTitle || `Suggestion ${suggestionId.slice(0, 8)}`).slice(0, 180);
          } catch {}
          postBallotEligibleDiscord(suggestionId, eligibleCount, title, category, proposerTeam).catch(() => {});
        }
      } catch (e) {
        console.warn('[endorse] ballot eligibility check failed', e);
      }
    }
    return Response.json({ ok: true, suggestionId, endorse });
  } catch {
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
