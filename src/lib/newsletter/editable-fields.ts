import { joinFieldPath } from './field-path';

export type EditableFieldKind = 'textarea' | 'text' | 'number' | 'select' | 'boolean' | 'string-list';

export interface EditableFieldDef {
  fieldPath: string;
  label: string;
  bot: 'entertainer' | 'analyst' | 'neutral';
  kind: EditableFieldKind;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
}

export interface EditableSection {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

const GRADE_OPTIONS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];
const CONFIDENCE_OPTIONS = ['high', 'medium', 'low'];
const TREND_OPTIONS = ['up', 'down', 'steady'];

function personaForKey(key: string, inherited: EditableFieldDef['bot'] = 'neutral'): EditableFieldDef['bot'] {
  const value = key.toLowerCase();
  if (value.includes('mason') || value.includes('bot1') || value.includes('entertainer')) return 'entertainer';
  if (value.includes('westy') || value.includes('bot2') || value.includes('analyst')) return 'analyst';
  return inherited;
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function fieldKind(key: string, value: unknown): Pick<EditableFieldDef, 'kind' | 'options' | 'rows'> {
  const lower = key.toLowerCase();
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'number') return { kind: 'number' };
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return { kind: 'string-list', rows: 3 };
  if (/grade$/.test(lower) && typeof value === 'string') {
    return { kind: 'select', options: GRADE_OPTIONS.map(option => ({ value: option, label: option })) };
  }
  if (lower.includes('confidence') && typeof value === 'string') {
    return { kind: 'select', options: CONFIDENCE_OPTIONS.map(option => ({ value: option, label: titleCase(option) })) };
  }
  if (lower === 'trend' && typeof value === 'string') {
    return { kind: 'select', options: TREND_OPTIONS.map(option => ({ value: option, label: titleCase(option) })) };
  }
  if (lower === 'outcome' && typeof value === 'string') {
    return { kind: 'select', options: ['correct', 'wrong'].map(option => ({ value: option, label: titleCase(option) })) };
  }
  if (typeof value === 'string' && (value.length > 100 || /text|analysis|commentary|paragraph|reason|take|reaction|summary|intro|preview|argument|thought|scenario|stakes|breakdown|hype|narrative|verdict|followup/i.test(key))) {
    return { kind: 'textarea', rows: value.length > 400 ? 8 : 5 };
  }
  return { kind: 'text' };
}

function addField(
  fields: EditableFieldDef[],
  seen: Set<string>,
  path: Array<string | number>,
  label: string,
  value: unknown,
  bot: EditableFieldDef['bot'] = 'neutral',
): void {
  const fieldPath = joinFieldPath(path);
  if (seen.has(fieldPath)) return;
  seen.add(fieldPath);
  fields.push({ fieldPath, label, bot, ...fieldKind(String(path[path.length - 1] ?? ''), value) });
}

