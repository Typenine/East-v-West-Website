/**
 * View models for the broadcast-style trade tree (asset lineage).
 *
 * Built server-side (src/server/trade-tree.ts); rendered by
 * src/components/trade-tree/TradeTreeGraphic.tsx. Must stay client-safe.
 *
 * Shape: a root asset, the trade(s) in which it moved, and — recursively —
 * what the team that gave it up received in return, following every piece
 * of the package forward through later trades (including picks that became
 * players and were flipped again).
 */

export type TreeTeamRef = {
  name: string;
  logo: string;
  accent: string;
};

export type TradeTreeNodeModel = {
  /** Stable asset node id (player:<id> / pick:<season>-<round>-<slot>) */
  id: string;
  kind: 'player' | 'pick' | 'faab';
  /** Chip text: "WR", "R1", "FAAB" */
  badge: string;
  /** "Justin Jefferson", "2026 1st Round Pick", "$23 FAAB" */
  label: string;
  /** "MIN", "Pick 1.05", ... */
  sub?: string;
  /** Pick outcome, when the pick was used on a player */
  became?: { badge: string; label: string };
  /** Tracker link to re-root the tree on this asset */
  rootHref?: string;
  /** The onward trade in which the holding team sent this asset away */
  trade?: TradeTreeEdgeModel;
};

export type TradeTreeEdgeModel = {
  tradeId: string;
  date: string;
  dateLabel: string;
  /** Team that traded the parent asset away (its return package is below) */
  byTeam: TreeTeamRef;
  /** Team that acquired the parent asset */
  toTeam: TreeTeamRef;
  /** Other assets that moved together with the parent asset */
  packageMates?: string[];
  /** What byTeam received in return — the child branches */
  received: TradeTreeNodeModel[];
};

export type TradeTreeModel = {
  root: TradeTreeNodeModel;
  /** Chronological trades in which the root asset itself moved */
  moves: TradeTreeEdgeModel[];
  /** True when depth limiting cut branches short */
  truncated: boolean;
};
