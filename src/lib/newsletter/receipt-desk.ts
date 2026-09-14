import { generateSection } from './llm/groq';
import type { StepInput } from './compose-step-core';
import type { ReceiptDeskSection, ReceiptItem } from './weekly-recap-types';
import { listNewslettersMeta, loadNewsletterById, loadPendingPicks } from '@/server/db/newsletter-queries';
import { loadPublishedTakeLedgerState } from './published-take-store';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseResponseMap(raw: string): Record<string, string> {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}

async function latestPriorIssue(season: number, week: number) {
  const metas = await listNewslettersMeta(season).catch(() => []);
  return metas
    .filter(item => item.status === 'published' && item.week <= week)
    .sort((a, b) => String(b.publishedAt ?? b.generatedAt).localeCompare(String(a.publishedAt ?? a.generatedAt)))[0] ?? null;
}

function currentResultForTeam(input: StepInput, team: string): string | null {
  const target = normalize(team);
  for (const pair of input.derived.matchup_pairs ?? []) {
    if (normalize(pair.winner.name) === target) {
      return `${pair.winner.name} won ${pair.winner.points.toFixed(1)}-${pair.loser.points.toFixed(1)} over ${pair.loser.name}.`;
    }
    if (normalize(pair.loser.name) === target) {
      return `${pair.loser.name} lost ${pair.loser.points.toFixed(1)}-${pair.winner.points.toFixed(1)} to ${pair.winner.name}.`;
    }
  }
  return null;
}

function speakerLabel(bot: 'entertainer' | 'analyst'): 'Mason Reed' | 'Westy' {
  return bot === 'entertainer' ? 'Mason Reed' : 'Westy';
}

