import { describe, expect, it } from 'vitest';
import {
  classifyStory,
  isPromotionalOrPoll,
  type StoryCategory,
} from '../news-classifier';

describe('news quality regressions', () => {
  it('filters fan-vote and promotional headlines', () => {
    expect(isPromotionalOrPoll('Vote for the play that best highlights Bills beating Kansas City', '')).toBe(true);
    expect(isPromotionalOrPoll('Poll: Choose the top play of the week', '')).toBe(true);
  });

  it('does not classify a generic headline from an unrelated trade mention in the description', () => {
    expect(
      classifyStory(
        'Vote for the play that best highlights Bills beating Kansas City',
        'Elsewhere around the league, a receiver was traded earlier this week.'
      )
    ).toBe<StoryCategory>('general_analysis');
  });

  it('lets the headline control the category instead of description boilerplate', () => {
    expect(
      classifyStory(
        'Bills beat Kansas City in overtime',
        'Related coverage includes trade rumors and contract discussion.'
      )
    ).toBe<StoryCategory>('general_analysis');
  });

  it('still uses a concise description for medical status when the headline is vague', () => {
    expect(
      classifyStory('CeeDee Lamb update', 'Lamb suffered a hamstring injury during practice.')
    ).toBe<StoryCategory>('injury');
  });

  it('recognizes completed trades directly from the headline', () => {
    expect(classifyStory('Broncos acquire WR in trade from Ravens', '')).toBe<StoryCategory>('trade');
    expect(classifyStory('Ravens trade TE to Eagles for draft picks', '')).toBe<StoryCategory>('trade');
  });
});
