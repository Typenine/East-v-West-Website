from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding='utf-8')


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding='utf-8')


def replace_once(rel: str, old: str, new: str, label: str) -> None:
    text = read(rel)
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match in {rel}, found {count}')
    write(rel, text.replace(old, new, 1))


def replace_regex_once(rel: str, pattern: str, replacement: str, label: str) -> None:
    text = read(rel)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count == 0 and replacement in text:
        return
    if count != 1:
        raise RuntimeError(f'{label}: expected one regex match in {rel}, found {count}')
    write(rel, updated)


# Counting and tie behavior is centralized here so every route and result view
# uses the same rules.
write('src/lib/votes/compute.ts', "import type {\n  BallotMap,\n  BordaResult,\n  EligibilityType,\n  IRVElimRound,\n  IRVResult,\n  PluralityResult,\n  PollOption,\n  PollRound,\n  RoundResult,\n  YesNoResult,\n} from './types';\n\nexport function resolveThreshold(round: PollRound, eligibilityType: EligibilityType): number {\n  switch (round.thresholdType) {\n    case 'majority':\n      return eligibilityType === 'team' ? 7 : (round.thresholdValue ?? 8);\n    case 'supermajority':\n      return 9;\n    case 'admin_defined':\n      return round.thresholdValue ?? 7;\n    case 'plurality':\n    default:\n      return Infinity;\n  }\n}\n\nfunction hasBallots(ballots: BallotMap): boolean {\n  return Object.values(ballots).some((selections) => selections.length > 0);\n}\n\nfunction cutoffIds(\n  ordered: Array<{ optionId: string; value: number }>,\n  requestedCount: number,\n): string[] {\n  if (!ordered.length || requestedCount <= 0) return [];\n  const index = Math.min(requestedCount, ordered.length) - 1;\n  const cutoff = ordered[index]?.value;\n  if (cutoff == null) return [];\n  return ordered.filter((entry) => entry.value >= cutoff).map((entry) => entry.optionId);\n}\n\nexport function computeBorda(\n  ballots: BallotMap,\n  options: PollOption[],\n  survivorCount: number,\n): BordaResult {\n  const N = options.length;\n  const points: Record<string, number> = {};\n  for (const opt of options) points[opt.id] = 0;\n\n  for (const selections of Object.values(ballots)) {\n    for (const sel of selections) {\n      if (sel.rank != null && points[sel.optionId] !== undefined) {\n        // rank 1 = N points, rank 2 = N-1 points, etc.\n        points[sel.optionId] += N - (sel.rank - 1);\n      }\n    }\n  }\n\n  const optMap = Object.fromEntries(options.map((o) => [o.id, o]));\n  const scores = Object.entries(points)\n    .map(([optionId, pts]) => ({\n      optionId,\n      text: optMap[optionId]?.text ?? '',\n      points: pts,\n      isSurvivor: false,\n    }))\n    .sort((a, b) => b.points - a.points || a.text.localeCompare(b.text));\n\n  const survivors = hasBallots(ballots)\n    ? cutoffIds(\n        scores.map((score) => ({ optionId: score.optionId, value: score.points })),\n        Math.max(1, survivorCount),\n      )\n    : [];\n  const survivorSet = new Set(survivors);\n  for (const score of scores) score.isSurvivor = survivorSet.has(score.optionId);\n\n  return { type: 'borda', scores, survivors };\n}\n\nexport function computeIRV(\n  ballots: BallotMap,\n  options: PollOption[],\n  threshold: number,\n): IRVResult {\n  const remaining = new Set(options.map((o) => o.id));\n  const rounds: IRVElimRound[] = [];\n  let roundIndex = 0;\n\n  if (!hasBallots(ballots)) {\n    return { type: 'irv', rounds, winners: [], threshold };\n  }\n\n  while (remaining.size > 1) {\n    const firstChoiceCounts: Record<string, number> = {};\n    for (const id of remaining) firstChoiceCounts[id] = 0;\n\n    for (const selections of Object.values(ballots)) {\n      const ranked = [...selections]\n        .filter((selection) => selection.rank != null && remaining.has(selection.optionId))\n        .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));\n      if (ranked.length > 0) {\n        firstChoiceCounts[ranked[0].optionId] =\n          (firstChoiceCounts[ranked[0].optionId] ?? 0) + 1;\n      }\n    }\n\n    const totalVotes = Object.values(firstChoiceCounts).reduce((sum, count) => sum + count, 0);\n    for (const [optionId, count] of Object.entries(firstChoiceCounts)) {\n      if (count >= threshold || (threshold === Infinity && count > totalVotes / 2)) {\n        rounds.push({ roundIndex, firstChoiceCounts, eliminated: [] });\n        return { type: 'irv', rounds, winners: [optionId], threshold };\n      }\n    }\n\n    const minCount = Math.min(...Object.values(firstChoiceCounts));\n    const eliminated = Object.entries(firstChoiceCounts)\n      .filter(([, count]) => count === minCount)\n      .map(([id]) => id);\n\n    // Never silently eliminate every remaining option. An all-way tie is returned\n    // to the commissioner as multiple winners so it can be resolved explicitly.\n    if (eliminated.length === remaining.size) {\n      rounds.push({ roundIndex, firstChoiceCounts, eliminated: [] });\n      return { type: 'irv', rounds, winners: [...remaining], threshold };\n    }\n\n    rounds.push({ roundIndex, firstChoiceCounts, eliminated });\n    for (const id of eliminated) remaining.delete(id);\n    roundIndex++;\n  }\n\n  const winners = [...remaining];\n  const lastCounts: Record<string, number> = {};\n  for (const id of remaining) lastCounts[id] = 0;\n  for (const selections of Object.values(ballots)) {\n    const ranked = [...selections]\n      .filter((selection) => selection.rank != null && remaining.has(selection.optionId))\n      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));\n    if (ranked.length > 0) {\n      lastCounts[ranked[0].optionId] = (lastCounts[ranked[0].optionId] ?? 0) + 1;\n    }\n  }\n  rounds.push({ roundIndex, firstChoiceCounts: lastCounts, eliminated: [] });\n\n  if (threshold !== Infinity) {\n    const winnerCount = lastCounts[winners[0]] ?? 0;\n    if (winnerCount < threshold) {\n      return { type: 'irv', rounds, winners: [], threshold };\n    }\n  }\n\n  return { type: 'irv', rounds, winners, threshold };\n}\n\nexport function computePlurality(\n  ballots: BallotMap,\n  options: PollOption[],\n  winnerCount = 1,\n): PluralityResult {\n  const counts: Record<string, number> = {};\n  for (const opt of options) counts[opt.id] = 0;\n\n  for (const selections of Object.values(ballots)) {\n    for (const selection of selections) {\n      if (selection.selected && counts[selection.optionId] !== undefined) {\n        counts[selection.optionId] += 1;\n      }\n    }\n  }\n\n  const optMap = Object.fromEntries(options.map((o) => [o.id, o]));\n  const sorted = Object.entries(counts)\n    .map(([optionId, count]) => ({\n      optionId,\n      text: optMap[optionId]?.text ?? '',\n      count,\n      isWinner: false,\n    }))\n    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));\n\n  const winners = hasBallots(ballots)\n    ? cutoffIds(\n        sorted.map((entry) => ({ optionId: entry.optionId, value: entry.count })),\n        Math.max(1, winnerCount),\n      )\n    : [];\n  const winnerSet = new Set(winners);\n  for (const entry of sorted) entry.isWinner = winnerSet.has(entry.optionId);\n\n  return { type: 'plurality', counts: sorted, winners };\n}\n\nexport function computeElimination(\n  ballots: BallotMap,\n  options: PollOption[],\n  survivorCount?: number,\n): PluralityResult {\n  const counts: Record<string, number> = {};\n  for (const opt of options) counts[opt.id] = 0;\n\n  for (const selections of Object.values(ballots)) {\n    for (const selection of selections) {\n      if (selection.selected && counts[selection.optionId] !== undefined) {\n        counts[selection.optionId] += 1;\n      }\n    }\n  }\n\n  const optMap = Object.fromEntries(options.map((o) => [o.id, o]));\n  const displayCounts = Object.entries(counts)\n    .map(([optionId, count]) => ({\n      optionId,\n      text: optMap[optionId]?.text ?? '',\n      count,\n      isWinner: false,\n    }))\n    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));\n\n  let winners: string[] = [];\n  if (hasBallots(ballots) && options.length > 0) {\n    const requested = Math.max(1, Math.min(survivorCount ?? options.length - 1, options.length));\n    const safest = [...displayCounts].sort(\n      (a, b) => a.count - b.count || a.text.localeCompare(b.text),\n    );\n    const cutoff = safest[Math.min(requested, safest.length) - 1]?.count;\n    winners = cutoff == null\n      ? []\n      : safest.filter((entry) => entry.count <= cutoff).map((entry) => entry.optionId);\n  }\n\n  const winnerSet = new Set(winners);\n  for (const entry of displayCounts) entry.isWinner = winnerSet.has(entry.optionId);\n  return { type: 'plurality', counts: displayCounts, winners };\n}\n\nexport function computeYesNo(\n  ballots: BallotMap,\n  yesOptionId: string,\n  threshold: number,\n): YesNoResult {\n  let yes = 0;\n  let no = 0;\n\n  for (const selections of Object.values(ballots)) {\n    for (const selection of selections) {\n      if (!selection.selected) continue;\n      if (selection.optionId === yesOptionId) yes++;\n      else no++;\n    }\n  }\n\n  return { type: 'yes_no', yes, no, passed: yes >= threshold, threshold };\n}\n\nexport function computeRound(\n  round: PollRound,\n  ballots: BallotMap,\n  options: PollOption[],\n  eligibilityType: EligibilityType,\n): RoundResult {\n  const threshold = resolveThreshold(round, eligibilityType);\n\n  switch (round.voteType) {\n    case 'borda':\n      return computeBorda(ballots, options, round.survivorCount ?? 1);\n    case 'irv':\n      return computeIRV(ballots, options, threshold);\n    case 'select_one':\n      return computePlurality(ballots, options, round.survivorCount ?? 1);\n    case 'select_multi':\n      return computePlurality(ballots, options, round.survivorCount ?? 1);\n    case 'eliminate':\n      return computeElimination(ballots, options, round.survivorCount ?? undefined);\n    case 'yes_no': {\n      const yesOption = options.find((option) => option.displayOrder === 0) ?? options[0];\n      return computeYesNo(ballots, yesOption?.id ?? '', threshold);\n    }\n    default:\n      return computePlurality(ballots, options, 1);\n  }\n}\n\nexport function buildBallotMap(\n  votes: Array<{\n    vote: { voterId: string };\n    selections: Array<{\n      optionId: string;\n      rank?: number | null;\n      selected?: boolean | null;\n    }>;\n  }>,\n): BallotMap {\n  const map: BallotMap = {};\n  for (const { vote, selections } of votes) {\n    map[vote.voterId] = selections.map((selection) => ({\n      optionId: selection.optionId,\n      rank: selection.rank ?? undefined,\n      selected: selection.selected ?? undefined,\n    }));\n  }\n  return map;\n}\n")

