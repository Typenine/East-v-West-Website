export const TEAM_COMPARE_WIDGET_URI = 'ui://widget/team-compare-v1.html';

const TEAM_COMPARE_BASE_URL = 'https://east-v-west-website.vercel.app';

const nullableStringSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

const playerSnapSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    playerId: { type: 'string' },
    playerName: { type: 'string' },
    position: nullableStringSchema,
    nflTeam: nullableStringSchema,
    injuryStatus: nullableStringSchema,
    slot: { type: 'string', enum: ['active', 'ir', 'taxi'] },
  },
  required: ['playerId', 'playerName', 'position', 'nflTeam', 'injuryStatus', 'slot'],
} as const;

const snapshotSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    teamName: { type: 'string' },
    rosterId: { type: 'integer' },
    logoUrl: { type: 'string' },
    currentSeason: {
      type: 'object',
      additionalProperties: false,
      properties: {
        season: { type: 'string' },
        wins: { type: 'integer' },
        losses: { type: 'integer' },
        ties: { type: 'integer' },
        pf: { type: 'number' },
        pa: { type: 'number' },
      },
      required: ['season', 'wins', 'losses', 'ties', 'pf', 'pa'],
    },
    allTimeStats: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            regularSeason: {
              type: 'object',
              additionalProperties: false,
              properties: { wins: { type: 'integer' }, losses: { type: 'integer' } },
              required: ['wins', 'losses'],
            },
            playoffs: {
              type: 'object',
              additionalProperties: false,
              properties: { wins: { type: 'integer' }, losses: { type: 'integer' } },
              required: ['wins', 'losses'],
            },
          },
          required: ['regularSeason', 'playoffs'],
        },
        { type: 'null' },
      ],
    },
    championships: { type: 'integer' },
    championshipHistory: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { year: { type: 'integer' }, finish: { type: 'string' } },
        required: ['year', 'finish'],
      },
    },
    positionRooms: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
    },
    roster: {
      type: 'object',
      additionalProperties: false,
      properties: {
        active: { type: 'array', items: playerSnapSchema },
        ir: { type: 'array', items: playerSnapSchema },
        taxi: { type: 'array', items: playerSnapSchema },
      },
      required: ['active', 'ir', 'taxi'],
    },
  },
  required: ['teamName', 'rosterId', 'logoUrl', 'currentSeason', 'allTimeStats', 'championships', 'championshipHistory', 'positionRooms', 'roster'],
} as const;

export const TEAM_COMPARE_OUTPUT_SCHEMA = {
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
        team1: snapshotSchema,
        team2: snapshotSchema,
      },
      required: ['fetchedAt', 'source', 'team1', 'team2'],
    },
  },
  required: ['ok', 'data'],
} as const;

export const TEAM_COMPARE_TOOL_META = {
  'openai/outputTemplate': TEAM_COMPARE_WIDGET_URI,
  ui: { resourceUri: TEAM_COMPARE_WIDGET_URI },
} as const;

export const TEAM_COMPARE_RESOURCE_META = {
  ui: {
    prefersBorder: true,
    domain: TEAM_COMPARE_BASE_URL,
    csp: {
      resourceDomains: [TEAM_COMPARE_BASE_URL],
    },
  },
  'openai/widgetDescription': 'East v. West Team Compare — head-to-head record, roster, and championship comparison for two teams.',
} as const;
