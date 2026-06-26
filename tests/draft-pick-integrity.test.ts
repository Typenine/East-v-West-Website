/**
 * Draft pick-commit and auto-pick integrity tests.
 *
 * All database calls are mocked. The critical design constraint:
 * queries.fixed.ts uses a module-level `_tablesEnsured` flag that skips all
 * ensureDraftTables() DB calls after the first run. We exploit this in beforeAll
 * to "warm up" the flag so that every test's mock queue is consumed only by the
 * specific DB calls we care about — not by table-creation boilerplate.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ── Mock the database client ─────────────────────────────────────────────────
const mockExecute = vi.fn();
const mockDb = { execute: mockExecute };

vi.mock('@/server/db/client', () => ({
  getDb: () => mockDb,
}));

// ── Import functions under test AFTER mocks are established ─────────────────
import {
  commitPick,
  submitPendingPick,
  checkAndAutoPick,
} from '@/server/db/queries.fixed';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCommitRow(overrides: Partial<{
  initial_status: string;
  slot_team: string;
  player_taken: boolean;
  draft_overall: number;
  pick_inserted: boolean;
  draft_completed: boolean;
}> = {}) {
  return {
    initial_status: 'LIVE',
    slot_team: 'Team1',
    player_taken: false,
    draft_overall: 5,
    pick_inserted: true,
    draft_completed: false,
    ...overrides,
  };
}

// ── Pre-warm: set _tablesEnsured = true before any test runs ─────────────────
// Without this, the first test's mockResolvedValueOnce responses get consumed
// by the ~49 DB calls inside ensureDraftTables() instead of the intended calls.
beforeAll(async () => {
  // Persistent default: every unmocked call returns an empty result set.
  mockExecute.mockResolvedValue({ rows: [] });
  // Any draft function call triggers ensureDraftTables() → sets _tablesEnsured = true.
  // All table-creation calls consume the persistent default { rows: [] }.
  try {
    await commitPick({ draftId: '00000000-0000-0000-0000-000000000000', team: 'T', playerId: 'x', madeBy: 'warmup' });
  } catch {
    // We don't care about the result — the side effect (_tablesEnsured = true) is what matters.
  }
});

beforeEach(() => {
  // Clear call history and the one-time queue; keeps the persistent default mock.
  vi.clearAllMocks();
  // Re-assert the persistent default so any un-targeted call returns safely.
  mockExecute.mockResolvedValue({ rows: [] });
});

// ── commitPick tests ─────────────────────────────────────────────────────────

describe('commitPick', () => {
  // With _tablesEnsured = true, the first DB call in commitPick is the big CTE.
  // One-time queue is consumed in call order, so one mockResolvedValueOnce here
  // targets exactly the CTE call.

  it('returns ok:true when the CTE reports pick_inserted=true', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [makeCommitRow({ pick_inserted: true })] });

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'player-1', madeBy: 'test' });

    expect(result).toEqual({ ok: true, completed: false });
  });

  it('reports completed:true when draft_completed=true', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [makeCommitRow({ pick_inserted: true, draft_completed: true })] });

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'player-1', madeBy: 'test' });

    expect(result).toEqual({ ok: true, completed: true });
  });

  it('returns wrong_state when draft is not LIVE', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [makeCommitRow({ initial_status: 'PAUSED', pick_inserted: false })] });

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'player-1', madeBy: 'test' });

    expect(result).toEqual({ ok: false, error: 'wrong_state' });
  });

  it('returns wrong_team when slot belongs to a different team', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [makeCommitRow({ slot_team: 'Team2', pick_inserted: false })] });

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'player-1', madeBy: 'test' });

    expect(result).toEqual({ ok: false, error: 'wrong_team' });
  });

  it('returns player_taken when the CTE snapshot shows player already picked', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [makeCommitRow({ player_taken: true, pick_inserted: false })] });

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'player-1', madeBy: 'test' });

    expect(result).toEqual({ ok: false, error: 'player_taken' });
  });

  it('returns stale_request when expectedOverall does not match the draft cursor', async () => {
    // draft_overall=6 but caller expected 5
    mockExecute.mockResolvedValueOnce({ rows: [makeCommitRow({ draft_overall: 6, pick_inserted: false })] });

    const result = await commitPick({
      draftId: 'draft-1', team: 'Team1', playerId: 'player-1', madeBy: 'test',
      expectedOverall: 5,
    });

    expect(result).toEqual({ ok: false, error: 'stale_request' });
  });

  it('two concurrent requests — slot conflict: second gets stale_request', async () => {
    // Concurrent scenario: conditions all pass in CTE but ON CONFLICT DO NOTHING
    // fired because another request committed this slot first. player_taken=false
    // (our player wasn't taken, the SLOT overall was taken by a different pick).
    // Post-check confirms our player is not in draft_picks → stale_request.
    mockExecute
      .mockResolvedValueOnce({ rows: [makeCommitRow({ pick_inserted: false, player_taken: false })] }) // CTE
      .mockResolvedValueOnce({ rows: [] }); // post-check: player not found

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'player-1', madeBy: 'test' });

    expect(result).toEqual({ ok: false, error: 'stale_request' });
  });

  it('two concurrent requests — same player: ON CONFLICT, post-check finds player taken', async () => {
    // Conditions met in CTE but INSERT silenced. Post-check confirms player IS in draft_picks.
    mockExecute
      .mockResolvedValueOnce({ rows: [makeCommitRow({ pick_inserted: false, player_taken: false })] }) // CTE
      .mockResolvedValueOnce({ rows: [{ player_id: 'player-1' }] }); // post-check: player found

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'player-1', madeBy: 'test' });

    expect(result).toEqual({ ok: false, error: 'player_taken' });
  });

  it('returns no_slot when the CTE returns no rows (draft not found)', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] }); // CTE: empty

    const result = await commitPick({ draftId: 'nonexistent', team: 'Team1', playerId: 'player-1', madeBy: 'test' });

    expect(result).toEqual({ ok: false, error: 'no_slot' });
  });

  it('handles PostgreSQL 23505 unique-constraint error as player_taken', async () => {
    // CTE throws; post-check confirms the player is now in draft_picks.
    mockExecute
      .mockRejectedValueOnce(new Error('ERROR: duplicate key value violates unique constraint "uq_draft_picks_draft_player" (23505)'))
      .mockResolvedValueOnce({ rows: [{ player_id: 'player-1' }] }); // post-check

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'player-1', madeBy: 'test' });

    expect(result).toEqual({ ok: false, error: 'player_taken' });
  });

  it('advancement within a round: completed:false', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [makeCommitRow({ pick_inserted: true, draft_completed: false })] });

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'player-7', madeBy: 'test' });

    expect(result).toEqual({ ok: true, completed: false });
  });

  it('final pick completes the draft: completed:true', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [makeCommitRow({ pick_inserted: true, draft_completed: true })] });

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'last-player', madeBy: 'test' });

    expect(result).toEqual({ ok: true, completed: true });
  });
});

// ── submitPendingPick tests ───────────────────────────────────────────────────

describe('submitPendingPick', () => {
  // With _tablesEnsured = true, call order inside submitPendingPick is:
  //   1. state check SELECT (JOIN draft_slots)
  //   2. INSERT ... ON CONFLICT DO NOTHING RETURNING id
  //   3. (only if INSERT returned nothing) SELECT existing pending

  const validState = {
    status: 'LIVE',
    cur_overall: 5,
    round_end_pause: false,
    slot_team: 'Team1',
  };

  it('creates a new pending pick, returns created:true', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [validState] })             // state check
      .mockResolvedValueOnce({ rows: [{ id: 'pending-id-1' }] }); // INSERT success

    const result = await submitPendingPick('draft-1', { overall: 5, team: 'Team1', playerId: 'player-1' });

    expect(result).toEqual({ id: 'pending-id-1', created: true });
  });

  it('returns created:false when the same pick is submitted twice (idempotent retry)', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [validState] })          // state check
      .mockResolvedValueOnce({ rows: [] })                    // INSERT → ON CONFLICT DO NOTHING
      .mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] }); // SELECT existing

    const result = await submitPendingPick('draft-1', { overall: 5, team: 'Team1', playerId: 'player-1' });

    expect(result).toEqual({ id: 'existing-id', created: false });
  });

  it('conflicting pick from a second tab gets the existing row back (slot already locked)', async () => {
    // Tab A picked player-1. Tab B tries player-2 for the same slot.
    // The partial unique index on (draft_id, overall) WHERE status='pending'
    // prevents both from inserting. Tab B's INSERT gets ON CONFLICT DO NOTHING.
    // Tab B's SELECT returns Tab A's row.
    mockExecute
      .mockResolvedValueOnce({ rows: [validState] })
      .mockResolvedValueOnce({ rows: [] })                            // INSERT conflict
      .mockResolvedValueOnce({ rows: [{ id: 'tab-a-pending-id' }] }); // SELECT → Tab A's row

    const result = await submitPendingPick('draft-1', { overall: 5, team: 'Team1', playerId: 'player-2' });

    expect(result).toEqual({ id: 'tab-a-pending-id', created: false });
  });

  it('returns null when draft cursor has advanced past the submitted overall', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ...validState, cur_overall: 6 }] });

    const result = await submitPendingPick('draft-1', { overall: 5, team: 'Team1', playerId: 'player-1' });

    expect(result).toBeNull();
  });

  it('returns null when the submitting team does not own the slot', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ...validState, slot_team: 'Team2' }] });

    const result = await submitPendingPick('draft-1', { overall: 5, team: 'Team1', playerId: 'player-1' });

    expect(result).toBeNull();
  });

  it('returns null during a round-end pause', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ...validState, round_end_pause: true }] });

    const result = await submitPendingPick('draft-1', { overall: 5, team: 'Team1', playerId: 'player-1' });

    expect(result).toBeNull();
  });

  it('returns null for a COMPLETED draft', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ...validState, status: 'COMPLETED' }] });

    const result = await submitPendingPick('draft-1', { overall: 5, team: 'Team1', playerId: 'player-1' });

    expect(result).toBeNull();
  });
});

// ── checkAndAutoPick tests ────────────────────────────────────────────────────

describe('checkAndAutoPick', () => {
  // With _tablesEnsured = true, call order in checkAndAutoPick (force=false) is:
  //   1. draft state SELECT (JOIN draft_slots)
  //   2. taken players SELECT
  //   3. getPendingPick → SELECT draft_pending_picks
  //   4. queue SELECT
  //   [if queue has an available player:]
  //   5. submitPendingPick: state check
  //   6. submitPendingPick: INSERT
  //   7. pauseDraft: UPDATE (only if created=true)
  //
  // force=true replaces steps 5-7 with:
  //   5. commitPick CTE
  //   6. DELETE from draft_queues

  const expiredDeadline = new Date(Date.now() - 10_000).toISOString();
  const futureDeadline = new Date(Date.now() + 30_000).toISOString();

  const liveDraftRow = {
    status: 'LIVE',
    deadline_ts: expiredDeadline,
    cur_overall: 5,
    team: 'Team1',
  };

  const validSubmitState = {
    status: 'LIVE',
    cur_overall: 5,
    round_end_pause: false,
    slot_team: 'Team1',
  };

  it('returns draft_not_live when draft is PAUSED', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ...liveDraftRow, status: 'PAUSED' }] });

    const result = await checkAndAutoPick('draft-1');

    expect(result).toEqual({ picked: false, error: 'draft_not_live' });
  });

  it('returns picked:false when the clock has not yet expired', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ...liveDraftRow, deadline_ts: futureDeadline }] });

    const result = await checkAndAutoPick('draft-1');

    expect(result).toEqual({ picked: false });
  });

  it('returns picked:false when a pending pick already exists', async () => {
    const existingPending = {
      id: 'existing-id', overall: 5, team: 'Team1', player_id: 'p1',
      player_name: null, player_pos: null, player_nfl: null, submitted_at: new Date(),
    };
    mockExecute
      .mockResolvedValueOnce({ rows: [liveDraftRow] })       // draft state
      .mockResolvedValueOnce({ rows: [] })                   // taken players
      .mockResolvedValueOnce({ rows: [existingPending] });   // getPendingPick

    const result = await checkAndAutoPick('draft-1');

    expect(result).toEqual({ picked: false });
  });

  it('submits a pending pick from the queue when clock expires (force=false)', async () => {
    const queuePlayer = { player_id: 'q1', player_name: 'Queue Player', player_pos: 'RB', player_nfl: 'DAL' };

    mockExecute
      .mockResolvedValueOnce({ rows: [liveDraftRow] })          // 1. draft state
      .mockResolvedValueOnce({ rows: [] })                      // 2. taken players
      .mockResolvedValueOnce({ rows: [] })                      // 3. getPendingPick → none
      .mockResolvedValueOnce({ rows: [queuePlayer] })           // 4. queue
      .mockResolvedValueOnce({ rows: [validSubmitState] })      // 5. submitPendingPick state
      .mockResolvedValueOnce({ rows: [{ id: 'new-pending' }] }) // 6. INSERT → success
      .mockResolvedValueOnce({ rows: [] });                     // 7. pauseDraft UPDATE

    const result = await checkAndAutoPick('draft-1');

    expect(result).toMatchObject({ picked: true, playerId: 'q1' });
  });

  it('multiple simultaneous expiry calls — call A creates, call B finds existing (idempotent)', async () => {
    // Simulate two independent expiry-check calls. JavaScript is single-threaded so
    // these run sequentially, but each sees the same expired state and no pre-existing
    // pending pick. Call A inserts (created:true); call B gets ON CONFLICT (created:false).
    // Only call A triggers pauseDraft.

    const queuePlayer = { player_id: 'q1', player_name: 'QP', player_pos: 'RB', player_nfl: 'KC' };

    // ── Call A ──────────────────────────────────────────────────────────────
    mockExecute
      .mockResolvedValueOnce({ rows: [liveDraftRow] })          // A:1
      .mockResolvedValueOnce({ rows: [] })                      // A:2
      .mockResolvedValueOnce({ rows: [] })                      // A:3
      .mockResolvedValueOnce({ rows: [queuePlayer] })           // A:4
      .mockResolvedValueOnce({ rows: [validSubmitState] })      // A:5
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }] })          // A:6 INSERT → created
      .mockResolvedValueOnce({ rows: [] });                     // A:7 pauseDraft

    const resultA = await checkAndAutoPick('draft-1');
    expect(resultA).toMatchObject({ picked: true, playerId: 'q1' });

    // Reset the one-time queue for call B.
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({ rows: [] });

    // ── Call B (INSERT fails → SELECT returns A's pending) ──────────────────
    mockExecute
      .mockResolvedValueOnce({ rows: [liveDraftRow] })          // B:1
      .mockResolvedValueOnce({ rows: [] })                      // B:2
      .mockResolvedValueOnce({ rows: [] })                      // B:3
      .mockResolvedValueOnce({ rows: [queuePlayer] })           // B:4
      .mockResolvedValueOnce({ rows: [validSubmitState] })      // B:5
      .mockResolvedValueOnce({ rows: [] })                      // B:6 INSERT → ON CONFLICT
      .mockResolvedValueOnce({ rows: [{ id: 'p1' }] });         // B:7 SELECT existing

    const resultB = await checkAndAutoPick('draft-1');
    expect(resultB).toMatchObject({ picked: true, playerId: 'q1' });

    // Call B must NOT have triggered pauseDraft (created=false → pauseDraft is skipped).
    // Exactly 7 calls were made for B (no 8th pauseDraft call).
    expect(mockExecute).toHaveBeenCalledTimes(7);
  });

  it('force=true: commits immediately via commitPick, skips pending step', async () => {
    const queuePlayer = { player_id: 'q1', player_name: 'QP', player_pos: 'WR', player_nfl: 'DAL' };

    mockExecute
      .mockResolvedValueOnce({ rows: [{ ...liveDraftRow, deadline_ts: futureDeadline }] }) // 1. draft state
      .mockResolvedValueOnce({ rows: [] })                                                  // 2. taken
      .mockResolvedValueOnce({ rows: [] })                                                  // 3. getPendingPick
      .mockResolvedValueOnce({ rows: [queuePlayer] })                                       // 4. queue
      .mockResolvedValueOnce({ rows: [makeCommitRow({ pick_inserted: true })] })            // 5. commitPick CTE
      .mockResolvedValueOnce({ rows: [] });                                                 // 6. DELETE from queue

    const result = await checkAndAutoPick('draft-1', true);

    expect(result).toMatchObject({ picked: true, playerId: 'q1' });
  });
});

// ── End-of-round pause: TypeScript wrapper does not misinterpret CTE result ───
//
// The round_end_pause flag, clock clearing, and paused_remaining_secs are all
// set inside the single atomic CTE in commitPick. The TypeScript wrapper reads
// only pick_inserted and draft_completed from the CTE result. We verify the
// wrapper returns the correct shape even when the CTE triggers a pause.

describe('end-of-round pause (TypeScript wrapper behaviour)', () => {
  it('returns ok:true with completed:false after a round-boundary pick', async () => {
    // When the CTE sets status='PAUSED' and round_end_pause=true, the result
    // row still has pick_inserted=true and draft_completed=false. The TS wrapper
    // maps this to { ok: true, completed: false }; the UI reads draft state
    // separately to detect the pause and display the animation.
    mockExecute.mockResolvedValueOnce({ rows: [makeCommitRow({ pick_inserted: true, draft_completed: false })] });

    const result = await commitPick({ draftId: 'draft-1', team: 'Team1', playerId: 'player-6', madeBy: 'test' });

    expect(result).toEqual({ ok: true, completed: false });
  });
});
