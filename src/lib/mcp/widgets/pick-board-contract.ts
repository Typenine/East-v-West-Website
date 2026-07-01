export const PICK_BOARD_WIDGET_URI = 'ui://widget/pick-board-v1.html';

const nullableIntegerSchema = {
  anyOf: [{ type: 'integer' }, { type: 'null' }],
} as const;

const pickSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    season: { type: 'string' },
    round: { type: 'integer' },
    originalTeam: { type: 'string' },
    currentOwner: { type: 'string' },
    traded: { type: 'boolean' },
    display: { type: 'string' },
  },
  required: ['season', 'round', 'originalTeam', 'currentOwner', 'traded', 'display'],
} as const;

export const PICK_BOARD_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    warnings: { type: 'array', items: { type: 'string' } },
    data: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fetchedAt: { type: 'string' },
        source: { type: 'string' },
        cacheStatus: { type: 'string' },
        leagueNote: { type: 'string' },
        board: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              teamName: { type: 'string' },
              rosterId: nullableIntegerSchema,
              picks: { type: 'array', items: pickSchema },
              totalPicks: { type: 'integer' },
              firstRoundPicks: { type: 'integer' },
              tradedPicksOwned: { type: 'integer' },
            },
            required: ['teamName', 'rosterId', 'picks', 'totalPicks', 'firstRoundPicks', 'tradedPicksOwned'],
          },
        },
      },
      required: ['fetchedAt', 'source', 'cacheStatus', 'leagueNote', 'board'],
    },
  },
  required: ['ok', 'data'],
} as const;

export const PICK_BOARD_TOOL_META = {
  'openai/outputTemplate': PICK_BOARD_WIDGET_URI,
  ui: { resourceUri: PICK_BOARD_WIDGET_URI },
} as const;

export const PICK_BOARD_RESOURCE_META = {
  ui: { prefersBorder: true },
  'openai/widgetDescription': 'East v. West Future Pick Board — future draft-pick ownership by team.',
} as const;
