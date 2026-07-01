const TEAM_CARD_BASE_URL = 'https://east-v-west-website.vercel.app';

export const TEAM_CARD_WIDGET_URI = 'ui://widget/team-card-v3.html';

const nullableStringSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

const playerSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    position: nullableStringSchema,
    nflTeam: nullableStringSchema,
    status: nullableStringSchema,
    slot: { type: 'string', enum: ['active', 'ir', 'taxi'] },
  },
  required: ['id', 'name', 'position', 'nflTeam', 'status', 'slot'],
} as const;

export const TEAM_CARD_OUTPUT_SCHEMA = {
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
        team: { type: 'string' },
        dataSource: { type: 'string' },
        cacheStatus: { type: 'string' },
      },
      required: ['tool', 'source', 'fetchedAt', 'team', 'dataSource', 'cacheStatus'],
    },
    matchResolution: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestedTeam: { type: 'string' },
        matchedTeam: { type: 'string' },
        confidence: { type: 'string', enum: ['exact', 'alias', 'partial'] },
      },
      required: ['requestedTeam', 'matchedTeam', 'confidence'],
    },
    team: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        logoUrl: { type: 'string' },
        rosterId: { type: 'integer' },
        currentRecord: {
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
                  properties: {
                    wins: { type: 'integer' },
                    losses: { type: 'integer' },
                    pf: { type: 'number' },
                    pa: { type: 'number' },
                  },
                  required: ['wins', 'losses', 'pf', 'pa'],
                },
                playoffs: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    wins: { type: 'integer' },
                    losses: { type: 'integer' },
                  },
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
            properties: {
              year: { type: 'integer' },
              finish: { type: 'string' },
            },
            required: ['year', 'finish'],
          },
        },
      },
      required: ['name', 'logoUrl', 'rosterId', 'currentRecord', 'allTimeStats', 'championships', 'championshipHistory'],
    },
    roster: {
      type: 'object',
      additionalProperties: false,
      properties: {
        active: { type: 'array', items: playerSchema },
        ir: { type: 'array', items: playerSchema },
        taxi: { type: 'array', items: playerSchema },
      },
      required: ['active', 'ir', 'taxi'],
    },
  },
  required: ['meta', 'matchResolution', 'team', 'roster'],
} as const;

export const TEAM_CARD_TOOL_META = {
  'openai/outputTemplate': TEAM_CARD_WIDGET_URI,
  ui: { resourceUri: TEAM_CARD_WIDGET_URI },
} as const;

export const TEAM_CARD_RESOURCE_META = {
  ui: {
    prefersBorder: true,
    domain: TEAM_CARD_BASE_URL,
    csp: { resourceDomains: [TEAM_CARD_BASE_URL] },
  },
  'openai/widgetDescription': 'East v. West Team Card — record, roster, championships, and injury flags.',
} as const;
