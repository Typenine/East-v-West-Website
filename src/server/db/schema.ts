import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, index, integer, primaryKey } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('user_role', ['admin', 'user']);
export const suggestionStatusEnum = pgEnum('suggestion_status', ['draft', 'open', 'accepted', 'rejected']);
export const taxiEventEnum = pgEnum('taxi_event', ['add', 'remove', 'promote', 'demote']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  role: roleEnum('role').default('user').notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
}, (t) => ({
  emailIdx: index('users_email_idx').on(t.email),
}));

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  abbrev: varchar('abbrev', { length: 32 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  position: varchar('position', { length: 16 }).notNull(),
  nflTeam: varchar('nfl_team', { length: 16 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  posIdx: index('players_pos_idx').on(t.position),
  nflIdx: index('players_nfl_idx').on(t.nflTeam),
}));

export const suggestions = pgTable('suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  text: text('text').notNull(),
  category: varchar('category', { length: 64 }),
  status: suggestionStatusEnum('status').default('open').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
}, (t) => ({
  userIdx: index('suggestions_user_idx').on(t.userId),
  statusCreatedIdx: index('suggestions_status_created_idx').on(t.status, t.createdAt),
}));

export const taxiSquadMembers = pgTable('taxi_squad_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull(),
  playerId: uuid('player_id').notNull(),
  activeFrom: timestamp('active_from').defaultNow().notNull(),
  activeTo: timestamp('active_to'),
}, (t) => ({
  teamIdx: index('taxi_members_team_idx').on(t.teamId),
  playerIdx: index('taxi_members_player_idx').on(t.playerId),
  activeToIdx: index('taxi_members_active_to_idx').on(t.activeTo),
}));

export const taxiSquadEvents = pgTable('taxi_squad_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull(),
  playerId: uuid('player_id').notNull(),
  eventType: taxiEventEnum('event_type').notNull(),
  eventAt: timestamp('event_at').defaultNow().notNull(),
  meta: jsonb('meta').$type<Record<string, unknown> | null>().default(null),
}, (t) => ({
  teamEventIdx: index('taxi_events_team_at_idx').on(t.teamId, t.eventAt),
  playerEventIdx: index('taxi_events_player_at_idx').on(t.playerId, t.eventAt),
}));

export const mediaFiles = pgTable('media_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerType: varchar('owner_type', { length: 64 }).notNull(),
  ownerId: uuid('owner_id'),
  fileKey: text('file_key').notNull(),
  contentType: varchar('content_type', { length: 128 }),
  url: text('url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const teamPins = pgTable('team_pins', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamSlug: varchar('team_slug', { length: 128 }).notNull().unique(),
  hash: text('hash').notNull(),
  salt: text('salt').notNull(),
  pinVersion: integer('pin_version').default(1).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  slugIdx: index('team_pins_slug_idx').on(t.teamSlug),
}));

