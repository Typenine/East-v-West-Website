import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, index, integer, primaryKey, boolean } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('user_role', ['admin', 'user']);
export const suggestionStatusEnum = pgEnum('suggestion_status', ['draft', 'open', 'accepted', 'rejected']);
export const taxiEventEnum = pgEnum('taxi_event', ['add', 'remove', 'promote', 'demote']);

// ============ Leagues (Multi-League Support) ============

export const leagues = pgTable('leagues', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  shortName: varchar('short_name', { length: 32 }),
  sleeperLeagueId: varchar('sleeper_league_id', { length: 64 }),
  sleeperLeagueIds: jsonb('sleeper_league_ids').$type<Record<string, string>>().default({}),
  logoUrl: text('logo_url'),
  primaryColor: varchar('primary_color', { length: 16 }),
  secondaryColor: varchar('secondary_color', { length: 16 }),
  config: jsonb('config').$type<Record<string, unknown>>().default({}),
  teamColors: jsonb('team_colors').$type<Record<string, { primary: string; secondary: string; tertiary?: string; quaternary?: string }>>().default({}),
  rulesContent: text('rules_content'),
  rulesFileKey: text('rules_file_key'),
  foundedYear: integer('founded_year'),
  setupCompleted: boolean('setup_completed').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  slugIdx: index('leagues_slug_idx').on(t.slug),
  sleeperIdx: index('leagues_sleeper_idx').on(t.sleeperLeagueId),
}));

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  passwordHash: text('password_hash'),
  role: roleEnum('role').default('user').notNull(),
  leagueId: uuid('league_id').references(() => leagues.id),
  teamName: varchar('team_name', { length: 255 }),
  sleeperUserId: varchar('sleeper_user_id', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
}, (t) => ({
  emailIdx: index('users_email_idx').on(t.email),
  leagueIdx: index('users_league_idx').on(t.leagueId),
}));

// League invites for team signup
export const leagueInvites = pgTable('league_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').references(() => leagues.id).notNull(),
  teamName: varchar('team_name', { length: 255 }).notNull(),
  rosterId: integer('roster_id'),
  inviteCode: varchar('invite_code', { length: 64 }).notNull().unique(),
  defaultPin: varchar('default_pin', { length: 64 }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  claimedBy: uuid('claimed_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  leagueIdx: index('league_invites_league_idx').on(t.leagueId),
  codeIdx: index('league_invites_code_idx').on(t.inviteCode),
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
  leagueId: uuid('league_id').references(() => leagues.id),
  text: text('text').notNull(),
  category: varchar('category', { length: 64 }),
  status: suggestionStatusEnum('status').default('open').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
}, (t) => ({
  userIdx: index('suggestions_user_idx').on(t.userId),
  statusCreatedIdx: index('suggestions_status_created_idx').on(t.status, t.createdAt),
  leagueIdx: index('suggestions_league_idx').on(t.leagueId),
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
  leagueId: uuid('league_id').references(() => leagues.id),
  hash: text('hash').notNull(),
  salt: text('salt').notNull(),
  pinVersion: integer('pin_version').default(1).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  slugIdx: index('team_pins_slug_idx').on(t.teamSlug),
  leagueIdx: index('team_pins_league_idx').on(t.leagueId),
}));

export const taxiObservations = pgTable('taxi_observations', {
  team: varchar('team', { length: 255 }).primaryKey(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  players: jsonb('players').$type<Record<string, { firstSeen: string; lastSeen: string; seenCount: number }>>().notNull(),
});

export const userDocs = pgTable('user_docs', {
  userId: varchar('user_id', { length: 64 }).primaryKey(),
  leagueId: uuid('league_id').references(() => leagues.id),
  team: varchar('team', { length: 255 }).notNull(),
  version: integer('version').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  votes: jsonb('votes').$type<Record<string, Record<string, number>> | null>().default(null),
  tradeBlock: jsonb('trade_block').$type<Array<Record<string, unknown>> | null>().default(null),
  tradeWants: jsonb('trade_wants').$type<{ text?: string; positions?: string[] } | null>().default(null),
}, (t) => ({
  userTeamIdx: index('user_docs_team_idx').on(t.team),
  leagueIdx: index('user_docs_league_idx').on(t.leagueId),
}));

export const tradeBlockEvents = pgTable('trade_block_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  leagueId: uuid('league_id').references(() => leagues.id),
  team: varchar('team', { length: 255 }).notNull(),
  eventType: varchar('event_type', { length: 32 }).notNull(), // 'added' | 'removed' | 'wants_changed'
  assetType: varchar('asset_type', { length: 32 }), // 'player' | 'pick' | 'faab' | null for wants_changed
  assetId: varchar('asset_id', { length: 255 }), // playerId, 'YEAR-ROUND-ORIGIN', 'faab', or null
  assetLabel: text('asset_label'), // human-readable label
  oldWants: text('old_wants'), // for wants_changed events
  newWants: text('new_wants'), // for wants_changed events
  createdAt: timestamp('created_at').defaultNow().notNull(),
  sentAt: timestamp('sent_at'), // null until posted to Discord
}, (t) => ({
  teamCreatedIdx: index('trade_block_events_team_created_idx').on(t.team, t.createdAt),
  sentAtIdx: index('trade_block_events_sent_at_idx').on(t.sentAt),
  leagueIdx: index('trade_block_events_league_idx').on(t.leagueId),
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

// Discord notification dedupe - tracks which events have been posted to Discord
export const discordNotificationTypeEnum = pgEnum('discord_notification_type', [
  'trade_accepted',
  'trade_pending',
  'trade_complete',
]);

export const discordNotifications = pgTable('discord_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  notificationType: discordNotificationTypeEnum('notification_type').notNull(),
  // Unique key for deduplication (e.g., transaction_id for trades)
  dedupeKey: varchar('dedupe_key', { length: 255 }).notNull(),
  postedAt: timestamp('posted_at', { withTimezone: true }).defaultNow().notNull(),
  // Optional metadata about the notification
  meta: jsonb('meta').$type<Record<string, unknown>>(),
}, (t) => ({
  typeKeyIdx: index('discord_notifications_type_key_idx').on(t.notificationType, t.dedupeKey),
}));

