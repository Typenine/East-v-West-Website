import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DRAFT_ANIMATION_CLOCK_START_ACTION,
  DRAFT_TRADE_ALERT_AUDIO_SRC,
  draftPickAnimationDecision,
  draftPickAnimationIdentity,
  shouldInstantSubmitTopQueue,
} from '@/components/draft-overlay/draft-display-utils';

describe('draft update 156 regressions', () => {
  it('uses the existing trade alert media file directly', () => {
    const publicPath = join(process.cwd(), 'public', DRAFT_TRADE_ALERT_AUDIO_SRC.replace(/^\//, ''));
    const animationSource = readFileSync(
      join(process.cwd(), 'src/components/draft-overlay/DraftTradeAnimation.tsx'),
      'utf8',
    );

    expect(existsSync(publicPath)).toBe(true);
    expect(animationSource).toContain('new Audio(DRAFT_TRADE_ALERT_AUDIO_SRC)');
    expect(animationSource).toContain('const TRADE_ALERT_LEAD_IN_MS = 3000;');
    expect(animationSource).not.toContain('TRADE_ALERT_AUDIO_SOURCES');
  });

  it('uses one idempotent clock-start action on team and overlay clients', () => {
    const overlaySource = readFileSync(
      join(process.cwd(), 'src/components/draft-overlay/DraftOverlayLive.tsx'),
      'utf8',
    );
    const teamSource = readFileSync(
      join(process.cwd(), 'src/app/draft/room/team/page.tsx'),
      'utf8',
    );

    expect(DRAFT_ANIMATION_CLOCK_START_ACTION).toBe('anim_clock_start');
    expect(overlaySource).toContain('action: DRAFT_ANIMATION_CLOCK_START_ACTION');
    expect(teamSource).toContain('action: DRAFT_ANIMATION_CLOCK_START_ACTION');
    expect(overlaySource).not.toContain("action: 'reset_clock'");
  });

  it('animates a replacement pick at the same overall after undo', () => {
    const original = draftPickAnimationIdentity({
      overall: 8,
      madeAt: '2026-07-17T21:08:00.000Z',
      playerId: 'player-a',
    });
    const priorPickAfterUndo = draftPickAnimationIdentity({
      overall: 7,
      madeAt: '2026-07-17T21:07:00.000Z',
      playerId: 'player-z',
    });
    const replacement = draftPickAnimationIdentity({
      overall: 8,
      madeAt: '2026-07-17T21:09:00.000Z',
      playerId: 'player-b',
    });

    expect(draftPickAnimationDecision(original, original)).toBe('ignore');
    expect(draftPickAnimationDecision(original, priorPickAfterUndo)).toBe('rebase');
    expect(draftPickAnimationDecision(priorPickAfterUndo, replacement)).toBe('animate');
    expect(draftPickAnimationDecision(original, replacement)).toBe('animate');
  });

  it('only instant-submits a queued player for the authenticated team on the clock', () => {
    const ready = {
      enabled: true,
      authenticatedTeam: 'Belleview Badgers',
      onClockTeam: 'Belleview Badgers',
      draftStatus: 'LIVE',
      overall: 12,
      queueLength: 2,
      hasPendingPick: false,
      submitting: false,
      attemptedOverall: null,
    };

    expect(shouldInstantSubmitTopQueue(ready)).toBe(true);
    expect(shouldInstantSubmitTopQueue({ ...ready, enabled: false })).toBe(false);
    expect(shouldInstantSubmitTopQueue({ ...ready, onClockTeam: 'Detroit Dawgs' })).toBe(false);
    expect(shouldInstantSubmitTopQueue({ ...ready, hasPendingPick: true })).toBe(false);
    expect(shouldInstantSubmitTopQueue({ ...ready, queueLength: 0 })).toBe(false);
    expect(shouldInstantSubmitTopQueue({ ...ready, attemptedOverall: 12 })).toBe(false);
  });

  it('removes global DOM rewriting and draft polling for instant submit', () => {
    const patchSource = readFileSync(
      join(process.cwd(), 'src/components/draft/DraftSystemUpdate150ClientPatch.tsx'),
      'utf8',
    );

    expect(patchSource).not.toContain('MutationObserver');
    expect(patchSource).not.toContain('replaceTextContent');
    expect(patchSource).not.toContain('setInterval');
    expect(patchSource).not.toContain("action: 'pick'");
  });
});
