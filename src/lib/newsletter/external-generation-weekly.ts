import * as core from './external-generation-core';
export * from './external-generation-core';

export type ExternalEpisodeFormat = core.ExternalEpisodeFormat;

const WEEKLY_RECAP_CONTRACT = `## Permanent Weekly Recap contract

The Weekly Recap is the default in-season East v. West episode. Its visible order is canonical and must not be rearranged:

1. Opening Exchange
2. Transactions Since the Last Issue
3. All Six Completed Matchup Reviews
4. Weekly Power Rankings
5. League Pulse
6. Stock Watch
7. Clancy's Receipt Desk
8. All Six Upcoming Matchup Previews
9. Final Word

Transactions always come immediately after the opening. Start the transaction window at the previous published issue cutoff so the same move is not covered in consecutive issues. Include meaningful trades, waiver claims, free-agent additions, drops, and verified IR/taxi movement. Preserve chronological order where practical. Give major transactions full Mason/Westy treatment and compress minor moves.

All six completed matchups receive substantive, roughly comparable editorial attention early in the season. Do not manufacture a Game of the Week. The point is what changed in the evaluation of each team, what looks repeatable versus variance, lineup and player developments, and whether prior or preseason takes need updating. Do not merely narrate the box score.

Mason and Westy must independently produce complete 1-12 power rankings before either list is exposed to the other. Store the lists independently. Render them by rank in this order: Mason #1, Westy #1, Mason #2, Westy #2, continuing through #12. Show movement from each writer's own previous list where available. Ranking commentary must explain rank placement rather than repeat the matchup review.

League Pulse is compact early in the season. Do not force playoff-race framing before the standings implications are meaningful. The league has seven playoff teams and the #1 seed receives the only first-round bye. Later in the season, League Pulse may naturally become playoff-race coverage.

Stock Watch is selective. There is no required number of risers or fallers. Include a team, player, position group, or narrative only when the evidence materially changed the evaluation.

Clancy remains the league historian, archivist, procedural observer, and continuity keeper. Receipt Desk is a separate recurring mode from his rare archival guest appearances and is not limited by the archival cameo cap. Clancy is not a third fantasy pundit. He may surface only structured, verified prior material. Valid receipt types are prediction_result, take_check, ranking_receipt, and factual_correction. Each receipt needs speaker, original issue/week, original take, what happened afterward, receipt type, and relevant team/player when applicable. Clancy states the record briefly, then Mason and/or Westy may own it, defend it, update it, or explain changed evidence. Clancy must not declare subjective football opinions wrong, issue rulings or penalties, accuse managers, or claim commissioner/official authority. If the audit finds nothing worthwhile, the Receipt Desk may be empty.

Preview all six upcoming matchups. Each preview needs the matchup, the key question, Mason's pick and reasoning, and Westy's pick and reasoning. Persist those picks so the next Weekly Recap can audit them.
`;

export const EXTERNAL_NEWSLETTER_EDITORIAL_BIBLE = `${core.EXTERNAL_NEWSLETTER_EDITORIAL_BIBLE}\n\n${WEEKLY_RECAP_CONTRACT}`;

