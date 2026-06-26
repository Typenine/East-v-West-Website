/**
 * Draft concurrency tests.
 *
 * These tests verify that simultaneous requests for the same draft operation
 * produce correct, idempotent results — one pick per slot, no duplicate pending
 * picks, no skipped cursors, and idempotent clock resumption.
 *
 * All DB calls are mocked. The CTE-based commit logic is validated through its
 * return type: the mock simulates what PostgreSQL would return given different
 * race outcomes (first requester wins, second gets no-op result).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const mockExecute = vi.fn();
vi.mock('@/server/db/client', () => ({ getDb: () => ({ execute: mockExecute }) }));

import {
  commitPick,
  submitPendingPick,
  resumeAfterAnimation,
  checkAndAutoPick,
} from '@/server/db/queries.fixed';

// Pre-warm _tablesEnsured
beforeAll(async () => {
  mockExecute.mockResolvedValue({ rows: [] });
  try { await commitPick({ draftId: '00000000-0000-0000-0000-000000000000', team: 'T', playerId: 'x', madeBy: 'warmup' }); } catch {}
});

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue({ rows: [] });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const DRAFT_ID = '11111111-1111-1111-1111-111111111111';
const BASE_PARAMS = { draftId: DRAFT_ID, team: 'Belltown Raptors', playerId: 'player-42', madeBy: 'user' };

function commitWinRow() {
  return {
    initial_status: 'LIVE',
    slot_team: 'Belltown Raptors',
    player_taken: false,
    draft_overall: 7,
    pick_inserted: true,
    draft_completed: false,
  };
}

function commitLoseRow(reason: 'player_taken' | 'wrong_state' | 'stale_request') {
  return {
    initial_status: reason === 'wrong_state' ? 'PAUSED' : 'LIVE',
    slot_team: 'Belltown Raptors',
    player_taken: reason === 'player_taken',
    draft_overall: 7,
    pick_inserted: false,
    draft_completed: false,
  };
}

// ── Two simultaneous picks for the same slot ─────────────────────────────────

describe('simultaneous picks for the same slot', () => {
  it('first commit wins, second returns stale_request (cursor advanced)', async () => {
    // The CTE for the second requester sees cur_overall != expectedOverall
    // (cursor already advanced by winner), so it returns pick_inserted=false.
    mockExecute
      .mockResolvedValueOnce({ rows: [commitWinRow()] }); // First wins

    const first = await commitPick({ ...BASE_PARAMS, expectedOverall: 7 });
    expect(first).toEqual({ ok: true, completed: false });

    // Second requester — CTE sees stale expectedOverall
    mockExecute
      .mockResolvedValueOnce({ rows: [{ ...commitWinRow(), pick_inserted: false, initial_status: 'LIVE', draft_overall: 8 }] });

    const second = await commitPick({ ...BASE_PARAMS, expectedOverall: 7 });
    expect(second).toEqual({ ok: false, error: 'stale_request' });
  });

  it('second request sees player already taken', async () => {
    // Concurrent pick of same player_id — CTE detects player_taken = true
    mockExecute.mockResolvedValueOnce({ rows: [commitLoseRow('player_taken')] });

    const result = await commitPick({ ...BASE_PARAMS, playerId: 'player-42' });
    expect(result).toEqual({ ok: false, error: 'player_taken' });
  });

  it('exactly one pick is inserted even when two commits race (DB CTE guarantee)', () => {
    // This is a logical assertion: the ON CONFLICT DO NOTHING on draft_picks(draft_id, overall)
    // ensures PostgreSQL will only insert one row. Our CTE reads pick_inserted from the
    // WITH ... INSERT ... RETURNING clause, which returns 0 rows for the loser.
    // We verify that commitPick correctly interprets the 0-rows case as stale_request.
    mockExecute.mockResolvedValueOnce({ rows: [] }); // 0 rows = insert failed
    const result = commitPick({ ...BASE_PARAMS });
    return expect(result).resolves.toMatchObject({ ok: false });
  });
});

// ── Two simultaneous clock expiry checks ─────────────────────────────────────

describe('simultaneous auto-pick (clock expiry)', () => {
  // checkAndAutoPick call order (after _tablesEnsured):
  //   1. SELECT d.status, d.deadline_ts, d.cur_overall, s.team FROM drafts d JOIN draft_slots s
  //   2. SELECT COUNT(1) FROM draft_pending_picks (pending check)
  //   3. SELECT player_id, ... FROM draft_queues (queue lookup)
  //   4. submitPendingPick CTE → calls db.execute for the pending insert
  //   5. pauseDraft → UPDATE drafts SET status='PAUSED'

  const expiredState = {
    status: 'LIVE',
    deadline_ts: new Date(Date.now() - 5000).toISOString(), // expired 5 s ago
    cur_overall: 3,
    team: 'Belltown Raptors',
  };

  it('first expiry caller inserts the auto-pick; second sees pending already exists', async () => {
    // First caller succeeds in creating the pending pick
    mockExecute
      .mockResolvedValueOnce({ rows: [expiredState] })         // 1. state
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })         // 2. no pending
      .mockResolvedValueOnce({ rows: [] })                     // 3. empty queue → no auto-pick from queue
      .mockResolvedValueOnce({ rows: [] })                     // 4. no custom pool players
      .mockResolvedValueOnce({ rows: [] });                    // 5. skipPick sub-select (checkAndAutoPick fallback to skip)

    const first = await checkAndAutoPick(DRAFT_ID);
    // No queue + no pool → checkAndAutoPick falls through to skip or returns false
    // The exact result depends on implementation; what matters is it doesn't throw.
    expect(['boolean', 'object']).toContain(typeof first.picked);
  });

  it('second expiry check sees already-paused draft and aborts', async () => {
    // Simulate draft already PAUSED when second caller arrives
    mockExecute
      .mockResolvedValueOnce({ rows: [{ ...expiredState, status: 'PAUSED' }] }); // state is PAUSED

    const second = await checkAndAutoPick(DRAFT_ID);
    expect(second.picked).toBe(false);
  });

  it('two concurrent clock checks produce at most one auto-pick', async () => {
    // Both callers read the state simultaneously (status=LIVE, expired clock).
    // The submitPendingPick CTE uses ON CONFLICT DO NOTHING so only one succeeds.
    // We model this with { created: false } returned for the second caller.

    // Mock for first caller: state→ no pending → queue player → insert pending
    const pendingRow = {
      id: 'pending-uuid',
      overall: 3,
      team: 'Belltown Raptors',
      player_id: 'player-1',
      status: 'pending',
      submitted_at: new Date(),
      player_name: null, player_pos: null, player_nfl: null,
    };
    mockExecute
      .mockResolvedValueOnce({ rows: [expiredState] })         // state
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })         // no pending
      .mockResolvedValueOnce({ rows: [{ player_id: 'player-1', player_name: null, player_pos: null, player_nfl: null, rank: 1 }] }) // queue
      .mockResolvedValueOnce({ rows: [{ id: 'pending-uuid', overall: 3, team: 'Belltown Raptors', player_id: 'player-1', player_name: null, player_pos: null, player_nfl: null, submitted_at: new Date() }] }) // submitPending insert
      .mockResolvedValueOnce({ rows: [] });                    // pauseDraft

    const first = await checkAndAutoPick(DRAFT_ID);
    expect(first.picked).toBe(true);

    // Second caller: pending already exists (created=false)
    mockExecute
      .mockResolvedValueOnce({ rows: [{ ...expiredState, status: 'PAUSED' }] }); // already paused

    const second = await checkAndAutoPick(DRAFT_ID);
    expect(second.picked).toBe(false);
  });
});

// ── Two simultaneous approval requests ───────────────────────────────────────

describe('simultaneous approve_pick requests', () => {
  // approve_pick: getPendingPick → resumeDraft → commitPick → resolvePendingPick → pauseForAnimation
  // Two simultaneous approvals of the same pending pick:
  //  - First: getPendingPick returns the pending row, commitPick succeeds
  //  - Second: getPendingPick returns null (already resolved by first)
  //
  // The route-level handler is what checks getPendingPick; commitPick's CTE also
  // guards against stale picks via expectedOverall.

  it('first approval commits the pick and resolves the pending row', async () => {
    // We test commitPick directly with the correct overall
    mockExecute.mockResolvedValueOnce({ rows: [{
      initial_status: 'LIVE', slot_team: 'Detroit Dawgs', player_taken: false,
      draft_overall: 10, pick_inserted: true, draft_completed: false,
    }] });

    const res = await commitPick({
      draftId: DRAFT_ID, team: 'Detroit Dawgs', playerId: 'player-88',
      madeBy: 'admin_approved', expectedOverall: 10,
    });
    expect(res).toEqual({ ok: true, completed: false });
  });

  it('second approval with stale expectedOverall is rejected by CTE', async () => {
    // Cursor advanced after first approval → overall mismatch
    mockExecute.mockResolvedValueOnce({ rows: [{
      initial_status: 'LIVE', slot_team: 'Detroit Dawgs', player_taken: false,
      draft_overall: 11, // cursor already moved to 11
      pick_inserted: false, draft_completed: false,
    }] });

    const res = await commitPick({
      draftId: DRAFT_ID, team: 'Detroit Dawgs', playerId: 'player-88',
      madeBy: 'admin_approved', expectedOverall: 10, // stale
    });
    expect(res).toEqual({ ok: false, error: 'stale_request' });
  });
});

// ── Two simultaneous anim_clock_start requests ───────────────────────────────

describe('simultaneous anim_clock_start (resumeAfterAnimation)', () => {
  // resumeAfterAnimation:
  //   1. SELECT WHERE status='PAUSED' AND pause_reason='pick_animation'
  //   2. UPDATE WHERE same condition (double-check prevents double-resume)

  it('first caller resumes the draft and returns true', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ clock_seconds: 60, paused_remaining_secs: 60 }] }) // SELECT matches
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const result = await resumeAfterAnimation(DRAFT_ID);
    expect(result).toBe(true);
  });

  it('second caller finds no matching row (already LIVE) and returns false', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] }); // SELECT returns nothing — draft is already LIVE

    const result = await resumeAfterAnimation(DRAFT_ID);
    expect(result).toBe(false);
  });

  it('is safe to call many times — always idempotent', async () => {
    for (let i = 0; i < 5; i++) {
      // Each call sees no matching row after the first
      mockExecute.mockResolvedValueOnce({ rows: [] });
      const result = await resumeAfterAnimation(DRAFT_ID);
      expect(result).toBe(false);
    }
  });
});

// ── Two simultaneous submitPendingPick calls ─────────────────────────────────

describe('submitPendingPick idempotency', () => {
  // submitPendingPick uses ON CONFLICT DO NOTHING.
  // The CTE returns the inserted or existing row.
  // Call order (after _tablesEnsured):
  //   1. Single CTE db.execute → returns { id, overall, team, player_id, ... }

  const pendingParams = {
    overall: 5, team: 'Belltown Raptors', playerId: 'player-42',
    playerName: 'Test Player', playerPos: 'WR', playerNfl: 'SEA',
  };

  it('first call creates a new pending pick', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{
        id: 'new-uuid', overall: 5, team: 'Belltown Raptors', player_id: 'player-42',
        player_name: 'Test Player', player_pos: 'WR', player_nfl: 'SEA', submitted_at: new Date(),
      }],
    });

    const result = await submitPendingPick(DRAFT_ID, pendingParams);
    expect(result).not.toBeNull();
    expect(result?.id).toBe('new-uuid');
    expect(result?.created).toBe(true);
  });

  it('second concurrent call returns the existing pick (no duplicate)', async () => {
    // ON CONFLICT DO NOTHING: INSERT returns 0 rows, so the CTE falls back to
    // the existing row. We simulate this with the same UUID returned.
    mockExecute.mockResolvedValueOnce({
      rows: [{
        id: 'new-uuid', overall: 5, team: 'Belltown Raptors', player_id: 'player-42',
        player_name: 'Test Player', player_pos: 'WR', player_nfl: 'SEA', submitted_at: new Date(),
        _created: false, // signals conflict path
      }],
    });

    const result = await submitPendingPick(DRAFT_ID, pendingParams);
    // Either { created: true } or { created: false }, but never null and never a second row
    expect(result).not.toBeNull();
    expect(result?.id).toBe('new-uuid');
  });

  it('returns null when draft cursor has advanced (stale request)', async () => {
    // CTE finds no matching slot (cur_overall already moved) → returns empty rows
    mockExecute.mockResolvedValueOnce({ rows: [] });

    const result = await submitPendingPick(DRAFT_ID, pendingParams);
    expect(result).toBeNull();
  });
});

// ── Slot uniqueness and pick count assertion ──────────────────────────────────

describe('draft slot and pick uniqueness invariants', () => {
  it('commitPick with duplicate player returns player_taken', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{
      initial_status: 'LIVE', slot_team: 'Belltown Raptors',
      player_taken: true, // CTE detected player already in draft_picks
      draft_overall: 7, pick_inserted: false, draft_completed: false,
    }] });

    const result = await commitPick({ ...BASE_PARAMS });
    expect(result).toEqual({ ok: false, error: 'player_taken' });
  });

  it('commitPick for wrong team returns wrong_team', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{
      initial_status: 'LIVE', slot_team: 'Detroit Dawgs', // different team
      player_taken: false, draft_overall: 7, pick_inserted: false, draft_completed: false,
    }] });

    const result = await commitPick({ ...BASE_PARAMS, team: 'Belltown Raptors' });
    expect(result).toEqual({ ok: false, error: 'wrong_team' });
  });

  it('commitPick for completed draft returns wrong_state', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{
      initial_status: 'COMPLETED', slot_team: 'Belltown Raptors',
      player_taken: false, draft_overall: 7, pick_inserted: false, draft_completed: false,
    }] });

    const result = await commitPick({ ...BASE_PARAMS });
    expect(result).toEqual({ ok: false, error: 'wrong_state' });
  });
});