function addKnownFields(sec: EditableSection, fields: EditableFieldDef[], seen: Set<string>): void {
  const d = sec.data;
  if (d == null) return;

  const add = (path: Array<string | number>, label: string, bot: EditableFieldDef['bot'] = 'neutral') => {
    let value: unknown = d;
    for (const segment of path) {
      if (value == null || typeof value !== 'object') return;
      value = (value as Record<string | number, unknown>)[segment];
    }
    if (value !== undefined && (typeof value !== 'object' || Array.isArray(value))) addField(fields, seen, path, label, value, bot);
  };

  switch (sec.type) {
    case 'Intro':
      add(['bot1_text'], 'Mason', 'entertainer');
      add(['bot2_text'], 'Westy', 'analyst');
      break;
    case 'FinalWord':
    case 'SpotlightTeam':
    case 'Blurt':
      add(['team'], 'Spotlight Team');
      add(['bot1'], 'Mason', 'entertainer');
      add(['bot2'], 'Westy', 'analyst');
      break;
    case 'PowerRankings':
      add(['bot1_intro'], 'Mason Introduction', 'entertainer');
      add(['bot2_intro'], 'Westy Introduction', 'analyst');
      if (Array.isArray(d.rankings)) {
        d.rankings.forEach((ranking: Record<string, unknown>, index: number) => {
          const team = String(ranking.team ?? `Team ${index + 1}`);
          add(['rankings', index, 'rank'], `${team} — Rank`);
          add(['rankings', index, 'team'], `${team} — Team`);
          add(['rankings', index, 'record'], `${team} — Record`);
          add(['rankings', index, 'pointsFor'], `${team} — Points For`);
          add(['rankings', index, 'trend'], `${team} — Trend`);
          add(['rankings', index, 'trendAmount'], `${team} — Trend Amount`);
          add(['rankings', index, 'bot1_blurb'], `${team} — Mason`, 'entertainer');
          add(['rankings', index, 'bot2_blurb'], `${team} — Westy`, 'analyst');
        });
      }
      break;
    case 'Forecast':
      add(['bot1_matchup_of_the_week'], 'Mason Matchup of the Week', 'entertainer');
      add(['bot2_matchup_of_the_week'], 'Westy Matchup of the Week', 'analyst');
      add(['bot1_bold_player'], 'Mason Bold Player', 'entertainer');
      add(['bot2_bold_player'], 'Westy Bold Player', 'analyst');
      if (Array.isArray(d.picks)) {
        d.picks.forEach((pick: Record<string, unknown>, index: number) => {
          const matchup = `${pick.team1 ?? 'Team 1'} vs ${pick.team2 ?? 'Team 2'}`;
          for (const key of ['team1', 'team2', 'bot1_pick', 'bot2_pick', 'confidence_bot1', 'confidence_bot2', 'est_bot1', 'est_bot2', 'note_bot1', 'note_bot2', 'upset_bot1', 'upset_bot2']) {
            const bot = personaForKey(key);
            add(['picks', index, key], `${matchup} — ${titleCase(key)}`, bot);
          }
        });
      }
      break;
    case 'Trades':
      if (Array.isArray(d)) {
        d.forEach((trade: Record<string, unknown>, tradeIndex: number) => {
          const teams = trade.teams && typeof trade.teams === 'object' ? Object.keys(trade.teams as Record<string, unknown>) : [];
          const tradeLabel = teams.length ? teams.join(' / ') : `Trade ${tradeIndex + 1}`;
          add([tradeIndex, 'context'], `${tradeLabel} — Context`);
          add([tradeIndex, 'debate_line'], `${tradeLabel} — Debate Line`);
          const analysis = trade.analysis as Record<string, Record<string, unknown>> | undefined;
          if (analysis) {
            Object.entries(analysis).forEach(([team, result]) => {
              for (const key of ['entertainer_grade', 'analyst_grade', 'grade', 'deltaText', 'entertainer_paragraph', 'analyst_paragraph']) {
                if (result[key] !== undefined) add([tradeIndex, 'analysis', team, key], `${tradeLabel} — ${team} — ${titleCase(key)}`, personaForKey(key));
              }
            });
          }
        });
      }
      break;
    case 'MatchupRecaps':
      if (Array.isArray(d)) {
        d.forEach((recap: Record<string, unknown>, index: number) => {
          const matchup = `${recap.winner ?? 'Winner'} vs ${recap.loser ?? 'Loser'}`;
          for (const key of ['winner', 'loser', 'winner_score', 'loser_score', 'bracketLabel', 'bot1', 'bot2']) {
            if (recap[key] !== undefined) add([index, key], `${matchup} — ${titleCase(key)}`, personaForKey(key));
          }
          if (Array.isArray(recap.dialogue)) {
            recap.dialogue.forEach((exchange: Record<string, unknown>, exchangeIndex: number) => {
              add([index, 'dialogue', exchangeIndex, 'text'], `${matchup} — Exchange ${exchangeIndex + 1}`, exchange.speaker === 'analyst' ? 'analyst' : 'entertainer');
            });
          }
        });
      }
      break;
    case 'WaiversAndFA':
      if (Array.isArray(d)) {
        d.forEach((item: Record<string, unknown>, index: number) => {
          const label = String(item.player ?? `Waiver ${index + 1}`);
          for (const key of ['player', 'team', 'faab_spent', 'coverage_level', 'reasons', 'bot1', 'bot2']) {
            if (item[key] !== undefined) add([index, key], `${label} — ${titleCase(key)}`, personaForKey(key));
          }
        });
      }
      break;
    case 'DraftGrades':
      if (Array.isArray(d.grades)) {
        d.grades.forEach((grade: Record<string, unknown>, index: number) => {
          const label = String(grade.team ?? `Team ${index + 1}`);
          for (const key of ['team', 'grade', 'bot1_analysis', 'bot2_analysis']) {
            if (grade[key] !== undefined) add(['grades', index, key], `${label} — ${titleCase(key)}`, personaForKey(key));
          }
        });
      }
      add(['bot1_summary'], 'Mason Summary', 'entertainer');
      add(['bot2_summary'], 'Westy Summary', 'analyst');
      break;
    case 'MockDraft':
      add(['mason_intro'], 'Mason Introduction', 'entertainer');
      add(['westy_intro'], 'Westy Introduction', 'analyst');
      if (Array.isArray(d.picks)) {
        d.picks.forEach((pick: Record<string, unknown>, index: number) => {
          const label = `Pick ${pick.overall ?? index + 1}`;
          add(['picks', index, 'player'], `${label} — Player`);
          add(['picks', index, 'team'], `${label} — Team`);
          add(['picks', index, 'mason', 'analysis'], `${label} — Mason`, 'entertainer');
          add(['picks', index, 'westy', 'analysis'], `${label} — Westy`, 'analyst');
        });
      }
      break;
    case 'ClancyInsert':
      add(['label'], 'Clancy Label');
      add(['text'], 'Clancy Text');
      add(['teams'], 'Teams Referenced');
      break;
    default:
      break;
  }
}

