/**
 * Enumerates the editable text fields of each newsletter section.
 *
 * Shared by the Edit Mode UI (to render textareas) and the edit API's
 * consistency sweep (to build the digest of all current text). Pure module —
 * no React, no I/O.
 */

import { joinFieldPath } from './field-path';

export interface EditableFieldDef {
  fieldPath: string;
  label: string;
  bot: 'entertainer' | 'analyst';
}

export interface EditableSection {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export function getEditableFields(sec: EditableSection): EditableFieldDef[] {
  const fields: EditableFieldDef[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = sec.data as any;
  if (!d) return fields;

  switch (sec.type) {
    case 'Intro':
      fields.push({ fieldPath: 'bot1_text', label: '🎙️ Mason', bot: 'entertainer' });
      fields.push({ fieldPath: 'bot2_text', label: '📊 Westy', bot: 'analyst' });
      break;
    case 'FinalWord':
    case 'SpotlightTeam':
    case 'Blurt':
      fields.push({ fieldPath: 'bot1', label: '🎙️ Mason', bot: 'entertainer' });
      fields.push({ fieldPath: 'bot2', label: '📊 Westy', bot: 'analyst' });
      break;
    case 'MockDraft':
      if (d.mason_intro) fields.push({ fieldPath: 'mason_intro', label: '🎙️ Mason Intro', bot: 'entertainer' });
      if (d.westy_intro) fields.push({ fieldPath: 'westy_intro', label: '📊 Westy Intro', bot: 'analyst' });
      if (Array.isArray(d.picks)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.picks as Array<any>).forEach((pick: Record<string, unknown>, i: number) => {
          const lbl = `Pick ${(pick.overall as number) ?? i + 1}`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((pick.mason as any)?.analysis !== undefined)
            fields.push({ fieldPath: `picks.${i}.mason.analysis`, label: `🎙️ ${lbl} — Mason`, bot: 'entertainer' });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((pick.westy as any)?.analysis !== undefined)
            fields.push({ fieldPath: `picks.${i}.westy.analysis`, label: `📊 ${lbl} — Westy`, bot: 'analyst' });
        });
      }
      break;
    case 'Trades':
      if (Array.isArray(d)) {
        (d as Array<Record<string, unknown>>).forEach((trade, i) => {
          // Use team names from the `teams` map if available, else fall back to context
          const teamsMap = trade.teams as Record<string, unknown> | null | undefined;
          const teamNames = teamsMap ? Object.keys(teamsMap).join(' / ') : null;
          const tLabel = `Trade ${i + 1}${teamNames ? ` — ${teamNames}` : trade.context ? ` — ${String(trade.context).slice(0, 40)}` : ''}`;
          const analysis = trade.analysis as Record<string, Record<string, string>> | undefined;
          if (analysis) {
            // Team names can contain dots ("Mt. Lebanon Cake Eaters") — joinFieldPath
            // switches to JSON-array encoding so the segment survives intact.
            Object.entries(analysis).forEach(([teamKey, ta]) => {
              if (ta.entertainer_paragraph !== undefined)
                fields.push({ fieldPath: joinFieldPath([i, 'analysis', teamKey, 'entertainer_paragraph']), label: `🎙️ ${tLabel} [${teamKey}]`, bot: 'entertainer' });
              if (ta.analyst_paragraph !== undefined)
                fields.push({ fieldPath: joinFieldPath([i, 'analysis', teamKey, 'analyst_paragraph']), label: `📊 ${tLabel} [${teamKey}]`, bot: 'analyst' });
            });
          }
        });
      }
      break;
    case 'MatchupRecaps':
      if (Array.isArray(d)) {
        (d as Array<Record<string, unknown>>).forEach((recap, i) => {
          const rLabel = `Recap ${i + 1}${recap.winner ? ` — ${recap.winner} vs ${recap.loser}` : ''}`;
          if (recap.bot1 !== undefined)
            fields.push({ fieldPath: `${i}.bot1`, label: `🎙️ ${rLabel} — Mason`, bot: 'entertainer' });
          if (recap.bot2 !== undefined)
            fields.push({ fieldPath: `${i}.bot2`, label: `📊 ${rLabel} — Westy`, bot: 'analyst' });
          // Dialogue exchanges
          if (Array.isArray(recap.dialogue)) {
            (recap.dialogue as Array<Record<string, unknown>>).forEach((ex, j) => {
              const spk = ex.speaker === 'entertainer' ? '🎙️ Mason' : '📊 Westy';
              fields.push({
                fieldPath: `${i}.dialogue.${j}.text`,
                label: `${spk} (Recap ${i + 1} exchange ${j + 1})`,
                bot: ex.speaker === 'entertainer' ? 'entertainer' : 'analyst',
              });
            });
          }
        });
      }
      break;
    case 'WaiversAndFA':
      if (Array.isArray(d)) {
        (d as Array<Record<string, unknown>>).forEach((item, i) => {
          const wLabel = `Waiver ${i + 1}${item.player ? ` — ${item.player}` : ''}`;
          if (item.bot1 !== undefined)
            fields.push({ fieldPath: `${i}.bot1`, label: `🎙️ ${wLabel} — Mason`, bot: 'entertainer' });
          if (item.bot2 !== undefined)
            fields.push({ fieldPath: `${i}.bot2`, label: `📊 ${wLabel} — Westy`, bot: 'analyst' });
        });
      }
      break;
    case 'DraftGrades':
      if (Array.isArray(d?.grades)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.grades as Array<any>).forEach((g: Record<string, unknown>, i: number) => {
          const gLabel = `${g.team ?? `Team ${i + 1}`} (${g.grade ?? '?'})`;
          if (g.bot1_analysis !== undefined)
            fields.push({ fieldPath: `grades.${i}.bot1_analysis`, label: `🎙️ ${gLabel} — Mason`, bot: 'entertainer' });
          if (g.bot2_analysis !== undefined)
            fields.push({ fieldPath: `grades.${i}.bot2_analysis`, label: `📊 ${gLabel} — Westy`, bot: 'analyst' });
        });
        if (d.bot1_summary !== undefined) fields.push({ fieldPath: 'bot1_summary', label: '🎙️ Mason Summary', bot: 'entertainer' });
        if (d.bot2_summary !== undefined) fields.push({ fieldPath: 'bot2_summary', label: '📊 Westy Summary', bot: 'analyst' });
      }
      break;
    default: {
      const keyMap: Array<[string, string, 'entertainer' | 'analyst']> = [
        ['bot1_text', '🎙️ Mason', 'entertainer'], ['bot2_text', '📊 Westy', 'analyst'],
        ['bot1', '🎙️ Mason', 'entertainer'], ['bot2', '📊 Westy', 'analyst'],
        ['mason_intro', '🎙️ Mason Intro', 'entertainer'], ['westy_intro', '📊 Westy Intro', 'analyst'],
        ['bot1_summary', '🎙️ Mason Summary', 'entertainer'], ['bot2_summary', '📊 Westy Summary', 'analyst'],
        ['bot1_analysis', '🎙️ Mason Analysis', 'entertainer'], ['bot2_analysis', '📊 Westy Analysis', 'analyst'],
        ['bot1_preview', '🎙️ Mason Preview', 'entertainer'], ['bot2_preview', '📊 Westy Preview', 'analyst'],
        ['bot1_coronation', '🎙️ Mason', 'entertainer'], ['bot2_coronation', '📊 Westy', 'analyst'],
        ['bot1_finalThoughts', '🎙️ Mason Final Thoughts', 'entertainer'], ['bot2_finalThoughts', '📊 Westy Final Thoughts', 'analyst'],
        ['entertainer_commentary', '🎙️ Mason Commentary', 'entertainer'], ['analyst_commentary', '📊 Westy Commentary', 'analyst'],
      ];
      for (const [key, label, bot] of keyMap) {
        if (typeof d[key] === 'string' && d[key]) fields.push({ fieldPath: key, label, bot });
      }
      break;
    }
  }
  return fields;
}