# Public poll list: never turn a database error into a false "no votes" state,
# and describe deadlines as commissioner-controlled target close dates.
write('src/app/votes/page.tsx', "'use client';\n\nimport { useEffect, useState } from 'react';\nimport Link from 'next/link';\nimport SectionHeader from '@/components/ui/SectionHeader';\nimport { Card, CardContent } from '@/components/ui/Card';\nimport { Tabs } from '@/components/ui/Tabs';\nimport type { PollListItem } from '@/lib/votes/types';\n\nconst STATUS_COLORS: Record<string, string> = {\n  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',\n  open: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',\n  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',\n};\n\nfunction StatusBadge({ status }: { status: string }) {\n  return (\n    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}>\n      {status}\n    </span>\n  );\n}\n\nfunction ProgressBar({ value, max }: { value: number; max: number }) {\n  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;\n  return (\n    <div className=\"space-y-1\">\n      <div className=\"flex justify-between text-xs text-[var(--muted)]\">\n        <span>{value}/{max} voted</span>\n        <span>{pct}%</span>\n      </div>\n      <div className=\"h-1.5 rounded-full bg-[var(--surface-strong)] overflow-hidden\">\n        <div className=\"h-full rounded-full bg-[var(--accent)] transition-all\" style={{ width: `${pct}%` }} />\n      </div>\n    </div>\n  );\n}\n\nfunction PollCard({ item }: { item: PollListItem }) {\n  const { poll, currentRound, roundCount } = item;\n  return (\n    <Link href={`/votes/${poll.id}`} className=\"block group\">\n      <Card className=\"transition-colors hover:border-[var(--accent)]/50\">\n        <CardContent className=\"pt-4 space-y-2\">\n          <div className=\"flex items-start justify-between gap-2\">\n            <p className=\"font-semibold group-hover:text-[var(--accent)] transition-colors\">{poll.title}</p>\n            <StatusBadge status={poll.status} />\n          </div>\n          {poll.description && (\n            <p className=\"text-sm text-[var(--muted)] line-clamp-2\">{poll.description}</p>\n          )}\n          {currentRound && poll.status === 'open' && (\n            <ProgressBar value={currentRound.voteCount} max={currentRound.totalEligible} />\n          )}\n          <div className=\"flex flex-wrap gap-2 items-center\">\n            <span className=\"text-xs text-[var(--muted)]\">{roundCount} round{roundCount !== 1 ? 's' : ''}</span>\n            <span className=\"text-xs text-[var(--muted)]\">\u00b7</span>\n            <span className=\"text-xs text-[var(--muted)]\">{poll.eligibilityType === 'team' ? '12 teams' : '14 members'}</span>\n            {poll.deadline && poll.status === 'open' && (\n              <>\n                <span className=\"text-xs text-[var(--muted)]\">\u00b7</span>\n                <span className=\"text-xs text-[var(--muted)]\">Target close: {new Date(poll.deadline).toLocaleDateString()}</span>\n              </>\n            )}\n            {poll.linkedSuggestionIds?.length ? (\n              <>\n                <span className=\"text-xs text-[var(--muted)]\">\u00b7</span>\n                <span className=\"text-xs text-[var(--muted)]\">{poll.linkedSuggestionIds.length} linked suggestion{poll.linkedSuggestionIds.length !== 1 ? 's' : ''}</span>\n              </>\n            ) : null}\n          </div>\n        </CardContent>\n      </Card>\n    </Link>\n  );\n}\n\nexport default function VotesPage() {\n  const [items, setItems] = useState<PollListItem[]>([]);\n  const [loading, setLoading] = useState(true);\n  const [loadError, setLoadError] = useState<string | null>(null);\n\n  useEffect(() => {\n    fetch('/api/votes', { cache: 'no-store' })\n      .then(async (response) => {\n        if (!response.ok) throw new Error('Votes could not be loaded.');\n        const data = await response.json();\n        if (!Array.isArray(data)) throw new Error('Votes returned an invalid response.');\n        setItems(data);\n      })\n      .catch((error: unknown) => {\n        setLoadError(error instanceof Error ? error.message : 'Votes could not be loaded.');\n      })\n      .finally(() => setLoading(false));\n  }, []);\n\n  const active = items.filter((item) => item.poll.status === 'open');\n  const past = items.filter((item) => item.poll.status === 'closed');\n\n  return (\n    <div className=\"container mx-auto px-4 py-8\">\n      <SectionHeader\n        title=\"League Votes\"\n        subtitle=\"Official polls and voting \u2014 log in to cast your ballot\"\n      />\n      {loading ? (\n        <p className=\"text-[var(--muted)]\">Loading votes\u2026</p>\n      ) : loadError ? (\n        <div className=\"rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500\">\n          {loadError} Refresh the page or contact the commissioner if the problem continues.\n        </div>\n      ) : items.length === 0 ? (\n        <p className=\"text-[var(--muted)]\">No votes yet. Check back when the commissioner opens one.</p>\n      ) : (\n        <Tabs\n          tabs={[\n            {\n              id: 'active',\n              label: `Active${active.length ? ` (${active.length})` : ''}`,\n              content: active.length === 0\n                ? <p className=\"text-[var(--muted)] py-4\">No active votes right now.</p>\n                : <div className=\"space-y-4 pt-4\">{active.map((item) => <PollCard key={item.poll.id} item={item} />)}</div>,\n            },\n            {\n              id: 'past',\n              label: `Past${past.length ? ` (${past.length})` : ''}`,\n              content: past.length === 0\n                ? <p className=\"text-[var(--muted)] py-4\">No past votes.</p>\n                : <div className=\"space-y-4 pt-4\">{past.map((item) => <PollCard key={item.poll.id} item={item} />)}</div>,\n            },\n          ]}\n          initialId=\"active\"\n        />\n      )}\n    </div>\n  );\n}\n")


