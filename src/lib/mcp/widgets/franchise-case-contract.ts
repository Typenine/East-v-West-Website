export const FRANCHISE_CASE_WIDGET_URI = 'ui://widget/franchise-case-v1.html';
const FRANCHISE_CASE_BASE_URL = 'https://east-v-west-website.vercel.app';
const nullableStringSchema = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
export const FRANCHISE_CASE_OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    meta: {
      type: 'object', additionalProperties: false,
      properties: { tool: { type: 'string' }, source: { type: 'string' }, fetchedAt: { type: 'string' }, teamCount: { type: 'integer' }, teamFilter: nullableStringSchema },
      required: ['tool', 'source', 'fetchedAt', 'teamCount', 'teamFilter'],
    },
    franchises: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          team: { type: 'string' },
          regularSeason: {
            type: 'object', additionalProperties: false,
            properties: { wins: { type: 'integer' }, losses: { type: 'integer' }, ties: { type: 'integer' }, winPct: { type: 'number' }, pf: { type: 'number' }, pa: { type: 'number' }, avgPf: { type: 'number' } },
            required: ['wins', 'losses', 'ties', 'winPct', 'pf', 'pa', 'avgPf'],
          },
          playoffs: {
            type: 'object', additionalProperties: false,
            properties: { wins: { type: 'integer' }, losses: { type: 'integer' }, winPct: { type: 'number' } },
            required: ['wins', 'losses', 'winPct'],
          },
          championships: { type: 'integer' }, runnerUps: { type: 'integer' },
        },
        required: ['team', 'regularSeason', 'playoffs', 'championships', 'runnerUps'],
      },
    },
  },
  required: ['meta', 'franchises'],
} as const;
export const FRANCHISE_CASE_TOOL_META = { 'openai/outputTemplate': FRANCHISE_CASE_WIDGET_URI, ui: { resourceUri: FRANCHISE_CASE_WIDGET_URI } } as const;
export const FRANCHISE_CASE_RESOURCE_META = {
  ui: { prefersBorder: true, domain: FRANCHISE_CASE_BASE_URL, csp: { resourceDomains: [FRANCHISE_CASE_BASE_URL] } },
  'openai/widgetDescription': 'East v. West Franchise Trophy Case — all-time records and championship history, ranked.',
} as const;
