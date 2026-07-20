/**
 * Canonical newsletter editor field map.
 *
 * This module is intentionally UI-agnostic. The admin workspace, AI rewrite
 * endpoint, coverage tools, and consistency checks all use the same stable
 * field addresses so every visible piece of newsletter copy can be edited.
 */

import { joinFieldPath } from './field-path';

export type EditorVoice = 'entertainer' | 'analyst' | 'clancy' | 'neutral';
export type EditableFieldKind = 'textarea' | 'text' | 'number' | 'select' | 'grade';

export interface EditableFieldDef {
  fieldPath: string;
  label: string;
  bot: EditorVoice;
  kind?: EditableFieldKind;
  options?: Array<{ value: string; label: string }>;
  group?: string;
  aiEnabled?: boolean;
}

export interface EditableSection {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

const BOOL_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

const CONFIDENCE_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const TREND_OPTIONS = [
  { value: 'up', label: 'Up' },
  { value: 'steady', label: 'Steady' },
  { value: 'down', label: 'Down' },
];

function pushText(
  fields: EditableFieldDef[],
  fieldPath: string,
  label: string,
  bot: EditorVoice,
  group?: string,
  kind: EditableFieldKind = 'textarea',
): void {
  fields.push({ fieldPath, label, bot, group, kind, aiEnabled: kind === 'textarea' || kind === 'text' });
}

function pushValue(
  fields: EditableFieldDef[],
  fieldPath: string,
  label: string,
  kind: EditableFieldKind,
  group?: string,
  options?: Array<{ value: string; label: string }>,
): void {
  fields.push({ fieldPath, label, bot: 'neutral', group, kind, options, aiEnabled: false });
}

export function getEditableFields(sec: EditableSection): EditableFieldDef[] {
  const fields: EditableFieldDef[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = sec.data as any;
  if (d == null) return fields;

  switch (sec.type) {
    case 'Intro':
      pushText(fields, 'bot1_text', 'Mason', 'entertainer');
      pushText(fields, 'bot2_text', 'Westy', 'analyst');
      break;

    case 'FinalWord':
    case 'SpotlightTeam':
    case 'Blurt':
      if (d.team !== undefined) pushValue(fields, 'team', 'Featured team', 'text');
      if (d.bot1 !== undefined) pushText(fields, 'bot1', 'Mason', 'entertainer');
      if (d.bot2 !== undefined) pushText(fields, 'bot2', 'Westy', 'analyst');
      break;

    case 'ClancyInsert':
      if (d.label !== undefined) pushText(fields, 'label', 'Display label', 'clancy', undefined, 'text');
      if (d.text !== undefined) pushText(fields, 'text', 'Clancy', 'clancy');
      break;

    case 'MockDraft':
      if (d.mason_intro !== undefined) pushText(fields, 'mason_intro', 'Mason intro', 'entertainer', 'Introduction');
      if (d.westy_intro !== undefined) pushText(fields, 'westy_intro', 'Westy intro', 'analyst', 'Introduction');
      if (Array.isArray(d.picks)) {
        d.picks.forEach((pick: Record<string, unknown>, i: number) => {
          const overall = Number(pick.overall ?? i + 1);
          const group = `Pick ${overall}`;
          if (pick.overall !== undefined) pushValue(fields, `picks.${i}.overall`, `${group} overall`, 'number', group);
          if (pick.team !== undefined) pushValue(fields, `picks.${i}.team`, `${group} team`, 'text', group);
          if (pick.player !== undefined) pushValue(fields, `picks.${i}.player`, `${group} player`, 'text', group);
          const mason = pick.mason as Record<string, unknown> | undefined;
          const westy = pick.westy as Record<string, unknown> | undefined;
          if (mason?.analysis !== undefined) pushText(fields, `picks.${i}.mason.analysis`, `${group} — Mason`, 'entertainer', group);
          if (westy?.analysis !== undefined) pushText(fields, `picks.${i}.westy.analysis`, `${group} — Westy`, 'analyst', group);
        });
      }
      break;

    case 'Trades':
      if (Array.isArray(d)) {
        d.forEach((trade: Record<string, unknown>, i: number) => {
          const teamsMap = trade.teams as Record<string, unknown> | null | undefined;
          const names = teamsMap ? Object.keys(teamsMap) : [];
          const group = `Trade ${i + 1}${names.length ? ` — ${names.join(' / ')}` : ''}`;
          if (trade.context !== undefined) pushText(fields, joinFieldPath([i, 'context']), `${group} context`, 'neutral', group);
          if (trade.debate_line !== undefined) pushText(fields, joinFieldPath([i, 'debate_line']), `${group} debate line`, 'neutral', group);
          const analysis = trade.analysis as Record<string, Record<string, string>> | undefined;
          if (analysis) {
            Object.entries(analysis).forEach(([teamKey, item]) => {
              const teamGroup = `${group} · ${teamKey}`;
              if (item.entertainer_paragraph !== undefined) {
                pushText(fields, joinFieldPath([i, 'analysis', teamKey, 'entertainer_paragraph']), `${teamKey} — Mason`, 'entertainer', teamGroup);
              }
              if (item.analyst_paragraph !== undefined) {
                pushText(fields, joinFieldPath([i, 'analysis', teamKey, 'analyst_paragraph']), `${teamKey} — Westy`, 'analyst', teamGroup);
              }
              if (item.entertainer_grade !== undefined) {
                pushValue(fields, joinFieldPath([i, 'analysis', teamKey, 'entertainer_grade']), `${teamKey} — Mason grade`, 'grade', teamGroup);
              }
              if (item.analyst_grade !== undefined) {
                pushValue(fields, joinFieldPath([i, 'analysis', teamKey, 'analyst_grade']), `${teamKey} — Westy grade`, 'grade', teamGroup);
              }
            });
          }
        });
      }
      break;

    case 'MatchupRecaps':
      if (Array.isArray(d)) {
        d.forEach((recap: Record<string, unknown>, i: number) => {
          const matchup = recap.winner ? `${recap.winner} vs ${recap.loser}` : `Matchup ${i + 1}`;
          const group = `Recap ${i + 1} — ${matchup}`;
          for (const [key, label, kind] of [
            ['winner', 'Winner', 'text'], ['loser', 'Loser', 'text'],
            ['winner_score', 'Winner score', 'number'], ['loser_score', 'Loser score', 'number'],
            ['bracketLabel', 'Bracket label', 'text'],
          ] as const) {
            if (recap[key] !== undefined) pushValue(fields, `${i}.${key}`, `${group} — ${label}`, kind, group);
          }
          if (recap.bot1 !== undefined) pushText(fields, `${i}.bot1`, `${group} — Mason`, 'entertainer', group);
          if (recap.bot2 !== undefined) pushText(fields, `${i}.bot2`, `${group} — Westy`, 'analyst', group);
          if (Array.isArray(recap.dialogue)) {
            (recap.dialogue as Array<Record<string, unknown>>).forEach((exchange, j) => {
              const voice = exchange.speaker === 'entertainer' ? 'entertainer' : 'analyst';
              pushText(fields, `${i}.dialogue.${j}.text`, `${group} — ${voice === 'entertainer' ? 'Mason' : 'Westy'} exchange ${j + 1}`, voice, group);
            });
          }
        });
      }
      break;

    case 'WaiversAndFA':
      if (Array.isArray(d)) {
        d.forEach((item: Record<string, unknown>, i: number) => {
          const group = `Waiver ${i + 1}${item.player ? ` — ${item.player}` : ''}`;
          if (item.player !== undefined) pushValue(fields, `${i}.player`, `${group} player`, 'text', group);
          if (item.team !== undefined) pushValue(fields, `${i}.team`, `${group} team`, 'text', group);
          if (item.faab_spent !== undefined) pushValue(fields, `${i}.faab_spent`, `${group} FAAB`, 'number', group);
          if (item.bot1 !== undefined) pushText(fields, `${i}.bot1`, `${group} — Mason`, 'entertainer', group);
          if (item.bot2 !== undefined) pushText(fields, `${i}.bot2`, `${group} — Westy`, 'analyst', group);
        });
      }
      break;

    case 'DraftGrades':
      if (Array.isArray(d.grades)) {
        d.grades.forEach((grade: Record<string, unknown>, i: number) => {
          const group = String(grade.team ?? `Team ${i + 1}`);
          if (grade.team !== undefined) pushValue(fields, `grades.${i}.team`, `${group} team`, 'text', group);
          if (grade.grade !== undefined) pushValue(fields, `grades.${i}.grade`, `${group} overall grade`, 'grade', group);
          if (grade.bot1_analysis !== undefined) pushText(fields, `grades.${i}.bot1_analysis`, `${group} — Mason`, 'entertainer', group);
          if (grade.bot2_analysis !== undefined) pushText(fields, `grades.${i}.bot2_analysis`, `${group} — Westy`, 'analyst', group);
        });
      }
      if (d.bot1_summary !== undefined) pushText(fields, 'bot1_summary', 'Mason summary', 'entertainer', 'Summary');
      if (d.bot2_summary !== undefined) pushText(fields, 'bot2_summary', 'Westy summary', 'analyst', 'Summary');
      break;

    case 'PowerRankings':
      if (d.bot1_intro !== undefined) pushText(fields, 'bot1_intro', 'Mason intro', 'entertainer', 'Introduction');
      if (d.bot2_intro !== undefined) pushText(fields, 'bot2_intro', 'Westy intro', 'analyst', 'Introduction');
      if (Array.isArray(d.rankings)) {
        d.rankings.forEach((ranking: Record<string, unknown>, i: number) => {
          const group = `Rank ${ranking.rank ?? i + 1} — ${ranking.team ?? 'Team'}`;
          if (ranking.rank !== undefined) pushValue(fields, `rankings.${i}.rank`, `${group} rank`, 'number', group);
          if (ranking.team !== undefined) pushValue(fields, `rankings.${i}.team`, `${group} team`, 'text', group);
          if (ranking.record !== undefined) pushValue(fields, `rankings.${i}.record`, `${group} record`, 'text', group);
          if (ranking.pointsFor !== undefined) pushValue(fields, `rankings.${i}.pointsFor`, `${group} points for`, 'number', group);
          if (ranking.trend !== undefined) pushValue(fields, `rankings.${i}.trend`, `${group} trend`, 'select', group, TREND_OPTIONS);
          if (ranking.trendAmount !== undefined) pushValue(fields, `rankings.${i}.trendAmount`, `${group} trend amount`, 'number', group);
          if (ranking.bot1_blurb !== undefined) pushText(fields, `rankings.${i}.bot1_blurb`, `${group} — Mason`, 'entertainer', group);
          if (ranking.bot2_blurb !== undefined) pushText(fields, `rankings.${i}.bot2_blurb`, `${group} — Westy`, 'analyst', group);
        });
      }
      break;

    case 'Forecast':
      if (Array.isArray(d.intro_dialogue)) {
        d.intro_dialogue.forEach((item: Record<string, unknown>, i: number) => {
          const voice = item.speaker === 'entertainer' ? 'entertainer' : 'analyst';
          pushText(fields, `intro_dialogue.${i}.text`, `Forecast intro — ${voice === 'entertainer' ? 'Mason' : 'Westy'} ${i + 1}`, voice, 'Introduction');
        });
      }
      if (Array.isArray(d.picks)) {
        d.picks.forEach((pick: Record<string, unknown>, i: number) => {
          const group = `Matchup ${i + 1} — ${pick.team1 ?? '?'} vs ${pick.team2 ?? '?'}`;
          for (const key of ['team1', 'team2', 'bot1_pick', 'bot2_pick', 'est_bot1', 'est_bot2'] as const) {
            if (pick[key] !== undefined) pushValue(fields, `picks.${i}.${key}`, `${group} — ${key.replaceAll('_', ' ')}`, 'text', group);
          }
          if (pick.confidence_bot1 !== undefined) pushValue(fields, `picks.${i}.confidence_bot1`, `${group} — Mason confidence`, 'select', group, CONFIDENCE_OPTIONS);
          if (pick.confidence_bot2 !== undefined) pushValue(fields, `picks.${i}.confidence_bot2`, `${group} — Westy confidence`, 'select', group, CONFIDENCE_OPTIONS);
          if (pick.upset_bot1 !== undefined) pushValue(fields, `picks.${i}.upset_bot1`, `${group} — Mason upset`, 'select', group, BOOL_OPTIONS);
          if (pick.upset_bot2 !== undefined) pushValue(fields, `picks.${i}.upset_bot2`, `${group} — Westy upset`, 'select', group, BOOL_OPTIONS);
          if (pick.note_bot1 !== undefined) pushText(fields, `picks.${i}.note_bot1`, `${group} — Mason note`, 'entertainer', group);
          if (pick.note_bot2 !== undefined) pushText(fields, `picks.${i}.note_bot2`, `${group} — Westy note`, 'analyst', group);
        });
      }
      if (d.bot1_matchup_of_the_week !== undefined) pushValue(fields, 'bot1_matchup_of_the_week', 'Mason matchup of the week', 'text', 'Highlights');
      if (d.bot2_matchup_of_the_week !== undefined) pushValue(fields, 'bot2_matchup_of_the_week', 'Westy matchup of the week', 'text', 'Highlights');
      if (d.bot1_bold_player !== undefined) pushValue(fields, 'bot1_bold_player', 'Mason bold player', 'text', 'Bold predictions');
      if (d.bot2_bold_player !== undefined) pushValue(fields, 'bot2_bold_player', 'Westy bold player', 'text', 'Bold predictions');
      if (d.records?.entertainer) {
        pushValue(fields, 'records.entertainer.w', 'Mason prediction wins', 'number', 'Prediction records');
        pushValue(fields, 'records.entertainer.l', 'Mason prediction losses', 'number', 'Prediction records');
      }
      if (d.records?.analyst) {
        pushValue(fields, 'records.analyst.w', 'Westy prediction wins', 'number', 'Prediction records');
        pushValue(fields, 'records.analyst.l', 'Westy prediction losses', 'number', 'Prediction records');
      }
      break;

    case 'SeasonPreview':
      for (const listKey of ['contenders', 'sleepers', 'bustCandidates'] as const) {
        if (!Array.isArray(d[listKey])) continue;
        d[listKey].forEach((item: Record<string, unknown>, i: number) => {
          const group = `${listKey} ${i + 1}`;
          if (item.team !== undefined) pushValue(fields, `${listKey}.${i}.team`, `${group} team`, 'text', group);
          if (item.reason !== undefined) pushText(fields, `${listKey}.${i}.reason`, `${group} reason`, 'neutral', group);
        });
      }
      for (const [botKey, voice] of [['bot1', 'entertainer'], ['bot2', 'analyst']] as const) {
        if (Array.isArray(d.boldPredictions?.[botKey])) {
          d.boldPredictions[botKey].forEach((_value: unknown, i: number) => {
            pushText(fields, `boldPredictions.${botKey}.${i}`, `${voice === 'entertainer' ? 'Mason' : 'Westy'} bold prediction ${i + 1}`, voice, 'Bold predictions');
          });
        }
        if (d.championshipPick?.[botKey] !== undefined) {
          pushValue(fields, `championshipPick.${botKey}`, `${voice === 'entertainer' ? 'Mason' : 'Westy'} championship pick`, 'text', 'Championship picks');
        }
      }
      break;

    case 'PredictionCallbacks':
      if (Array.isArray(d)) {
        d.forEach((item: Record<string, unknown>, i: number) => {
          const voice = item.bot === 'entertainer' ? 'entertainer' : 'analyst';
          if (item.originalPick !== undefined) pushValue(fields, `${i}.originalPick`, `Callback ${i + 1} original pick`, 'text', `Callback ${i + 1}`);
          if (item.reaction !== undefined) pushText(fields, `${i}.reaction`, `Callback ${i + 1} — ${voice === 'entertainer' ? 'Mason' : 'Westy'}`, voice, `Callback ${i + 1}`);
        });
      }
      break;

    case 'WeeklyAwards':
      for (const awardKey of ['mvp', 'bust', 'waiver_winner'] as const) {
        const award = d[awardKey] as Record<string, unknown> | undefined;
        if (!award) continue;
        const group = awardKey.replaceAll('_', ' ');
        if (award.team !== undefined) pushValue(fields, `${awardKey}.team`, `${group} team`, 'text', group);
        if (award.player !== undefined) pushValue(fields, `${awardKey}.player`, `${group} player`, 'text', group);
        if (award.points !== undefined) pushValue(fields, `${awardKey}.points`, `${group} points`, 'number', group);
        if (award.entertainer_take !== undefined) pushText(fields, `${awardKey}.entertainer_take`, `${group} — Mason`, 'entertainer', group);
        if (award.analyst_take !== undefined) pushText(fields, `${awardKey}.analyst_take`, `${group} — Westy`, 'analyst', group);
      }
      for (const awardKey of ['biggest_blowout', 'nail_biter'] as const) {
        const award = d[awardKey] as Record<string, unknown> | undefined;
        if (!award) continue;
        const group = awardKey.replaceAll('_', ' ');
        if (award.winner !== undefined) pushValue(fields, `${awardKey}.winner`, `${group} winner`, 'text', group);
        if (award.loser !== undefined) pushValue(fields, `${awardKey}.loser`, `${group} loser`, 'text', group);
        if (award.margin !== undefined) pushValue(fields, `${awardKey}.margin`, `${group} margin`, 'number', group);
        if (award.commentary !== undefined) pushText(fields, `${awardKey}.commentary`, `${group} commentary`, 'neutral', group);
      }
      break;

    default: {
      const keyMap: Array<[string, string, EditorVoice]> = [
        ['bot1_text', 'Mason', 'entertainer'], ['bot2_text', 'Westy', 'analyst'],
        ['bot1', 'Mason', 'entertainer'], ['bot2', 'Westy', 'analyst'],
        ['mason_intro', 'Mason intro', 'entertainer'], ['westy_intro', 'Westy intro', 'analyst'],
        ['bot1_summary', 'Mason summary', 'entertainer'], ['bot2_summary', 'Westy summary', 'analyst'],
        ['bot1_analysis', 'Mason analysis', 'entertainer'], ['bot2_analysis', 'Westy analysis', 'analyst'],
        ['bot1_preview', 'Mason preview', 'entertainer'], ['bot2_preview', 'Westy preview', 'analyst'],
        ['bot1_coronation', 'Mason', 'entertainer'], ['bot2_coronation', 'Westy', 'analyst'],
        ['bot1_finalThoughts', 'Mason final thoughts', 'entertainer'], ['bot2_finalThoughts', 'Westy final thoughts', 'analyst'],
        ['entertainer_commentary', 'Mason commentary', 'entertainer'], ['analyst_commentary', 'Westy commentary', 'analyst'],
        ['text', 'Text', 'neutral'],
      ];
      for (const [key, label, bot] of keyMap) {
        if (typeof d[key] === 'string') pushText(fields, key, label, bot);
      }
      break;
    }
  }
  return fields;
}

export function getTradeGradeFields(sec: EditableSection): Array<{ fieldPath: string; label: string; current: string }> {
  return getEditableFields(sec)
    .filter(field => field.kind === 'grade')
    .map(field => ({
      fieldPath: field.fieldPath,
      label: field.label,
      current: String(getPathValue(sec.data, field.fieldPath) ?? ''),
    }))
    .filter(field => /^[A-F][+-]?$/i.test(field.current.trim()));
}

function getPathValue(value: unknown, path: string): unknown {
  try {
    if (path.startsWith('[')) {
      const segments = JSON.parse(path) as Array<string | number>;
      return segments.reduce<unknown>((current, segment) => {
        if (current == null || typeof current !== 'object') return undefined;
        return (current as Record<string | number, unknown>)[segment];
      }, value);
    }
    return path.split('.').reduce<unknown>((current, segment) => {
      if (current == null || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[segment];
    }, value);
  } catch {
    return undefined;
  }
}