replace_once(
    'src/server/db/votes-queries.ts',
    """  } catch {
    return [];
  }
}

export async function getRoundsForPoll""",
    """  } catch (error) {
    console.error('[listPolls]', error instanceof Error ? error.message : error);
    throw error;
  }
}

export async function getRoundsForPoll""",
    'list polls error propagation',
)

# Public votes API: surface load failures and cap formal ballots at four rounds.
replace_once(
    'src/app/api/votes/route.ts',
    """  } catch {
    return Response.json([], { status: 200 });
  }
}""",
    """  } catch (error) {
    console.error('[GET /api/votes]', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Failed to load votes.' }, { status: 500 });
  }
}""",
    'public votes error response',
)
replace_once(
    'src/app/api/votes/route.ts',
    """    const hasRounds = roundDefs && roundDefs.length > 0;
    const hasQuestions = questionDefs && questionDefs.length > 0;""",
    """    const hasRounds = roundDefs && roundDefs.length > 0;
    const hasQuestions = questionDefs && questionDefs.length > 0;
    if ((roundDefs?.length ?? 0) > 4) {
      return Response.json({ error: 'Formal ballots support a maximum of 4 rounds.' }, { status: 400 });
    }""",
    'four-round API cap',
)


replace_once(
    'src/app/api/votes/route.ts',
    """              linkedSuggestionId: opt.linkedSuggestionId || null,""",
    """              linkedSuggestionId:
                opt.linkedSuggestionId ||
                (linkedSuggestionIds?.length === round1Options.length ? linkedSuggestionIds[idx] : null),""",
    'round option suggestion mapping',
)

