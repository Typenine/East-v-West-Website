import { NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import {
  addSuggestionEndorsement,
  removeSuggestionEndorsement,
  getSuggestionVagueMap,
  getSuggestionVoteTagsMap,
  getSuggestionProposersMap,
  markBallotEligibleIfThreshold,
} from '@/server/db/queries';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_SUGGESTIONS_WEBHOOK_URL;
const SITE_URL = process.env.SITE_URL;

async function postBallotEligibleDiscord(suggestionId: string, eligibleCount: number) {
  if (!DISCORD_WEBHOOK_URL) return;
  const base = (SITE_URL || '').replace(/\/$/, '');
  const link = base ? `${base}/suggestions#${suggestionId}` : undefined;
  const embed = {
    title: 'Ballot Eligible',
    description: link ? `This suggestion has reached ${eligibleCount} eligible endorsements.` : `This suggestion has reached ${eligibleCount} eligible endorsements.`,
    url: link,
    color: 0x16a34a,
    timestamp: new Date().toISOString(),
  };
  const payload = { content: link ? `Ballot Eligible: ${link}` : undefined, embeds: [embed], allowed_mentions: { parse: [] } };
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
        if (becameEligible) postBallotEligibleDiscord(suggestionId, eligibleCount).catch(() => {});
      } catch (e) {
        console.warn('[endorse] ballot eligibility check failed', e);
      }
    }
    return Response.json({ ok: true, suggestionId, endorse });
  } catch {
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
