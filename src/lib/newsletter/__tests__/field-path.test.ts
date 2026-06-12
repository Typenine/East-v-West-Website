/**
 * Regression tests for field-path + editable-fields helpers.
 *
 * Covers the dotted-team-name bug: "Mt. Lebanon Cake Eaters" as an analysis
 * key broke dot-split paths — reads returned empty text (blank Edit Mode
 * textareas) and writes corrupted the Trades section (which then rendered as
 * "[Section unavailable]").
 *
 * Pure functions only — no I/O, no LLM calls, no DB.
 * Run with: npx vitest run src/lib/newsletter/__tests__/field-path.test.ts
 */

import { describe, it, expect } from 'vitest';
import { joinFieldPath, splitFieldPath, getValueAtPath, setValueAtPath } from '../field-path';
import { getEditableFields, getTradeGradeFields } from '../editable-fields';

const DOTTED_TEAM = 'Mt. Lebanon Cake Eaters';

function makeTradesSection() {
  return {
    type: 'Trades',
    data: [
      {
        context: '2026 Offseason Trades',
        teams: null,
        analysis: {
          'League Overview': {
            grade: 'B', entertainer_grade: '–', analyst_grade: '–',
            entertainer_paragraph: 'Mason overview.', analyst_paragraph: 'Westy overview.',
          },
          [DOTTED_TEAM]: {
            grade: 'B', entertainer_grade: 'B+', analyst_grade: 'B-',
            entertainer_paragraph: 'Mason on the Cake Eaters.',
            analyst_paragraph: 'Westy on the Cake Eaters.',
          },
        },
      },
    ],
  };
}

describe('joinFieldPath / splitFieldPath', () => {
  it('uses plain dot-join when no segment contains a dot', () => {
    expect(joinFieldPath(['picks', 0, 'mason', 'analysis'])).toBe('picks.0.mason.analysis');
  });

  it('switches to JSON-array encoding when a segment contains a dot', () => {
    const path = joinFieldPath([0, 'analysis', DOTTED_TEAM, 'entertainer_paragraph']);
    expect(path.startsWith('[')).toBe(true);
    expect(splitFieldPath(path)).toEqual(['0', 'analysis', DOTTED_TEAM, 'entertainer_paragraph']);
  });

  it('still splits legacy plain paths on dots', () => {
    expect(splitFieldPath('grades.2.bot1_analysis')).toEqual(['grades', '2', 'bot1_analysis']);
  });
});

describe('getValueAtPath / setValueAtPath with dotted team names', () => {
  it('reads through a JSON-encoded path', () => {
    const sec = makeTradesSection();
    const path = joinFieldPath([0, 'analysis', DOTTED_TEAM, 'analyst_paragraph']);
    expect(getValueAtPath(sec.data, path)).toBe('Westy on the Cake Eaters.');
  });

  it('writes to the correct leaf without creating garbage keys', () => {
    const sec = makeTradesSection();
    const path = joinFieldPath([0, 'analysis', DOTTED_TEAM, 'entertainer_paragraph']);
    setValueAtPath(sec.data as unknown as Record<string, unknown>, path, 'EDITED');
    const analysis = sec.data[0].analysis as Record<string, { entertainer_paragraph?: string }>;
    expect(analysis[DOTTED_TEAM].entertainer_paragraph).toBe('EDITED');
    expect('Mt' in analysis).toBe(false);
  });

  it('reads legacy dot paths for keys without dots', () => {
    const sec = makeTradesSection();
    expect(getValueAtPath(sec.data, '0.analysis.League Overview.entertainer_paragraph')).toBe('Mason overview.');
  });
});

describe('getEditableFields — Trades with dotted team keys', () => {
  it('every exposed field path resolves to its text', () => {
    const sec = makeTradesSection();
    const fields = getEditableFields(sec);
    expect(fields).toHaveLength(4);
    for (const f of fields) {
      const v = getValueAtPath(sec.data, f.fieldPath);
      expect(typeof v, `path ${f.fieldPath} should resolve`).toBe('string');
      expect((v as string).length).toBeGreaterThan(0);
    }
  });

  it('exposes letter-grade fields for the consistency sweep', () => {
    const gradeFields = getTradeGradeFields(makeTradesSection());
    expect(gradeFields).toHaveLength(2);
    for (const g of gradeFields) {
      expect(getValueAtPath(makeTradesSection().data, g.fieldPath)).toBe(g.current);
    }
  });
});
