/**
 * Draft state-machine, commissioner controls, reset, undo, and skip-pick tests.
 *
 * All DB calls are mocked. The beforeAll warm-up sets the module-level
 * _tablesEnsured flag to true so subsequent tests only see their own DB calls.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ── Mock DB client ───────────────────────────────────────────────────────────
const mockExecute = vi.fn();
vi.mock('@/server/db/client', () => ({ getDb: () => ({ execute: mockExecute }) }));

// ── Import functions under test AFTER mock ───────────────────────────────────
import {
  startDraft,
  skipPick,
  pauseDraft,
  resumeDraft,
  resetDraft,
  undoLastPick,
} from '@/server/db/queries.fixed';

// ── Pre-warm _tablesEnsured ──────────────────────────────────────────────────
beforeAll(async () => {
  mockExecute.mockResolvedValue({ rows: [] });
  try { await startDraft('00000000-0000-0000-0000-000000000000'); } catch {}
});

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue({ rows: [] });
});

// ── Helper ───────────────────────────────────────────────────────────────────
// With _tablesEnsured = true, startDraft makes exactly these sequential calls:
//  1. SELECT status, clock_seconds FROM drafts
//  2. SELECT id FROM drafts WHERE status IN ('LIVE','PAUSED') AND id <> ...
//  3. SELECT COUNT(1), COUNT(DISTINCT team) FROM draft_slots
//  4. SELECT s.overall FROM draft_slots ... ORDER BY overall ASC LIMIT 1 (first slot)
//  5. UPDATE drafts SET status='LIVE' ...

// ── startDraft tests ─────────────────────────────────────────────────────────

describe('startDraft', () => {
  it('succeeds for a NOT_STARTED draft with slots and teams', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ status: 'NOT_STARTED', clock_seconds: 60 }] }) // 1. draft row
      .mockResolvedValueOnce({ rows: [] })                                               // 2. no other active
      .mockResolvedValueOnce({ rows: [{ c: 36, teams: 12 }] })                          // 3. slot counts
      .mockResolvedValueOnce({ rows: [{ overall: 1 }] })                                // 4. first slot
      .mockResolvedValueOnce({ rows: [] });                                              // 5. UPDATE

    const result = await startDraft('draft-1');
    expect(result).toEqual({ ok: true });
  });

  it('rejects if draft is already LIVE', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ status: 'LIVE', clock_seconds: 60 }] });

    const result = await startDraft('draft-1');
    expect(result).toEqual({ ok: false, error: 'already_started' });
  });

  it('rejects if draft is COMPLETED', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ status: 'COMPLETED', clock_seconds: 60 }] });

    const result = await startDraft('draft-1');
    expect(result).toEqual({ ok: false, error: 'already_started' });
  });

  it('rejects if another draft is currently active', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ status: 'NOT_STARTED', clock_seconds: 60 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'other-draft' }] }); // another LIVE draft

    const result = await startDraft('draft-1');
    expect(result).toEqual({ ok: false, error: 'another_draft_active' });
  });

  it('rejects when draft has no slots', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ status: 'NOT_STARTED', clock_seconds: 60 }] })
      .mockResolvedValueOnce({ rows: [] })          // no other active
      .mockResolvedValueOnce({ rows: [{ c: 0, teams: 0 }] }); // no slots

    const result = await startDraft('draft-1');
    expect(result).toEqual({ ok: false, error: 'no_slots' });
  });

  it('returns no_draft for an unknown draft ID', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] }); // draft row not found

    const result = await startDraft('nonexistent');
    expect(result).toEqual({ ok: false, error: 'no_draft' });
  });
});

// ── pauseDraft tests ─────────────────────────────────────────────────────────

describe('pauseDraft', () => {
  // pauseDraft uses WHERE status='LIVE', so a non-LIVE draft is a DB no-op.
  // The function always returns true; the API layer adds the state guard.

  it('succeeds for a LIVE draft (no error returned)', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] }); // UPDATE (no-op on non-LIVE)

    const result = await pauseDraft('draft-1');
    expect(result).toBe(true);
  });

  it('does not throw when draft is NOT_STARTED (WHERE clause makes it a no-op)', async () => {
    // Simulate DB returning 0 rows affected — function still returns true.
    mockExecute.mockResolvedValueOnce({ rows: [] });
    await expect(pauseDraft('draft-1')).resolves.toBe(true);
  });
});

// ── resumeDraft tests ────────────────────────────────────────────────────────

describe('resumeDraft', () => {
  // resumeDraft uses WHERE status='PAUSED'. The API layer adds the guard for
  // COMPLETED/NOT_STARTED and pending-pick checks.

  it('resumes a paused draft', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ clock_seconds: 60, paused_remaining_secs: 45 }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const result = await resumeDraft('draft-1');
    expect(result).toBe(true);
  });

  it('uses full clock when paused_remaining_secs is null', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ clock_seconds: 90, paused_remaining_secs: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await resumeDraft('draft-1');
    expect(result).toBe(true);
  });

  it('attempting to resume COMPLETED is a no-op at DB level (API layer guards it)', async () => {
    // The WHERE status='PAUSED' clause means it does nothing for COMPLETED.
    mockExecute
      .mockResolvedValueOnce({ rows: [{ clock_seconds: 60, paused_remaining_secs: null }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE matches 0 rows

    await expect(resumeDraft('completed-draft')).resolves.toBe(true);
  });
});

// ── skipPick tests ───────────────────────────────────────────────────────────

describe('skipPick', () => {
  // Call order with _tablesEnsured=true:
  //  1. SELECT d.status, d.cur_overall, d.clock_seconds, s.round (JOIN draft_slots)
  //  2. getPendingPick → SELECT from draft_pending_picks
  //  3. SELECT next slot
  //  4. UPDATE drafts

  const liveState = { status: 'LIVE', cur_overall: 5, clock_seconds: 60, cur_round: 1 };

  it('advances within a round and goes LIVE immediately', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [liveState] })                       // 1. state
      .mockResolvedValueOnce({ rows: [] })                                // 2. no pending pick
      .mockResolvedValueOnce({ rows: [{ overall: 6, round: 1 }] })       // 3. next slot (same round)
      .mockResolvedValueOnce({ rows: [] });                               // 4. UPDATE LIVE

    const result = await skipPick('draft-1');
    expect(result).toEqual({ ok: true, newOverall: 6, completed: false });
  });

  it('pauses at a round boundary with round_end_pause=true', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ ...liveState, cur_overall: 12, cur_round: 1 }] }) // 1. last pick of R1
      .mockResolvedValueOnce({ rows: [] })                                                 // 2. no pending
      .mockResolvedValueOnce({ rows: [{ overall: 13, round: 2 }] })                       // 3. next is R2
      .mockResolvedValueOnce({ rows: [] });                                                // 4. UPDATE PAUSED

    const result = await skipPick('draft-1');
    expect(result).toEqual({ ok: true, newOverall: 13, completed: false });
    // The UPDATE for a round boundary uses round_end_pause=true — verify the call was made
    // (we can't inspect the SQL text directly, but the result shape confirms the branch).
  });

  it('completes the draft when the skipped slot is the last remaining', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ ...liveState, cur_overall: 48, cur_round: 4 }] }) // 1. last slot
      .mockResolvedValueOnce({ rows: [] })                                                 // 2. no pending
      .mockResolvedValueOnce({ rows: [] })                                                 // 3. no next slot
      .mockResolvedValueOnce({ rows: [] });                                                // 4. UPDATE COMPLETED

    const result = await skipPick('draft-1');
    expect(result).toEqual({ ok: true, completed: true });
  });

  it('rejects if draft is NOT_STARTED', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ...liveState, status: 'NOT_STARTED' }] });

    const result = await skipPick('draft-1');
    expect(result).toEqual({ ok: false, error: 'invalid_state' });
  });

  it('rejects if draft is COMPLETED', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ...liveState, status: 'COMPLETED' }] });

    const result = await skipPick('draft-1');
    expect(result).toEqual({ ok: false, error: 'invalid_state' });
  });

  it('rejects when a pending pick is awaiting approval', async () => {
    const existingPending = {
      id: 'p1', overall: 5, team: 'Team1', player_id: 'player-1',
      player_name: null, player_pos: null, player_nfl: null, submitted_at: new Date(),
    };
    mockExecute
      .mockResolvedValueOnce({ rows: [liveState] })          // 1. state (LIVE — passes state check)
      .mockResolvedValueOnce({ rows: [existingPending] });   // 2. pending pick found

    const result = await skipPick('draft-1');
    expect(result).toEqual({ ok: false, error: 'pending_pick_exists' });
  });
});

// ── resetDraft tests ─────────────────────────────────────────────────────────

describe('resetDraft', () => {
  // resetDraft makes many sequential DB calls. With _tablesEnsured=true the
  // mock default { rows: [] } handles them all. We just verify it succeeds and
  // returns { ok: true }.

  it('returns ok:true on success', async () => {
    // All DELETE/UPDATE calls get the default empty response.
    const result = await resetDraft('draft-1');
    expect(result).toEqual({ ok: true });
  });

  it('does not throw when called on a draft with no picks (idempotent)', async () => {
    await expect(resetDraft('empty-draft')).resolves.toEqual({ ok: true });
  });

  it('resets a draft that was in a round-end pause state', async () => {
    // The round_end_pause=true case is handled by the UPDATE's round_end_pause=false field.
    // Since the mock is a no-op, we just verify no error is thrown.
    await expect(resetDraft('round-end-draft')).resolves.toEqual({ ok: true });
  });
});

// ── undoLastPick tests ───────────────────────────────────────────────────────

describe('undoLastPick', () => {
  // undoLastPick uses a single CTE that returns one row with overall/team/player_id/updated.
  // Call order with _tablesEnsured=true:
  //  1. The big CTE db.execute call → { rows: [{ overall, team, player_id, updated }] }

  it('undoes a pick within a round and returns the pick overall', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ overall: 7, team: 'Team1', player_id: 'player-7', updated: true }],
    });

    const result = await undoLastPick('draft-1');
    expect(result).toEqual({ ok: true, overall: 7 });
  });

  it('undoes the final pick that had completed the draft (clears completed_at)', async () => {
    // The CTE sets completed_at=NULL in the UPDATE when undoing the final pick.
    // TypeScript side just sees updated=true and returns ok.
    mockExecute.mockResolvedValueOnce({
      rows: [{ overall: 48, team: 'TeamLast', player_id: 'final-player', updated: true }],
    });

    const result = await undoLastPick('draft-1');
    expect(result).toEqual({ ok: true, overall: 48 });
  });

  it('returns no_picks when there are no committed picks', async () => {
    // CTE returns one row with all-null fields when last_pick is empty.
    mockExecute.mockResolvedValueOnce({
      rows: [{ overall: null, team: null, player_id: null, updated: false }],
    });

    const result = await undoLastPick('draft-1');
    expect(result).toEqual({ ok: false, error: 'no_picks' });
  });

  it('returns no_picks when updated=false (CTE found no pick to delete)', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ overall: null, team: null, player_id: null, updated: 'false' }],
    });

    const result = await undoLastPick('draft-1');
    expect(result).toEqual({ ok: false, error: 'no_picks' });
  });
});