# Detail API: visible results should actually be computed while an immediate or
# all-voted poll is open.
replace_once(
    'src/app/api/votes/[id]/route.ts',
    """      if (resultsVisible && round.status === 'closed') {""",
    """      if (resultsVisible && (round.status === 'open' || round.status === 'closed')) {""",
    'live ballot results',
)

advance_block = r"""    if (action === 'advance_round' || action === 'advance_and_open') {
      const closedRound = [...rounds]
        .filter((candidate) => candidate.status === 'closed' && candidate.roundNumber < rounds.length)
        .sort((a, b) => b.roundNumber - a.roundNumber)[0];
      if (!closedRound) {
        return Response.json({ error: 'No closed non-final round to advance from.' }, { status: 409 });
      }

      const nextRound = rounds.find((candidate) => candidate.roundNumber === closedRound.roundNumber + 1);
      if (!nextRound) return Response.json({ error: 'Next round not found.' }, { status: 404 });
      if (nextRound.status === 'closed') {
        return Response.json({ error: 'The next round is already closed.' }, { status: 409 });
      }

      let nextOptions = await getOptionsForRound(nextRound.id);
      if (nextOptions.length === 0) {
        if (nextRound.voteType === 'yes_no') {
          nextOptions = await createOptions([
            { roundId: nextRound.id, text: 'Yes', displayOrder: 0 },
            { roundId: nextRound.id, text: 'No', displayOrder: 1 },
          ]);
        } else {
          const closedOptions = await getOptionsForRound(closedRound.id);
          const allVotes = await getAllVotesWithSelections(closedRound.id);
          const ballotMap = buildBallotMap(
            allVotes.map((vote) => ({
              vote,
              selections: vote.selections.map((selection) => ({
                optionId: selection.optionId,
                rank: selection.rank,
                selected: selection.selected,
              })),
            })),
          );
          const result = computeRound(closedRound, ballotMap, closedOptions, poll.eligibilityType);
          const expectedSurvivors = Math.max(1, closedRound.survivorCount ?? 1);
          const unresolvedTie =
            result.type === 'borda'
              ? result.survivors.length > expectedSurvivors
              : result.type === 'yes_no'
                ? false
                : result.winners.length > expectedSurvivors;
          if (unresolvedTie) {
            return Response.json(
              { error: 'The round is tied at the advancement cutoff. Resolve the tie before opening the next round.' },
              { status: 409 },
            );
          }

          const survivorIds =
            result.type === 'borda'
              ? result.survivors
              : result.type === 'yes_no'
                ? []
                : result.winners;

          if (survivorIds.length === 0) {
            return Response.json(
              { error: 'This round has no advancing option. Resolve the result before opening the next round.' },
              { status: 409 },
            );
          }

          const survivorOptions = survivorIds
            .map((optionId) => closedOptions.find((option) => option.id === optionId))
            .filter(Boolean) as typeof closedOptions;

          nextOptions = await createOptions(
            survivorOptions.map((option, index) => ({
              roundId: nextRound.id,
              text: option.text,
              linkedSuggestionId: option.linkedSuggestionId,
              carriedFromOptionId: option.id,
              displayOrder: index,
            })),
          );
        }

        if (nextOptions.length === 0) {
          return Response.json({ error: 'Failed to create the next round options.' }, { status: 500 });
        }
      }

      if (action === 'advance_and_open' && nextRound.status !== 'open') {
        const opened = await updateRoundStatus(nextRound.id, 'open', { openedAt: new Date().toISOString() });
        if (!opened) return Response.json({ error: 'Failed to open the next round.' }, { status: 500 });
      }

      return Response.json({
        ok: true,
        nextRound: { ...nextRound, status: action === 'advance_and_open' ? 'open' : nextRound.status },
        options: nextOptions,
      });
    }

    if (action === 'publish_results') {"""

