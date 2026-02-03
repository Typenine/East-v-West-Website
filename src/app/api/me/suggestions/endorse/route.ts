import { NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
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

// Endorsement threshold for ballot eligibility
const REQUIRED_ENDORSEMENTS = 3;

/**
 * Build base site URL from env or request headers
 */
function buildBaseUrl(request?: NextRequest): string | undefined {
  // Prefer explicit SITE_URL if set
  if (SITE_URL) return SITE_URL.replace(/\/$/, '');
  
  // Derive from request headers if available
  if (!request) return undefined;
  
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  
  if (host) {
    return `${proto}://${host}`;
  }
  
  return undefined;
}

async function postBallotEligibleDiscord(
  suggestionId: string,
  eligibleCount: number,
  title?: string,
  proposerTeam?: string,
  baseUrl?: string
) {
  if (!DISCORD_WEBHOOK_URL) return;
  const base = baseUrl?.replace(/\/$/, '') || '';
  // Use stable detail URL (not anchor)
  const link = base ? `${base}/suggestions/${suggestionId}` : undefined;

  if (!link) {
    console.warn('[endorse] Discord webhook: Unable to construct URL (no SITE_URL or host headers)');
  }

  // Build embed with title and proposer info
  const embedTitle = title ? `🗳️ Ballot Eligible: ${title}` : '🗳️ Ballot Eligible';
  let description = `This suggestion has reached **${eligibleCount}/${REQUIRED_ENDORSEMENTS}** eligible endorsements and is now on the ballot queue.\n`;
  if (proposerTeam) description += `**Proposed by:** ${proposerTeam}\n`;

  // Build plain text content with link on first line
  let plainContent = '';
  if (link) {
    plainContent = `Ballot eligible: ${link}\n`;
    if (title) plainContent += `**${title}**\n`;
    plainContent += `Endorsements: ${eligibleCount}/${REQUIRED_ENDORSEMENTS}`;
  } else {
    plainContent = 'Ballot eligible: (link unavailable)\n';
    if (title) plainContent += `**${title}**\n`;
    plainContent += `Endorsements: ${eligibleCount}/${REQUIRED_ENDORSEMENTS}`;
  }

  // Build embed with link field
  const embedFields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (link) {
    embedFields.push({
      name: 'Open',
      value: `[View suggestion](${link})`,
      inline: false,
    });
  }

  const embed = {
    title: embedTitle,
    description,
    url: link,
    color: 0x16a34a, // green
    timestamp: new Date().toISOString(),
    fields: embedFields,
  };

  const payload = { 
    content: plainContent, 
    embeds: [embed], 
    allowed_mentions: { parse: [] },
  };
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
          // Fetch title and proposer for the Discord message
          let title: string | undefined;
          let proposerTeam: string | undefined;
          try {
            const [titlesMap, proposersMap] = await Promise.all([
              getSuggestionTitlesMap(),
              getSuggestionProposersMap(),
            ]);
            title = titlesMap[suggestionId];
            proposerTeam = proposersMap[suggestionId];
          } catch {}
          const baseUrl = buildBaseUrl(req);
          postBallotEligibleDiscord(suggestionId, eligibleCount, title, proposerTeam, baseUrl).catch(() => {});
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
