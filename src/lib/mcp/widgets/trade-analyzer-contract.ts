export const TRADE_ANALYZER_WIDGET_URI = 'ui://widget/trade-analyzer-v1.html';

const nullableNumberSchema = { anyOf: [{ type: 'number' }, { type: 'null' }] } as const;
const assetSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    name: { type: 'string' }, position: { type: 'string' }, nflTeam: { type: 'string' }, value: { type: 'number' },
    fcValue: nullableNumberSchema, ktcValue: nullableNumberSchema, isPick: { type: 'boolean' }, trend: { type: 'number' },
  },
  required: ['name', 'position', 'nflTeam', 'value', 'fcValue', 'ktcValue', 'isPick', 'trend'],
} as const;
const sideSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    assets: { type: 'array', items: assetSchema }, posSummary: { type: 'string' }, rawTotal: { type: 'number' },
    effectiveTotal: { type: 'number' }, grade: { type: 'string' },
  },
  required: ['assets', 'posSummary', 'rawTotal', 'effectiveTotal', 'grade'],
} as const;

export const TRADE_ANALYZER_OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    analysis: {
      type: 'object', additionalProperties: false,
      properties: {
        ratio: { type: 'number' }, verdict: { type: 'string' }, winner: { anyOf: [{ type: 'string', enum: ['A', 'B'] }, { type: 'null' }] },
        diff: { type: 'number' }, effA: { type: 'number' }, effB: { type: 'number' }, rawA: { type: 'number' }, rawB: { type: 'number' },
        sideAGrade: { type: 'string' }, sideBGrade: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } },
        counterHint: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: ['ratio', 'verdict', 'winner', 'diff', 'effA', 'effB', 'rawA', 'rawB', 'sideAGrade', 'sideBGrade', 'notes', 'counterHint'],
    },
    sideA: sideSchema, sideB: sideSchema,
    unmatched: {
      type: 'object', additionalProperties: false,
      properties: { sideA: { type: 'array', items: { type: 'string' } }, sideB: { type: 'array', items: { type: 'string' } } },
      required: ['sideA', 'sideB'],
    },
    source: { type: 'string', enum: ['avg', 'fc', 'ktc'] },
    meta: {
      type: 'object', additionalProperties: false,
      properties: { tool: { type: 'string' }, source: { type: 'string' }, valueSources: { type: 'string' }, fetchedAt: { type: 'string' } },
      required: ['tool', 'source', 'valueSources', 'fetchedAt'],
    },
  },
  required: ['analysis', 'sideA', 'sideB', 'unmatched', 'source', 'meta'],
} as const;

export const TRADE_ANALYZER_TOOL_META = {
  'openai/outputTemplate': TRADE_ANALYZER_WIDGET_URI,
  ui: { resourceUri: TRADE_ANALYZER_WIDGET_URI },
} as const;

export const TRADE_ANALYZER_RESOURCE_META = {
  ui: { prefersBorder: true },
  'openai/widgetDescription': 'East v. West Trade Analyzer — side-by-side value, grades, and verdict for a proposed trade.',
} as const;