replace_regex_once(
    'src/app/api/votes/[id]/route.ts',
    r"""    if \(action === 'advance_round'\) \{.*?\n    \}\n\n    if \(action === 'publish_results'\) \{""",
    advance_block,
    'idempotent round advancement',
)

suggestion_block = r"""        // Update linked suggestions individually. A multi-option poll must not
        // mark every linked proposal as passed just because the poll has a winner.
        const options = await getOptionsForRound(targetRoundId);
        const allVotes = await getAllVotesWithSelections(targetRoundId);
        const ballotMap = buildBallotMap(
          allVotes.map((vote) => ({
            vote,
            selections: vote.selections.map((selection) => ({
              optionId: selection.optionId,
              rank: selection.rank,
              selected: selection.selected,
            })),
          })),
        );
        const result = computeRound(round, ballotMap, options, poll.eligibilityType);

        if (result.type === 'yes_no') {
          for (const suggestionId of poll.linkedSuggestionIds ?? []) {
            await updateSuggestionVoteTag(
              suggestionId,
              result.passed ? 'vote_passed' : 'vote_failed',
            ).catch(() => {});
          }
        } else {
          const advancingIds = new Set(
            result.type === 'borda' ? result.survivors : result.winners,
          );
          for (const option of options) {
            if (!option.linkedSuggestionId) continue;
            await updateSuggestionVoteTag(
              option.linkedSuggestionId,
              advancingIds.has(option.id) ? 'vote_passed' : 'vote_failed',
            ).catch(() => {});
          }
        }"""

