import {
  createPlayerPool,
  replacePlayerPoolRows,
  setDraftPlayers,
  setDraftWorkspaceDefaultPool,
} from '@/server/db/queries';
import { buildSleeperRookieDefPool, sleeperPoolLabel } from '@/lib/draft/sleeper-player-pool';

export async function applySleeperRookieDefPool(draftId: string, year: number) {
  const players = await buildSleeperRookieDefPool(year);
  const label = sleeperPoolLabel(year);
  const poolId = await createPlayerPool(label);
  const rows = players.map((player) => ({
    id: player.id,
    name: player.name,
    pos: player.pos,
    nfl: player.nfl,
    rank: player.rank,
    meta: player.meta,
  }));
  await replacePlayerPoolRows(poolId, rows);
  await setDraftWorkspaceDefaultPool(poolId);
  await setDraftPlayers(draftId, rows);
  return {
    poolId,
    label,
    count: rows.length,
    rookieCount: rows.filter((r) => r.pos !== 'DEF').length,
    defCount: rows.filter((r) => r.pos === 'DEF').length,
  };
}
