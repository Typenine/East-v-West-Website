import type { Trade, TradeAsset } from '@/lib/utils/trades';

/**
 * Asset identity + routing helpers shared by the trade feed (per-asset
 * "from X" attribution on multi-team trades) and the trade tree builder.
 * Pure functions over the Trade shape — no I/O.
 */

export function normalizeKeyPart(value: string | undefined): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Stable matching keys for an asset. Picks get multiple keys (draft slot and
 * original owner) because different trades carry different metadata for the
 * same pick; a pick that became a player also matches that player's key so
 * lineage continues through the draft.
 */
export function keysForAsset(a: TradeAsset): string[] {
  if (a.type === 'player') {
    return a.playerId ? [`p:${a.playerId}`] : [`pn:${normalizeKeyPart(a.name)}`];
  }
  if (a.type === 'pick') {
    const season = String(a.year ?? a.pick?.season ?? '');
    const round = Number(a.round ?? a.pick?.round);
    if (!season || !Number.isFinite(round)) return [];
    const keys: string[] = [];
    const slot = a.draftSlot ?? a.pickInRound;
    if (typeof slot === 'number') keys.push(`k:${season}-${round}-s${slot}`);
    const owner = a.originalOwner ?? a.pick?.originalOwner;
    if (owner) keys.push(`k:${season}-${round}-o${normalizeKeyPart(owner)}`);
    if (a.becamePlayerId) keys.push(`p:${a.becamePlayerId}`);
    return keys;
  }
  return []; // FAAB has no stable identity across trades
}

export function keysIntersect(a: string[], b: string[]): boolean {
  return a.some((k) => b.includes(k));
}

/** Assets a team sent away in a trade (uses computed `gives` when present). */
export function assetsGivenBy(trade: Trade, teamName: string): TradeAsset[] {
  const team = trade.teams.find((t) => t.name === teamName);
  if (!team) return [];
  if (team.gives && team.gives.length) return team.gives;
  // Manual trades have no `gives`; for two-team trades the other side's
  // received assets are what this team gave.
  if (trade.teams.length === 2) {
    const other = trade.teams.find((t) => t.name !== teamName);
    return other?.assets ?? [];
  }
  // 3+ team trade without `gives` (e.g. admin manual trades / overrides):
  // infer what this team gave by elimination across all teams' received
  // assets. Regression case (3-team, May 3 2026: Belleview Badgers /
  // Mt. Lebanon Cake Eaters / The Lone Ginger): the 2026 1st Round Pick
  // received by the Badgers must be attributed to The Lone Ginger — not the
  // Cake Eaters — and previously this function returned [] here, dropping
  // the giver from the trade tree entirely.
  const inferred: TradeAsset[] = [];
  for (const other of trade.teams) {
    if (other.name === teamName) continue;
    for (const asset of other.assets) {
      if (inferSenderOfReceivedAsset(trade, other.name, asset) === teamName) {
        inferred.push(asset);
      }
    }
  }
  return inferred;
}

/**
 * Who sent `asset` to `receiverName`, resolved in priority order:
 * 1. The participant whose explicit `gives` contains the asset.
 * 2. Elimination: the only participant that neither received the asset nor
 *    has an explicit `gives` ruling it out.
 * 3. For picks, the participant whose name matches the pick's original owner
 *    (you trade your own slot unless a prior trade moved it, which `gives`
 *    data on the earlier trade captures).
 * Returns null when the sender is genuinely ambiguous — never guesses.
 */
function inferSenderOfReceivedAsset(trade: Trade, receiverName: string, asset: TradeAsset): string | null {
  const keys = keysForAsset(asset);
  if (!keys.length) return null;
  // 1) Explicit attribution from `gives`.
  for (const team of trade.teams) {
    if (team.name === receiverName) continue;
    if ((team.gives ?? []).some((g) => keysIntersect(keysForAsset(g), keys))) return team.name;
  }
  // 2) Elimination: exclude the receiver, teams that received the asset
  // themselves, and teams whose explicit `gives` doesn't include it.
  const candidates = trade.teams.filter(
    (t) =>
      t.name !== receiverName &&
      !(t.gives && t.gives.length) &&
      !t.assets.some((a) => keysIntersect(keysForAsset(a), keys))
  );
  if (candidates.length === 1) return candidates[0].name;
  // 3) Pick tiebreaker: original owner among the remaining candidates.
  if (asset.type === 'pick') {
    const ownerKey = normalizeKeyPart(asset.originalOwner ?? asset.pick?.originalOwner);
    if (ownerKey) {
      const owners = candidates.filter((t) => normalizeKeyPart(t.name) === ownerKey);
      if (owners.length === 1) return owners[0].name;
    }
  }
  return null;
}

/**
 * The team that sent `asset` to `receiverName` in this trade, when it can be
 * determined. For two-team trades it's always the other side; for multi-team
 * trades it's the participant whose `gives` contains the matching asset.
 */
export function senderOfAsset(trade: Trade, receiverName: string, asset: TradeAsset): string | null {
  if (trade.teams.length === 2) {
    return trade.teams.find((t) => t.name !== receiverName)?.name ?? null;
  }
  if (asset.type === 'faab') {
    // FAAB has no stable identity; attribute by amount when unambiguous.
    const candidates = trade.teams.filter(
      (t) =>
        t.name !== receiverName &&
        (t.gives ?? []).some((g) => g.type === 'faab' && g.faabAmount === asset.faabAmount)
    );
    return candidates.length === 1 ? candidates[0].name : null;
  }
  return inferSenderOfReceivedAsset(trade, receiverName, asset);
}