const REGULAR_FORMAT: ExternalEpisodeFormat = {
  key: 'regular',
  title: 'Weekly Recap',
  purpose: 'Explain what changed this week, hold the hosts accountable to the published record, and set up every game on the next slate.',
  sections: [
    '1. Opening Exchange',
    '2. Transactions Since the Last Issue',
    '3. All Six Completed Matchup Reviews',
    '4. Weekly Power Rankings',
    '5. League Pulse',
    '6. Stock Watch',
    "7. Clancy's Receipt Desk",
    '8. All Six Upcoming Matchup Previews',
    '9. Final Word',
  ],
  emphasis: [
    'Transactions are second and use the previous published issue cutoff. Major moves get full Mason/Westy analysis; minor moves are compressed and chronological where practical.',
    'Give all six completed matchups substantive, roughly comparable attention early in the season. Do not force a Game of the Week or simply recap box scores.',
    'Mason and Westy independently create full 1-12 rankings before comparison. Store them separately, render them interleaved by rank, and show movement from each writer\'s own prior list.',
    'League Pulse stays compact early and evolves into playoff-race coverage only when standings implications are meaningful. Seven teams make the playoffs and the #1 seed has the first-round bye.',
    'Stock Watch is selective with no forced quota.',
    'Receipt Desk uses only structured verified prior material. Clancy surfaces the record and the writers answer for it; archival cameos remain separate and capped independently.',
    'Preview all six upcoming games with a key question plus Mason and Westy picks/reasoning, and persist the picks for next week\'s audit.',
  ],
};

export const EXTERNAL_EPISODE_FORMATS: Record<string, ExternalEpisodeFormat> = {
  ...core.EXTERNAL_EPISODE_FORMATS,
  regular: REGULAR_FORMAT,
};

export function getExternalEpisodeFormat(episodeType: string): ExternalEpisodeFormat {
  return EXTERNAL_EPISODE_FORMATS[episodeType] ?? EXTERNAL_EPISODE_FORMATS.special;
}

export function buildWritingRoomMarkdown(input: Parameters<typeof core.buildWritingRoomMarkdown>[0]): string {
  return `# East v. West Newsletter Writing Room\n\nPermanent generation instructions for externally produced East v. West newsletters. Generated ${input.exportedAt} for the ${input.season} season.\n\n## How to use this file\n\nKeep this file in the ChatGPT project/workspace used to create finished East v. West issues. For each episode, download the separate episode Source Pack from the website and upload it with the request to generate that issue. The episode Source Pack is newer and wins on changing facts such as rosters, values, transactions, bot memory, standings, and draft ownership.\n\n${EXTERNAL_NEWSLETTER_EDITORIAL_BIBLE}\n\n## Episode format library\n\n${Object.values(EXTERNAL_EPISODE_FORMATS).map(format => `### ${format.title}\n\nPurpose: ${format.purpose}\n\nCanonical/suggested sections:\n${format.sections.map(section => `- ${section}`).join('\n')}\n\nEmphasis:\n${format.emphasis.map(note => `- ${note}`).join('\n')}`).join('\n\n')}\n\n## Mason Reed permanent personality\n\n\`\`\`json\n${JSON.stringify(input.mason, null, 2)}\n\`\`\`\n\n## Trent Weston / Westy permanent personality\n\n\`\`\`json\n${JSON.stringify(input.westy, null, 2)}\n\`\`\`\n\n## Effective admin personality settings\n\n### Mason\n\n\`\`\`json\n${JSON.stringify(input.masonSettings, null, 2)}\n\`\`\`\n\n### Westy\n\n\`\`\`json\n${JSON.stringify(input.westySettings, null, 2)}\n\`\`\`\n\n## Shared league context\n\n${input.staticLeagueContext}\n\n## League rules\n\n${input.leagueRules}\n\n## Team narrative cards\n\n\`\`\`json\n${JSON.stringify(input.teamNarrativeCards, null, 2)}\n\`\`\`\n\n## Phrase pools and banned language\n\n\`\`\`json\n${JSON.stringify(input.phrasePools, null, 2)}\n\`\`\`\n\n## Final generation directive\n\nWhen an episode Source Pack is supplied, first determine the issue's central stories and each host's position on them. For a Weekly Recap, follow the permanent nine-section order above exactly. Then write the issue as Mason and Westy, not as an assistant summarizing Mason and Westy. Use neutral prose only for compact factual presentation. Research current NFL information when it materially changes an East v. West conclusion. Run a final fact, continuity, voice, repetition, transaction-cutoff, receipt-grounding, and analytical-depth review before creating the PDF.\n`;
}
