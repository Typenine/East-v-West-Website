export const ROSTER_STRENGTH_WIDGET_URI = 'ui://widget/roster-strength-v1.html';
const ROSTER_STRENGTH_BASE_URL = 'https://east-v-west-website.vercel.app';
const nullableStringSchema = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const nullableNumberSchema = { anyOf: [{ type: 'number' }, { type: 'null' }] } as const;
const nullableIntegerSchema = { anyOf: [{ type: 'integer' }, { type: 'null' }] } as const;
const positionSummarySchema = {
  type: 'object', additionalProperties: false,
  properties: { count: { type: 'integer' }, totalValue: { type: 'number' }, topPlayer: nullableStringSchema },
  required: ['count', 'totalValue', 'topPlayer'],
} as const;
const positionPlayerSchema = {
  type: 'object', additionalProperties: false,
  properties: { name: { type: 'string' }, value: nullableNumberSchema, rank: nullableIntegerSchema, trend: nullableNumberSchema, nflTeam: nullableStringSchema },
  required: ['name', 'value', 'rank', 'trend', 'nflTeam'],
} as const;
export const ROSTER_STRENGTH_OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    data: {
      type: 'object', additionalProperties: false,
      properties: {
        fetchedAt: { type: 'string' }, source: { type: 'string' }, teamName: { type: 'string' }, totalDynastyValue: { type: 'number' },
        positionSummary: { type: 'object', additionalProperties: false, properties: { QB: positionSummarySchema, RB: positionSummarySchema, WR: positionSummarySchema, TE: positionSummarySchema }, required: ['QB', 'RB', 'WR', 'TE'] },
        positions: { type: 'object', additionalProperties: false, properties: { QB: { type: 'array', items: positionPlayerSchema }, RB: { type: 'array', items: positionPlayerSchema }, WR: { type: 'array', items: positionPlayerSchema }, TE: { type: 'array', items: positionPlayerSchema } } },
        strengths: { type: 'array', items: { type: 'string' } }, weaknesses: { type: 'array', items: { type: 'string' } }, valuesAvailable: { type: 'boolean' },
      },
      required: ['fetchedAt', 'source', 'teamName', 'totalDynastyValue', 'positionSummary', 'positions', 'strengths', 'weaknesses', 'valuesAvailable'],
    },
  },
  required: ['ok', 'data'],
} as const;
export const ROSTER_STRENGTH_TOOL_META = { 'openai/outputTemplate': ROSTER_STRENGTH_WIDGET_URI, ui: { resourceUri: ROSTER_STRENGTH_WIDGET_URI } } as const;
export const ROSTER_STRENGTH_RESOURCE_META = {
  ui: { prefersBorder: true, domain: ROSTER_STRENGTH_BASE_URL, csp: { resourceDomains: [ROSTER_STRENGTH_BASE_URL] } },
  'openai/widgetDescription': 'East v. West Roster Strength — dynasty value by position with strengths and weaknesses.',
} as const;
