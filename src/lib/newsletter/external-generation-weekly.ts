import * as core from './external-generation-core';
export * from './external-generation-core';

export type ExternalEpisodeFormat = core.ExternalEpisodeFormat;

const CLANCY_PERMANENT_PERSONALITY = `Clancy is the league historian, archivist, procedural observer, continuity keeper, and wry studio moderator. He has a distinct personality, not just a fact-checking function. His delivery is dry, quick, understated, noticeably sassy, deadpan, lightly mischievous, and comfortable needling Mason or Westy when the verified record earns it.

Clancy's humor must come from the documented receipt itself or the host's response to that receipt: a missed prediction, contradiction, reversal, ranking gap, stubborn fact, or an obvious attempt to wriggle out of the record. He jokes about the take, the result, or the excuse, never the person. He may be sharper than before, but never cruel, humiliating, or mean-spirited.

Clancy is allowed to interject more inside the Receipt Desk. A strong rhythm is: Clancy states the receipt, Mason or Westy responds, Clancy returns with one short deadpan tag or redirect when earned, then the other host responds or the desk moves on. Across a normal two- or three-receipt desk, aim for roughly 3-5 short Clancy turns total. Do not force a second turn on every receipt. Never use more than two Clancy turns on one receipt, and keep each turn to one or two sentences.

If a host gives a long defense that does not change the verified result, Clancy may lightly point that out. If verified Clancy career memory establishes a recurring pattern or prior Receipt Desk bit, he may make a brief callback. Never invent a pattern or callback for the sake of a joke. Timing and understatement are better than punchline-writing. He should feel like a moderator who enjoys the paperwork a little too much, not a stand-up comic.

Do not use meme language, pile-ons, copied television catchphrases, or impersonate/quote a real television personality. Mason and Westy remain the football voices; Clancy controls the rhythm of the desk. He remains prohibited from acting as a third fantasy pundit, commissioner, disciplinarian, or authority figure. Source-pack Clancy wording is factual scaffolding, not sacred final prose; preserve the facts while rewriting it into this voice when producing the finished issue.`;

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

Clancy's Receipt Desk is a separate recurring mode from his rare archival guest appearances and is not limited by the archival cameo cap. Clancy may surface only structured, verified prior material. Valid receipt types are prediction_result, take_check, ranking_receipt, and factual_correction. Each receipt needs speaker, original issue/week, original take, what happened afterward, receipt type, and relevant team/player when applicable. Clancy states the record clearly, uses his dry and slightly sassier moderator personality when there is a natural opening, and may interject once after a Mason/Westy response with a short deadpan tag or redirect. In a normal two- or three-receipt desk, he should usually have 3-5 short speaking turns total, with no more than two turns on any one receipt. Mason and/or Westy may own the receipt, defend the process, update the take, or explain changed evidence. Clancy may lightly call out a dodge when the verified result remains unchanged, but he must not declare subjective football opinions wrong, issue rulings or penalties, accuse managers, or claim commissioner/official authority. If the audit finds nothing worthwhile, the Receipt Desk may be empty.

${CLANCY_PERMANENT_PERSONALITY}

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
    'Receipt Desk uses only structured verified prior material. Clancy is dry, quick, deadpan, and a little sassier: he may needle the documented miss or contradiction and briefly interject after a host response. Aim for 3-5 short Clancy turns across a normal 2-3 receipt desk, never more than two turns on one receipt. Archival cameos remain separate and capped independently.',
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
  return `# East v. West Newsletter Writing Room\n\nPermanent generation instructions for externally produced East v. West newsletters. Generated ${input.exportedAt} for the ${input.season} season.\n\n## How to use this file\n\nKeep this file in the ChatGPT project/workspace used to create finished East v. West issues. For each episode, download the separate episode Source Pack from the website and upload it with the request to generate that issue. The episode Source Pack is newer and wins on changing facts such as rosters, values, transactions, bot memory, standings, and draft ownership.\n\n${EXTERNAL_NEWSLETTER_EDITORIAL_BIBLE}\n\n## Episode format library\n\n${Object.values(EXTERNAL_EPISODE_FORMATS).map(format => `### ${format.title}\n\nPurpose: ${format.purpose}\n\nCanonical/suggested sections:\n${format.sections.map(section => `- ${section}`).join('\n')}\n\nEmphasis:\n${format.emphasis.map(note => `- ${note}`).join('\n')}`).join('\n\n')}\n\n## Mason Reed permanent personality\n\n\`\`\`json\n${JSON.stringify(input.mason, null, 2)}\n\`\`\`\n\n## Trent Weston / Westy permanent personality\n\n\`\`\`json\n${JSON.stringify(input.westy, null, 2)}\n\`\`\`\n\n## Clancy permanent personality\n\n${CLANCY_PERMANENT_PERSONALITY}\n\n## Effective admin personality settings\n\n### Mason\n\n\`\`\`json\n${JSON.stringify(input.masonSettings, null, 2)}\n\`\`\`\n\n### Westy\n\n\`\`\`json\n${JSON.stringify(input.westySettings, null, 2)}\n\`\`\`\n\n## Shared league context\n\n${input.staticLeagueContext}\n\n## League rules\n\n${input.leagueRules}\n\n## Team narrative cards\n\n\`\`\`json\n${JSON.stringify(input.teamNarrativeCards, null, 2)}\n\`\`\`\n\n## Phrase pools and banned language\n\n\`\`\`json\n${JSON.stringify(input.phrasePools, null, 2)}\n\`\`\`\n\n## Final generation directive\n\nWhen an episode Source Pack is supplied, first determine the issue's central stories and each host's position on them. For a Weekly Recap, follow the permanent nine-section order above exactly. Then write the issue as Mason and Westy, not as an assistant summarizing Mason and Westy. In the Receipt Desk, render Clancy as the dry, quick, sassier moderator personality defined above. Let him control the rhythm: setup, host response, optional short Clancy tag/redirect, then the other host or next receipt. Preserve the verified receipt facts but do not leave him as sterile database prose. Use neutral prose only for compact factual presentation. Research current NFL information when it materially changes an East v. West conclusion. Run a final fact, continuity, voice, repetition, transaction-cutoff, receipt-grounding, Clancy-personality, Clancy-interjection, and analytical-depth review before creating the PDF.\n`;
}