replace_regex_once(
    'src/app/api/votes/[id]/route.ts',
    r"""        // Update linked suggestion voteTags based on result\n        if \(poll\.linkedSuggestionIds\?\.length\) \{.*?\n        \}""",
    suggestion_block,
    'linked suggestion outcomes',
)

# Commissioner workflow uses the most recently closed round and one idempotent
# server action to build and open the next round.
replace_once(
    'src/components/admin/votes/AdminPollCard.tsx',
    """  const closedNonFinal = entry.rounds.find((r) => r.status === 'closed' && r.roundNumber < entry.roundCount);""",
    """  const closedNonFinal = [...entry.rounds]
    .filter((r) => r.status === 'closed' && r.roundNumber < entry.roundCount)
    .sort((a, b) => b.roundNumber - a.roundNumber)[0];""",
    'latest closed admin round',
)
replace_once(
    'src/components/admin/votes/AdminPollCard.tsx',
    """    if (body.action === 'advance_and_open') {
      await onAction({ action: 'advance_round' });
      await onAction({ action: 'open_round', roundNumber: body.roundNumber });
      return;
    }""",
    """    if (body.action === 'advance_and_open') {
      await onAction(nextAction.body);
      return;
    }""",
    'single advance-and-open request',
)

# The poll builder and backend both enforce the agreed maximum of four rounds.
replace_once(
    'src/lib/votes/poll-builder.ts',
    """  if (!hasQuestions && !hasRounds) return 'Add at least one question.';""",
    """  if (!hasQuestions && !hasRounds) return 'Add at least one question.';
  if (hasRounds && state.rounds.length > 4) return 'Formal ballots support a maximum of 4 rounds.';""",
    'four-round builder validation',
)
replace_once(
    'src/components/admin/votes/CreatePollWizard.tsx',
    """            <button
              type="button"
              onClick={() => patch({ rounds: [...state.rounds, defaultRound('select_one')] })}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              + Add round
            </button>""",
    """            <button
              type="button"
              disabled={state.rounds.length >= 4}
              onClick={() => {
                if (state.rounds.length < 4) patch({ rounds: [...state.rounds, defaultRound('select_one')] });
              }}
              className="text-sm text-[var(--accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              {state.rounds.length >= 4 ? '4-round maximum reached' : '+ Add round'}
            </button>""",
    'four-round builder control',
)
replace_once(
    'src/components/admin/votes/CreatePollWizard.tsx',
    """              Hides who wrote each text answer from members. Totals (e.g. 8 voted Yes) still show unless you set results to &quot;When I publish&quot; and publish after closing.""",
    """              Hides respondent identities from members and commissioner result views. The system still retains an internal identity key to prevent duplicate responses.""",
    'anonymous poll explanation',
)