/**
 * Trade grade fields (letter grades) for the consistency sweep — grades are
 * not free-text fields in the editor, but a factual correction to a trade
 * write-up can invalidate them, so the sweep may propose new values.
 */
export function getTradeGradeFields(sec: EditableSection): Array<{ fieldPath: string; label: string; current: string }> {
  const out: Array<{ fieldPath: string; label: string; current: string }> = [];
  if (sec.type !== 'Trades' || !Array.isArray(sec.data)) return out;
  (sec.data as Array<Record<string, unknown>>).forEach((trade, i) => {
    const analysis = trade.analysis as Record<string, Record<string, string>> | undefined;
    if (!analysis) return;
    Object.entries(analysis).forEach(([teamKey, ta]) => {
      for (const gradeKey of ['entertainer_grade', 'analyst_grade'] as const) {
        const v = ta[gradeKey];
        if (typeof v === 'string' && /^[A-F][+-]?$/i.test(v.trim())) {
          out.push({
            fieldPath: joinFieldPath([i, 'analysis', teamKey, gradeKey]),
            label: `Trade ${i + 1} [${teamKey}] ${gradeKey === 'entertainer_grade' ? 'Mason' : 'Westy'} grade`,
            current: v,
          });
        }
      }
    });
  });
  return out;
}
