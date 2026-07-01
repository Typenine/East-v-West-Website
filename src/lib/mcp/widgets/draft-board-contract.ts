export const DRAFT_BOARD_WIDGET_URI = 'ui://widget/draft-board-v1.html';

const nullableStringSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

const pickRowSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    season: { type: 'string' },
    round: { type: 'integer' },
    pick: { type: 'integer' },
    team: { type: 'string' },
    player: nullableStringSchema,
    position: nullableStringSchema,
  },
  required: ['season', 'round', 'pick', 'team', 'player', 'position'],
} as const;

const futurePickRowSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    season: { type: 'string' },
    round: { type: 'integer' },
    originalTeam: { type: 'string' },
    currentOwner: { type: 'string' },
    traded: { type: 'boolean' },
  },
  required: ['season', 'round', 'originalTeam', 'currentOwner', 'traded'],
} as const;

export const DRAFT_BOARD_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    meta: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tool: { type: 'string' },
        source: { type: 'string' },
        fetchedAt: { type: 'string' },
        seasonsQueried: { type: 'array', items: { type: 'string' } },
        filters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            season: nullableStringSchema,
            team: nullableStringSchema,
          },
          required: ['season', 'team'],
        },
      },
      required: ['tool', 'source', 'fetchedAt', 'seasonsQueried', 'filters'],
    },
    historicalPicks: {
      type: 'object',
      additionalProperties: { type: 'array', items: pickRowSchema },
    },
    futurePickOwnership: { type: 'array', items: futurePickRowSchema },
  },
  required: ['meta', 'historicalPicks', 'futurePickOwnership'],
} as const;

export const DRAFT_BOARD_TOOL_META = {
  'openai/outputTemplate': DRAFT_BOARD_WIDGET_URI,
  ui: { resourceUri: DRAFT_BOARD_WIDGET_URI },
} as const;

export const DRAFT_BOARD_RESOURCE_META = {
  ui: { prefersBorder: true },
  'openai/widgetDescription': 'East v. West Draft Board — round-by-round draft results by season.',
} as const;