# Existing ballots are preloaded, live results display correctly, and ballot +
# survey submissions can recover cleanly if one half fails.
replace_once(
    'src/app/votes/[id]/page.tsx',
    """function RankBallot({ round, displayOptions, onChange }: {
  round: RoundWithDetails;
  displayOptions: typeof round.options;
  onChange: (selections: BallotSelection[]) => void;
}) {
  const [ranks, setRanks] = useState<Record<string, string>>(() =>
    Object.fromEntries(round.options.map((o) => [o.id, ''])),
  );""",
    """function RankBallot({ round, displayOptions, onChange, initialSelections }: {
  round: RoundWithDetails;
  displayOptions: typeof round.options;
  onChange: (selections: BallotSelection[]) => void;
  initialSelections?: BallotSelection[];
}) {
  const [ranks, setRanks] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      round.options.map((option) => [
        option.id,
        String(initialSelections?.find((selection) => selection.optionId === option.id)?.rank ?? ''),
      ]),
    ),
  );""",
    'rank ballot prefill',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """function RadioBallot({ round, displayOptions, onChange, label }: {
  round: RoundWithDetails;
  displayOptions: typeof round.options;
  onChange: (selections: BallotSelection[]) => void;
  label?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);""",
    """function RadioBallot({ round, displayOptions, onChange, label, initialSelections }: {
  round: RoundWithDetails;
  displayOptions: typeof round.options;
  onChange: (selections: BallotSelection[]) => void;
  label?: string;
  initialSelections?: BallotSelection[];
}) {
  const [selected, setSelected] = useState<string | null>(
    initialSelections?.find((selection) => selection.selected)?.optionId ?? null,
  );""",
    'radio ballot prefill',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """function CheckboxBallot({ round, displayOptions, onChange }: {
  round: RoundWithDetails;
  displayOptions: typeof round.options;
  onChange: (selections: BallotSelection[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());""",
    """function CheckboxBallot({ round, displayOptions, onChange, initialSelections }: {
  round: RoundWithDetails;
  displayOptions: typeof round.options;
  onChange: (selections: BallotSelection[]) => void;
  initialSelections?: BallotSelection[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelections?.filter((selection) => selection.selected).map((selection) => selection.optionId) ?? []),
  );""",
    'checkbox ballot prefill',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """function YesNoBallot({ round, onChange }: {
  round: RoundWithDetails;
  onChange: (selections: BallotSelection[]) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);""",
    """function YesNoBallot({ round, onChange, initialSelections }: {
  round: RoundWithDetails;
  onChange: (selections: BallotSelection[]) => void;
  initialSelections?: BallotSelection[];
}) {
  const [picked, setPicked] = useState<string | null>(
    initialSelections?.find((selection) => selection.selected)?.optionId ?? null,
  );""",
    'yes-no ballot prefill',
)

irv_display = r"""function IRVResultDisplay({ result, round }: { result: IRVResult; round: RoundWithDetails }) {
  const optionText = new Map(round.options.map((option) => [option.id, option.text]));
  const winnerLabels = result.winners.map((optionId) => optionText.get(optionId) ?? optionId);

  return (
    <div className="space-y-3">
      {result.rounds.map((r, i) => (
        <details key={i} open={i === result.rounds.length - 1}>
          <summary className="cursor-pointer text-sm font-medium">
            Elimination Round {i + 1}
            {r.eliminated.length > 0 && <span className="ml-2 text-xs text-red-500">— eliminated</span>}
          </summary>
          <div className="mt-2 space-y-1 pl-2">
            {Object.entries(r.firstChoiceCounts).sort((a, b) => b[1] - a[1]).map(([optId, count]) => (
              <div key={optId} className={`flex justify-between text-sm px-2 py-1 rounded ${r.eliminated.includes(optId) ? 'text-red-500 line-through opacity-60' : ''}`}>
                <span>{optionText.get(optId) ?? optId}</span>
                <span>{count} first-choice votes</span>
              </div>
            ))}
          </div>
        </details>
      ))}
      {winnerLabels.length > 0 ? (
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm font-semibold text-green-700 dark:text-green-400">
          {winnerLabels.length === 1 ? 'Winner' : 'Tie requiring commissioner resolution'}: {winnerLabels.join(', ')}
        </div>
      ) : (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          No option met the required threshold.
        </div>
      )}
    </div>
  );
}"""

replace_regex_once(
    'src/app/votes/[id]/page.tsx',
    r"""function IRVResultDisplay\(\{ result \}: \{ result: IRVResult \}\) \{.*?\n\}\n\nfunction PluralityResultDisplay""",
    irv_display + "\n\nfunction PluralityResultDisplay",
    'IRV result labels',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """  if (result.type === 'irv') return <IRVResultDisplay result={result} />;""",
    """  if (result.type === 'irv') return <IRVResultDisplay result={result} round={round} />;""",
    'IRV result round prop',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """        setDetail(data);
        // Pre-fill form answers from existing response""",
    """        setDetail(data);
        setBallot(data.myBallot ?? []);
        // Pre-fill form answers from existing response""",
    'parent ballot prefill',
)

submit_all = r"""  async function handleSubmitAll() {
    setCastError(null);
    setFormError(null);
    const hasBallot = detail?.currentRound?.status === 'open' && ballot.length > 0;
    const hasForm = Boolean(detail?.questions?.length);

    if (hasBallot && hasForm) {
      setCastBusy(true);
      setFormBusy(true);
      try {
        const castRes = await fetch(`/api/votes/${id}/cast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selections: ballot }),
        });
        const castData = await castRes.json();
        if (!castRes.ok) {
          setCastError(castData.error ?? 'Failed to submit vote.');
          return;
        }
        setCastSuccess(true);

        const formRes = await fetch(`/api/votes/${id}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: Object.values(formAnswers) }),
        });
        const formData = await formRes.json();
        if (!formRes.ok) {
          setFormError(formData.error ?? 'Your vote was saved, but the survey failed. Correct the survey and submit it again.');
          await fetchDetail();
          return;
        }

        setHasSubmittedForm(true);
        if (formData.confirmationMessage) setConfirmationMessage(formData.confirmationMessage);
        await fetchDetail();
      } catch {
        setCastError('Network error.');
      } finally {
        setCastBusy(false);
        setFormBusy(false);
      }
    } else if (hasBallot) {
      await handleCast();
      await fetchDetail();
    } else if (hasForm) {
      await handleFormSubmit();
      await fetchDetail();
    }
  }"""

