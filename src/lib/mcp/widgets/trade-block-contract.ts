export const TRADE_BLOCK_WIDGET_URI = 'ui://widget/trade-block-v1.html';

const nullableStringSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

const playerAssetSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['player'] },
    playerId: { type: 'string' },
    name: { type: 'string' },
    position: nullableStringSchema,
    nflTeam: nullableStringSchema,
    injuryStatus: nullableStringSchema,
  },
  required: ['type', 'playerId', 'name', 'position', 'nflTeam', 'injuryStatus'],
} as const;

const pickAssetSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['pick'] },
    display: { type: 'string' },
    year: { type: 'integer' },
    round: { type: 'integer' },
    originalTeam: nullableStringSchema,
  },
  required: ['type', 'display', 'year', 'round', 'originalTeam'],
} as const;

const faabAssetSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['faab'] },
    display: { type: 'string' },
  },
  required: ['type', 'display'],
} as const;

export const TRADE_BLOCK_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fetchedAt: { type: 'string' },
        source: { type: 'string' },
        teamFilter: nullableStringSchema,
        teamsWithAssets: { type: 'integer' },
        teams: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              team: { type: 'string' },
              assets: { type: 'array', items: { anyOf: [playerAssetSchema, pickAssetSchema, faabAssetSchema] } },
              assetCount: { type: 'integer' },
              wants: nullableStringSchema,
              wantedPositions: { type: 'array', items: { type: 'string' } },
              updatedAt: nullableStringSchema,
            },
            required: ['team', 'assets', 'assetCount', 'wants', 'wantedPositions', 'updatedAt'],
          },
        },
      },
      required: ['fetchedAt', 'source', 'teamFilter', 'teamsWithAssets', 'teams'],
    },
  },
  required: ['ok', 'data'],
} as const;

export const TRADE_BLOCK_TOOL_META = {
  'openai/outputTemplate': TRADE_BLOCK_WIDGET_URI,
  ui: { resourceUri: TRADE_BLOCK_WIDGET_URI },
} as const;

export const TRADE_BLOCK_RESOURCE_META = {
  ui: { prefersBorder: true },
  'openai/widgetDescription': 'East v. West Trade Block — players, picks, and FAAB currently available by team.',
} as const;