export const taxiObservations = pgTable('taxi_observations', {
  team: varchar('team', { length: 255 }).primaryKey(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  players: jsonb('players').$type<Record<string, { firstSeen: string; lastSeen: string; seenCount: number }>>().notNull(),
});

export const userDocs = pgTable('user_docs', {
  userId: varchar('user_id', { length: 64 }).primaryKey(),
  team: varchar('team', { length: 255 }).notNull(),
  version: integer('version').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  votes: jsonb('votes').$type<Record<string, Record<string, number>> | null>().default(null),
  tradeBlock: jsonb('trade_block').$type<Array<Record<string, unknown>> | null>().default(null),
  tradeWants: jsonb('trade_wants').$type<{ text?: string; positions?: string[] } | null>().default(null),
}, (t) => ({
  userTeamIdx: index('user_docs_team_idx').on(t.team),
}));

// R2 storage config
export const storageModeEnum = pgEnum('storage_mode', ['path', 'vhost']);

export const storageConfig = pgTable('storage_config', {
  id: varchar('id', { length: 16 }).primaryKey(),
  chosenMode: storageModeEnum('chosen_mode'),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  notes: text('notes'),
});

// Taxi Auditor DB (validator)
export const acqViaEnum = pgEnum('acq_via', ['free_agent', 'waiver', 'trade', 'draft', 'other']);
export const runTypeEnum = pgEnum('taxi_run_type', ['wed_warn', 'thu_warn', 'sun_am_warn', 'sun_pm_official', 'admin_rerun']);

export const tenures = pgTable('tenures', {
  teamId: varchar('team_id', { length: 255 }).notNull(),
  playerId: varchar('player_id', { length: 64 }).notNull(),
  acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull(),
  acquiredVia: acqViaEnum('acquired_via').notNull(),
  activeSeen: integer('active_seen').default(0).notNull(), // 0=false, 1=true (boolean workaround for drizzle/neon subtlety)
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
}, (t) => ({
  pk: primaryKey({ columns: [t.teamId, t.playerId] }),
}));

export const txnCache = pgTable('txn_cache', {
  week: integer('week').notNull(),
  teamId: varchar('team_id', { length: 255 }).notNull(),
  playerId: varchar('player_id', { length: 64 }).notNull(),
  type: varchar('type', { length: 32 }).notNull(), // add | drop | trade | draft | waiver | free_agent
  direction: varchar('direction', { length: 8 }).notNull(), // in | out
  ts: timestamp('ts', { withTimezone: true }).notNull(),
}, (t) => ({
  wkTeamIdx: index('txn_cache_week_team_idx').on(t.week, t.teamId),
}));

export const taxiSnapshots = pgTable('taxi_snapshots', {
  season: integer('season').notNull(),
  week: integer('week').notNull(),
  runType: runTypeEnum('run_type').notNull(),
  runTs: timestamp('run_ts', { withTimezone: true }).notNull(),
  teamId: varchar('team_id', { length: 255 }).notNull(),
  taxiIds: text('taxi_ids').array().notNull(),
  compliant: integer('compliant').default(1).notNull(), // 1=true, 0=false
  violations: jsonb('violations').$type<Array<{ code: string; detail?: string; players?: string[] }>>().notNull(),
  degraded: integer('degraded').default(0).notNull(),
}, (t) => ({
  pkSnapshot: primaryKey({ columns: [t.season, t.week, t.runType, t.teamId] }),
  teamIdx: index('taxi_snapshots_team_idx').on(t.teamId),
}));

// ============ Newsletter Bot Memory ============

export const botNameEnum = pgEnum('bot_name', ['entertainer', 'analyst']);
export const summaryMoodEnum = pgEnum('summary_mood', ['Focused', 'Fired Up', 'Deflated']);
export const teamMoodEnum = pgEnum('team_mood', ['Neutral', 'Confident', 'Suspicious', 'Irritated']);

// Bot memory - stores overall bot state and per-team sentiment
export const botMemory = pgTable('bot_memory', {
  id: uuid('id').primaryKey().defaultRandom(),
  bot: botNameEnum('bot').notNull(),
  season: integer('season').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  summaryMood: summaryMoodEnum('summary_mood').default('Focused').notNull(),
  // Per-team memory stored as JSONB: { "Team Name": { trust: number, frustration: number, mood: string } }
  teams: jsonb('teams').$type<Record<string, { trust: number; frustration: number; mood: string }>>().default({}).notNull(),
}, (t) => ({
  botSeasonIdx: index('bot_memory_bot_season_idx').on(t.bot, t.season),
}));

// Forecast records - tracks prediction accuracy over the season
export const forecastRecords = pgTable('forecast_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  season: integer('season').notNull(),
  bot: botNameEnum('bot').notNull(),
  wins: integer('wins').default(0).notNull(),
  losses: integer('losses').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  seasonBotIdx: index('forecast_records_season_bot_idx').on(t.season, t.bot),
}));

// Pending picks - stores predictions to grade next week
export const pendingPicks = pgTable('pending_picks', {
  id: uuid('id').primaryKey().defaultRandom(),
  season: integer('season').notNull(),
  week: integer('week').notNull(), // The week these picks are FOR (next week)
  matchupId: varchar('matchup_id', { length: 64 }).notNull(),
  team1: varchar('team1', { length: 255 }),
  team2: varchar('team2', { length: 255 }),
  entertainerPick: varchar('entertainer_pick', { length: 255 }),
  analystPick: varchar('analyst_pick', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  seasonWeekIdx: index('pending_picks_season_week_idx').on(t.season, t.week),
}));

// Staged newsletter generation - tracks progress of Tuesday→Wednesday builds
export const newsletterStatusEnum = pgEnum('newsletter_status', ['pending', 'in_progress', 'completed', 'failed', 'published']);

export const newsletterStaged = pgTable('newsletter_staged', {
  id: uuid('id').primaryKey().defaultRandom(),
  season: integer('season').notNull(),
  week: integer('week').notNull(),
  status: newsletterStatusEnum('status').default('pending').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  sectionsCompleted: text('sections_completed').array().default([]).notNull(),
  currentSection: varchar('current_section', { length: 64 }),
  error: text('error'),
  // Generated content per section: { "Intro": { entertainer: "...", analyst: "..." }, ... }
  generatedContent: jsonb('generated_content').$type<Record<string, { entertainer: string; analyst: string }>>().default({}).notNull(),
  // Derived data snapshot (so we don't re-fetch)
  derivedData: jsonb('derived_data').$type<Record<string, unknown>>(),
}, (t) => ({
  seasonWeekIdx: index('newsletter_staged_season_week_idx').on(t.season, t.week),
}));

// Generated newsletters - stores the full newsletter content
export const newsletters = pgTable('newsletters', {
  id: uuid('id').primaryKey().defaultRandom(),
  season: integer('season').notNull(),
  week: integer('week').notNull(),
  leagueName: varchar('league_name', { length: 255 }).notNull(),
  // Full newsletter JSON structure
  content: jsonb('content').$type<{
    meta: { leagueName: string; week: number; date: string; season: number };
    sections: Array<{ type: string; data: unknown }>;
  }>().notNull(),
  // Pre-rendered HTML for fast display
  html: text('html').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  seasonWeekIdx: index('newsletters_season_week_idx').on(t.season, t.week),
}));