replace_regex_once(
    'src/app/votes/[id]/page.tsx',
    r"""  async function handleSubmitAll\(\) \{.*?\n  \}\n\n  if \(loading\)""",
    submit_all + "\n\n  if (loading)",
    'recoverable combined submit',
)

replace_once(
    'src/app/votes/[id]/page.tsx',
    """        {poll.deadline && <span className="text-xs text-[var(--muted)]">Deadline: {new Date(poll.deadline).toLocaleDateString()}</span>}""",
    """        {poll.deadline && <span className="text-xs text-[var(--muted)]">Target close: {new Date(poll.deadline).toLocaleDateString()}</span>}""",
    'target close wording',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """<RankBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} />""",
    """<RankBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} initialSelections={myBallot ?? undefined} />""",
    'rank ballot initial call',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """<RadioBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} label="Select one option." />""",
    """<RadioBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} label="Select one option." initialSelections={myBallot ?? undefined} />""",
    'single ballot initial call',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """<RadioBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} label="Select the option you want eliminated." />""",
    """<RadioBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} label="Select the option you want eliminated." initialSelections={myBallot ?? undefined} />""",
    'eliminate ballot initial call',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """<CheckboxBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} />""",
    """<CheckboxBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} initialSelections={myBallot ?? undefined} />""",
    'multi ballot initial call',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """<YesNoBallot round={currentRound} onChange={setBallot} />""",
    """<YesNoBallot round={currentRound} onChange={setBallot} initialSelections={myBallot ?? undefined} />""",
    'yes-no initial call',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """                    {questions.length === 0 && (""",
    """                    {(questions.length === 0 || hasSubmittedForm) && (""",
    'independent ballot retry',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """                  {showFormResults && (poll.status === 'closed' || !isLoggedIn) && (() => {""",
    """                  {showFormResults && (() => {""",
    'live form results display',
)
replace_once(
    'src/app/votes/[id]/page.tsx',
    """            {isLoggedIn && !hasSubmittedForm && poll.status === 'open' && questions.length > 0 && (!currentRound || currentRound.status !== 'open') && (""",
    """            {isLoggedIn && !hasSubmittedForm && poll.status === 'open' && questions.length > 0 && (!currentRound || currentRound.status !== 'open' || alreadyVoted) && (""",
    'independent form retry',
)

# Anonymous polls remain duplicate-safe internally but commissioner result views
# and exports no longer expose team identities.
replace_once(
    'src/app/api/admin/votes/[id]/results/route.ts',
    """      votes: allVotes.map((v) => ({ vote: v, selections: v.selections })),""",
    """      votes: allVotes.map((v, index) => ({
        vote: poll.anonymous
          ? { ...v, voterId: `anonymous-${index + 1}`, voterDisplay: `Respondent ${index + 1}` }
          : v,
        selections: v.selections,
      })),""",
    'anonymous admin result identities',
)
replace_once(
    'src/app/api/admin/votes/[id]/export/route.ts',
    """  const dataRows = [...voterMap.entries()].map(([voterId, entry]) => {
    const ballotCells = rounds.map((r) => csvCell(entry.ballotByRound.get(r.id) ?? ''));
    const formCells = questions.map((q) => csvCell(entry.formAnswers.get(q.id) ?? ''));
    return [csvCell(voterId), csvCell(entry.display), csvCell(''), ...ballotCells, ...formCells].join(',');
  });""",
    """  const dataRows = [...voterMap.entries()].map(([voterId, entry], index) => {
    const ballotCells = rounds.map((r) => csvCell(entry.ballotByRound.get(r.id) ?? ''));
    const formCells = questions.map((q) => csvCell(entry.formAnswers.get(q.id) ?? ''));
    const exportVoterId = poll.anonymous ? '' : voterId;
    const exportDisplay = poll.anonymous ? `Respondent ${index + 1}` : entry.display;
    return [csvCell(exportVoterId), csvCell(exportDisplay), csvCell(''), ...ballotCells, ...formCells].join(',');
  });""",
    'anonymous CSV identities',
)

print('[votes-functional] Voting reliability fixes applied.')