export async function buildReceiptDesk(input: StepInput): Promise<ReceiptDeskSection> {
  if (input.episodeType !== 'regular' || input.week < 2) {
    return { mode: 'receipt_desk', audited: true, receipts: [], note: 'No prior weekly receipts to audit yet.' };
  }

  const receipts: ReceiptItem[] = [];
  const priorIssue = await latestPriorIssue(input.season, input.week - 1);

  const pending = await loadPendingPicks(input.season, input.week).catch(() => null);
  if (pending?.picks?.length) {
    const disagreements: ReceiptItem[] = [];
    const wrongPicks: ReceiptItem[] = [];
    for (const pick of pending.picks) {
      const pair = (input.derived.matchup_pairs ?? []).find(p => String(p.matchup_id) === String(pick.matchup_id));
      if (!pair) continue;
      const winner = pair.winner.name;
      const matchup = `${pair.winner.name} vs ${pair.loser.name}`;
      const masonCorrect = normalize(pick.entertainer_pick) === normalize(winner);
      const westyCorrect = normalize(pick.analyst_pick) === normalize(winner);

      const make = (speaker: 'Mason Reed' | 'Westy', chosen: string, correct: boolean): ReceiptItem => ({
        id: `prediction:${input.week}:${pick.matchup_id}:${speaker.startsWith('Mason') ? 'mason' : 'westy'}`,
        receiptType: 'prediction_result',
        source: {
          speaker,
          season: input.season,
          week: input.week - 1,
          issueId: priorIssue?.id,
          issueTitle: priorIssue?.title,
        },
        originalTake: `${speaker} picked ${chosen} in ${matchup}.`,
        whatHappenedAfterward: `${winner} won. The pick was ${correct ? 'correct' : 'incorrect'}.`,
        team: chosen,
        clancy: `${speaker} had ${chosen} in ${matchup}. ${winner} won. That is the published pick and the result, nothing more.`,
      });

      if (pick.entertainer_pick !== pick.analyst_pick) {
        disagreements.push(make('Mason Reed', pick.entertainer_pick, masonCorrect));
        disagreements.push(make('Westy', pick.analyst_pick, westyCorrect));
      } else {
        if (!masonCorrect) wrongPicks.push(make('Mason Reed', pick.entertainer_pick, false));
        if (!westyCorrect) wrongPicks.push(make('Westy', pick.analyst_pick, false));
      }
    }
    receipts.push(...disagreements.slice(0, 2), ...wrongPicks.slice(0, Math.max(0, 2 - disagreements.slice(0, 2).length)));
  }

  const [masonLedger, westyLedger] = await Promise.all([
    loadPublishedTakeLedgerState('entertainer', input.season).catch(() => ({ entries: [], processedNewsletterIds: [], updatedAt: null, extractionVersion: 0 })),
    loadPublishedTakeLedgerState('analyst', input.season).catch(() => ({ entries: [], processedNewsletterIds: [], updatedAt: null, extractionVersion: 0 })),
  ]);

  if (priorIssue && receipts.length < 3) {
    const reversals = [
      ...masonLedger.entries.filter(entry => entry.sourceNewsletterId === priorIssue.id).map(entry => ({ ...entry, bot: 'entertainer' as const })),
      ...westyLedger.entries.filter(entry => entry.sourceNewsletterId === priorIssue.id).map(entry => ({ ...entry, bot: 'analyst' as const })),
    ].filter(entry => (entry.status === 'reversed' || entry.status === 'weakened') && entry.previousClaim);
    const reversal = reversals[0];
    if (reversal?.previousClaim) {
      const speaker = speakerLabel(reversal.bot);
      receipts.push({
        id: `continuity:${reversal.id}`,
        receiptType: 'take_check',
        source: { speaker, season: reversal.season, week: reversal.week, issueId: reversal.sourceNewsletterId, issueTitle: reversal.title },
        originalTake: reversal.previousClaim,
        whatHappenedAfterward: `${speaker}'s later published position became: ${reversal.claim}`,
        team: reversal.subjectType === 'team' ? reversal.subject : reversal.relatedTeam,
        player: reversal.subjectType === 'player' ? reversal.subject : undefined,
        clancy: `Continuity check for ${speaker}: the earlier published position was “${reversal.previousClaim}” and the later published position was “${reversal.claim}”. That is a change in the record; ${speaker} can explain whether new evidence justified it.`,
      });
    }
  }

  if (priorIssue && receipts.length < 3) {
    const entries = [
      ...masonLedger.entries.filter(e => e.sourceNewsletterId === priorIssue.id).map(e => ({ ...e, bot: 'entertainer' as const })),
      ...westyLedger.entries.filter(e => e.sourceNewsletterId === priorIssue.id).map(e => ({ ...e, bot: 'analyst' as const })),
    ]
      .filter(entry => entry.memorable || entry.claimType === 'prediction' || entry.claimType === 'reaction')
      .reverse();

    for (const entry of entries) {
      if (receipts.length >= 3) break;
      const result = entry.subjectType === 'team' ? currentResultForTeam(input, entry.subject) : null;
      if (!result) continue;
      if (receipts.some(r => normalize(r.originalTake).includes(normalize(entry.claim).slice(0, 30)))) continue;
      const speaker = speakerLabel(entry.bot);
      receipts.push({
        id: `take:${entry.id}`,
        receiptType: 'take_check',
        source: { speaker, season: entry.season, week: entry.week, issueId: entry.sourceNewsletterId, issueTitle: entry.title },
        originalTake: entry.claim,
        whatHappenedAfterward: result,
        team: entry.subjectType === 'team' ? entry.subject : entry.relatedTeam,
        player: entry.subjectType === 'player' ? entry.subject : undefined,
        clancy: `From ${entry.title ?? `Week ${entry.week}`}, ${speaker} put this on the record: “${entry.claim}” Since then: ${result}`,
      });
    }
  }

  if (priorIssue && receipts.length < 3) {
    const loaded = await loadNewsletterById(priorIssue.id).catch(() => null);
    const pr = loaded?.newsletter.sections.find(section => section.type === 'PowerRankings');
    const data = pr?.data as { masonRankings?: Array<{ rank: number; team: string }>; westyRankings?: Array<{ rank: number; team: string }>; rankings?: Array<{ rank: number; team: string }> } | undefined;
    const lists = [
      { speaker: 'Mason Reed' as const, values: data?.masonRankings ?? data?.rankings ?? [] },
      { speaker: 'Westy' as const, values: data?.westyRankings ?? [] },
    ];
    const masonByTeam = new Map(lists[0].values.map(value => [normalize(value.team), value]));
    const rankDisagreements = lists[1].values
      .map(westy => ({ westy, mason: masonByTeam.get(normalize(westy.team)) }))
      .filter((row): row is { westy: { rank: number; team: string }; mason: { rank: number; team: string } } => Boolean(row.mason))
      .map(row => ({ ...row, gap: Math.abs(row.mason.rank - row.westy.rank) }))
      .sort((a, b) => b.gap - a.gap);
    const biggest = rankDisagreements.find(row => row.gap >= 3 && currentResultForTeam(input, row.westy.team));
    if (biggest) {
      const result = currentResultForTeam(input, biggest.westy.team)!;
      receipts.push({
        id: `ranking-disagreement:${priorIssue.id}:${biggest.westy.team}`,
        receiptType: 'ranking_receipt',
        source: { speaker: 'Mason Reed & Westy', season: priorIssue.season, week: priorIssue.week, issueId: priorIssue.id, issueTitle: priorIssue.title },
        originalTake: `Mason ranked ${biggest.westy.team} #${biggest.mason.rank}; Westy ranked them #${biggest.westy.rank}.`,
        whatHappenedAfterward: result,
        team: biggest.westy.team,
        clancy: `Ranking receipt: Mason had ${biggest.westy.team} #${biggest.mason.rank}; Westy had them #${biggest.westy.rank}. This week: ${result} The gap is the record; the writers can say whose process they still prefer.`,
      });
    } else {
      outer: for (const list of lists) {
        for (const ranking of list.values) {
          if (ranking.rank > 3) continue;
          const result = currentResultForTeam(input, ranking.team);
          if (!result || !/ lost /.test(` ${result.toLowerCase()} `)) continue;
          receipts.push({
            id: `ranking:${priorIssue.id}:${list.speaker}:${ranking.team}`,
            receiptType: 'ranking_receipt',
            source: { speaker: list.speaker, season: priorIssue.season, week: priorIssue.week, issueId: priorIssue.id, issueTitle: priorIssue.title },
            originalTake: `${ranking.team} was ranked #${ranking.rank}.`,
            whatHappenedAfterward: result,
            team: ranking.team,
            clancy: `${list.speaker} had ${ranking.team} at #${ranking.rank}. This week: ${result} The ranking is the receipt; the interpretation belongs to the writers.`,
          });
          break outer;
        }
      }
    }
  }

  if (receipts.length < 3) {
    const corrections = [
      ...(input.memEntertainer.editorialCorrections ?? []),
      ...(input.memAnalyst.editorialCorrections ?? []),
    ]
      .filter(entry => entry.season === input.season && entry.week < input.week)
      .sort((a, b) => b.week - a.week);
    const correction = corrections[0]?.corrections?.[0];
    if (correction) {
      receipts.push({
        id: `correction:${corrections[0].week}:${correction.section}`,
        receiptType: 'factual_correction',
        source: { speaker: 'Editorial', season: input.season, week: corrections[0].week },
        originalTake: correction.original,
        whatHappenedAfterward: `The published version was corrected to: ${correction.published}`,
        clancy: `Editorial record: ${correction.note}. The published text was corrected, so the corrected version is the one that carries forward.`,
      });
    }
  }

  const selected = receipts.slice(0, 3);
  if (!selected.length) {
    return { mode: 'receipt_desk', audited: true, receipts: [], note: 'Audit complete. Nothing material enough to put on the desk this week.' };
  }

  const record = JSON.stringify(selected.map(r => ({ id: r.id, type: r.receiptType, source: r.source, originalTake: r.originalTake, whatHappenedAfterward: r.whatHappenedAfterward })), null, 2);
  const [masonRaw, westyRaw] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Receipt Desk Response',
      context: `VERIFIED RECEIPTS ONLY:\n${record}`,
      constraints: 'Return ONLY a JSON object keyed by receipt id. For receipts relevant to Mason, give a 1-3 sentence response that owns it, defends the process, updates the take, or explains what evidence changed. Do not dispute the quoted record. Omit receipts not relevant to Mason.',
      maxTokens: 700,
    }).catch(() => '{}'),
    generateSection({
      persona: 'analyst',
      sectionType: 'Receipt Desk Response',
      context: `VERIFIED RECEIPTS ONLY:\n${record}`,
      constraints: 'Return ONLY a JSON object keyed by receipt id. For receipts relevant to Westy, give a 1-3 sentence response that owns it, defends the process, updates the take, or explains what evidence changed. Do not dispute the quoted record. Omit receipts not relevant to Westy.',
      maxTokens: 700,
    }).catch(() => '{}'),
  ]);
  const mason = parseResponseMap(masonRaw);
  const westy = parseResponseMap(westyRaw);
  for (const receipt of selected) {
    if (mason[receipt.id]) receipt.masonResponse = mason[receipt.id];
    if (westy[receipt.id]) receipt.westyResponse = westy[receipt.id];
  }

  return { mode: 'receipt_desk', audited: true, receipts: selected };
}
