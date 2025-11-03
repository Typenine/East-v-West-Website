import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, index, integer } from 'drizzle-orm/pg-core';

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
