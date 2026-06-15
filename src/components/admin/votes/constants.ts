export const VOTE_TYPE_LABELS: Record<string, string> = {
  borda: 'Ranked – Borda Count',
  irv: 'Ranked – IRV',
  select_one: 'Pick One',
  select_multi: 'Pick Multiple',
  eliminate: 'Vote to Eliminate',
  yes_no: 'Yes / No',
};

export const THRESHOLD_LABELS: Record<string, string> = {
  plurality: 'Plurality (most votes wins)',
  majority: 'Majority (7 team / 8 person)',
  supermajority: 'Supermajority (9 team)',
  admin_defined: 'Custom number',
};

/** Google Forms–style question types (+ league-only formal rounds). */
export const POLL_QUESTION_TYPES = [
  { value: 'yes_no', label: 'Yes / No', hint: 'Agree or disagree', group: 'Choice' },
  { value: 'multiple_choice', label: 'Multiple choice', hint: 'Pick one (radio buttons)', group: 'Choice' },
  { value: 'dropdown', label: 'Dropdown', hint: 'Pick one from a menu', group: 'Choice' },
  { value: 'checkboxes', label: 'Checkboxes', hint: 'Pick any that apply', group: 'Choice' },
  { value: 'multiple_choice_grid', label: 'Multiple-choice grid', hint: 'One choice per row', group: 'Grid' },
  { value: 'checkbox_grid', label: 'Checkbox grid', hint: 'Multiple choices per row', group: 'Grid' },
  { value: 'file_upload', label: 'File upload', hint: 'Upload a document or image', group: 'Media' },
  { value: 'short_answer', label: 'Short answer', hint: 'One line of text', group: 'Text' },
  { value: 'paragraph', label: 'Paragraph', hint: 'Long text response', group: 'Text' },
  { value: 'number', label: 'Number', hint: 'Numeric answer', group: 'Text' },
  { value: 'email', label: 'Email', hint: 'Email address', group: 'Text' },
  { value: 'date', label: 'Date', hint: 'Calendar date', group: 'Text' },
  { value: 'time', label: 'Time', hint: 'Time of day', group: 'Text' },
  { value: 'rating', label: 'Linear scale', hint: 'Rating (e.g. 1–5 or 1–10)', group: 'Scale' },
  { value: 'section_break', label: 'Section header', hint: 'Divide the form into sections', group: 'Layout' },
] as const;

export const LEAGUE_EXTRA_FEATURES = [
  'Formal IRV / Borda / multi-round elimination ballots',
  'One vote per team or per person',
  'Anonymous results & commissioner-controlled publishing',
  'Discord notifications when polls open',
  'Link polls to league suggestions',
] as const;