const SKIP_KEYS = new Set([
  'id', 'event_id', 'matchup_id', 'trade_id', 'saved_at', 'generatedAt', 'generated_at', 'createdAt', 'created_at',
  'publishedAt', 'published_at', 'updatedAt', 'updated_at', 'url', 'playerId', 'player_id', 'runId', 'run_id',
]);

function walkFallback(
  value: unknown,
  path: Array<string | number>,
  labels: string[],
  fields: EditableFieldDef[],
  seen: Set<string>,
  inheritedBot: EditableFieldDef['bot'] = 'neutral',
  depth = 0,
): void {
  if (depth > 7 || value == null) return;
  const lastKey = String(path[path.length - 1] ?? '');
  const bot = personaForKey(lastKey, inheritedBot);

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || (Array.isArray(value) && value.every(item => typeof item === 'string'))) {
    if (!SKIP_KEYS.has(lastKey) && !lastKey.startsWith('_')) {
      addField(fields, seen, path, labels.join(' — '), value, bot);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const itemLabel = typeof entry === 'object' && entry !== null
        ? String((entry as Record<string, unknown>).team ?? (entry as Record<string, unknown>).player ?? (entry as Record<string, unknown>).subject ?? `Item ${index + 1}`)
        : `Item ${index + 1}`;
      walkFallback(entry, [...path, index], [...labels, itemLabel], fields, seen, bot, depth + 1);
    });
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      if (SKIP_KEYS.has(key) || key.startsWith('_')) return;
      walkFallback(child, [...path, key], [...labels, titleCase(key)], fields, seen, personaForKey(key, bot), depth + 1);
    });
  }
}

export function getEditableFields(sec: EditableSection): EditableFieldDef[] {
  const fields: EditableFieldDef[] = [];
  const seen = new Set<string>();
  if (sec.data == null) return fields;
  addKnownFields(sec, fields, seen);
  walkFallback(sec.data, [], [titleCase(sec.type)], fields, seen);
  return fields;
}

export function getTradeGradeFields(sec: EditableSection): Array<{ fieldPath: string; label: string; current: string }> {
  return getEditableFields(sec)
    .filter(field => field.kind === 'select' && field.options?.some(option => option.value === 'A+'))
    .map(field => {
      const segments = field.fieldPath.startsWith('[') ? JSON.parse(field.fieldPath) as Array<string | number> : field.fieldPath.split('.');
      let value: unknown = sec.data;
      for (const segment of segments) {
        if (value == null || typeof value !== 'object') break;
        value = (value as Record<string | number, unknown>)[segment];
      }
      return { fieldPath: field.fieldPath, label: field.label, current: String(value ?? '') };
    });
}
