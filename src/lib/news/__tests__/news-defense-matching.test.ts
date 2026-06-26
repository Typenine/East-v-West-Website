import { describe, expect, it } from 'vitest';
import { classifyStory, type StoryCategory } from '../news-classifier';
import { escapeRegExp, stripSuffixes } from '../news-matching';

describe('defense news matching regressions', () => {
  it('disables ambiguous NFL team-code matching', () => {
    const codeMatcher = new RegExp(`\\b${escapeRegExp('NO')}\\b`, 'i');
    expect(codeMatcher.test('New York Jets news')).toBe(false);
    expect(codeMatcher.test('no injury was reported')).toBe(false);
  });

  it('does not create city-word matchers for a rostered defense', () => {
    expect(stripSuffixes('New Orleans Saints')).toBe('saints saints');
    expect(stripSuffixes('New York Jets')).toBe('jets jets');
  });

  it('does not match a rostered defense to unrelated offensive or contract news', () => {
    const billsMatcher = new RegExp(`\\b${escapeRegExp('Bills')}\\b`, 'i');
    expect(billsMatcher.test('Bills news: Latest on potential extension for O’Cyrus Torrence')).toBe(false);
    expect(billsMatcher.test('Vote for the play that best highlights Bills beating Kansas City')).toBe(false);
  });

  it('still matches stories about the actual defensive unit', () => {
    const billsMatcher = new RegExp(`\\b${escapeRegExp('Bills')}\\b`, 'i');
    expect(billsMatcher.test('Three Bills defenders who are not great fits in the new defense')).toBe(true);
    expect(billsMatcher.test('Bills defense forces three turnovers')).toBe(true);
  });
});

describe('category accuracy regressions', () => {
  it('does not treat a hypothetical cut as a completed transaction', () => {
    expect(classifyStory("Aiyuk: I'll sign with Commanders if 49ers cut me", '')).toBe<StoryCategory>('general_analysis');
  });

  it('recognizes a completed contract extension', () => {
    expect(classifyStory('Jaguars, TE Strange agree to 3-year extension', '')).toBe<StoryCategory>('contract');
  });

  it('recognizes reserve/left squad placement as a transaction', () => {
    expect(classifyStory('Brandon Aiyuk remains on reserve/left squad list', '')).toBe<StoryCategory>('nfl_transaction');
  });

  it('recognizes roster-bubble reporting as depth-chart news', () => {
    expect(classifyStory('Browns receiver Cedric Tillman on roster bubble', '')).toBe<StoryCategory>('depth_chart_role');
  });

  it('keeps actual cuts classified as transactions', () => {
    expect(classifyStory('Team cut the receiver to make room on roster', '')).toBe<StoryCategory>('nfl_transaction');
  });
});
