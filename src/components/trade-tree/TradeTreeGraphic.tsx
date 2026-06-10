'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type {
  TradeTreeEdgeModel,
  TradeTreeModel,
  TradeTreeNodeModel,
  TreeTeamRef,
} from '@/lib/trades/trade-tree-model';

/**
 * Broadcast-style trade tree: the root asset at the top, each trade it moved
 * in as a labeled connector, and the return package branching below —
 * recursively, the way national-media trade tree graphics are drawn.
 * Shares the fixed dark palette with the TradeCard broadcast layer.
 */

const PANEL = {
  card: 'linear-gradient(180deg, #181D2A 0%, #0D1118 100%)',
  border: 'rgba(255,255,255,0.09)',
  line: 'rgba(255,255,255,0.22)',
  chipBg: 'rgba(255,255,255,0.05)',
  hairline: 'rgba(255,255,255,0.07)',
  text: '#F4F6FB',
  muted: 'rgba(233,237,245,0.58)',
  faint: 'rgba(233,237,245,0.40)',
};

function TeamMark({ team, size = 20 }: { team: TreeTeamRef; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full align-middle"
      style={{
        width: size + 6,
        height: size + 6,
        background: 'rgba(255,255,255,0.06)',
        boxShadow: `inset 0 0 0 1px ${team.accent}55`,
      }}
      aria-hidden="true"
    >
      {failed ? (
        <span className="text-[10px] font-extrabold" style={{ color: team.accent }}>
          {team.name.charAt(0).toUpperCase()}
        </span>
      ) : (
        <Image
          src={team.logo}
          alt=""
          width={size}
          height={size}
          sizes={`${size}px`}
          loading="lazy"
          className="object-contain"
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function AssetChip({ node, isRoot }: { node: TradeTreeNodeModel; isRoot?: boolean }) {
  const body = (
    <div
      className={`rounded-xl px-3.5 py-2.5 text-center transition-shadow ${node.rootHref && !isRoot ? 'hover:shadow-[0_0_0_1px_rgba(255,255,255,0.35)]' : ''}`}
      style={{
        background: isRoot ? 'rgba(255,255,255,0.09)' : PANEL.chipBg,
        boxShadow: `inset 0 0 0 1px ${isRoot ? 'rgba(255,255,255,0.22)' : PANEL.border}`,
        minWidth: isRoot ? 200 : 152,
        maxWidth: 230,
      }}
    >
      <div className="flex items-center justify-center gap-1.5">
        <span
          className="inline-flex h-4 items-center rounded px-1 text-[9px] font-bold uppercase tracking-wider"
          style={{
            color: PANEL.muted,
            boxShadow: `inset 0 0 0 1px ${PANEL.line}`,
          }}
        >
          {node.badge}
        </span>
        <span
          className={`font-extrabold tracking-tight ${isRoot ? 'text-base' : 'text-[13px]'} leading-tight`}
          style={{ color: PANEL.text }}
        >
          {node.label}
        </span>
      </div>
      {node.sub ? (
        <div className="mt-0.5 text-[10px] font-medium leading-3" style={{ color: PANEL.faint }}>
          {node.sub}
        </div>
      ) : null}
      {node.became ? (
        <div className="mt-1 text-[11px] font-semibold leading-4" style={{ color: PANEL.muted }}>
          ↳ {node.became.badge} {node.became.label}
        </div>
      ) : null}
    </div>
  );

  if (node.rootHref && !isRoot) {
    return (
      <Link
        href={node.rootHref}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-xl"
        title={`Re-root the tree on ${node.label}`}
        aria-label={`Re-root the tree on ${node.label}`}
      >
        {body}
      </Link>
    );
  }
  return body;
}

function Stem() {
  return <span className="block h-3 w-px" style={{ background: PANEL.line }} aria-hidden="true" />;
}

function EdgePill({ edge, showByTeam }: { edge: TradeTreeEdgeModel; showByTeam: boolean }) {
  const mates = edge.packageMates ?? [];
  const matesLabel =
    mates.length === 0
      ? null
      : mates.length <= 2
        ? mates.join(', ')
        : `${mates.slice(0, 2).join(', ')} +${mates.length - 2} more`;
  return (
    <Link
      href={`/trades/${edge.tradeId}`}
      className="block rounded-lg px-3 py-1.5 text-center transition-shadow hover:shadow-[0_0_0_1px_rgba(255,255,255,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      style={{ background: 'rgba(255,255,255,0.03)', boxShadow: `inset 0 0 0 1px ${PANEL.hairline}` }}
      title="View this trade"
    >
      <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: PANEL.faint }}>
          To
        </span>
        <TeamMark team={edge.toTeam} size={16} />
        <span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: PANEL.text }}>
          {edge.toTeam.name}
        </span>
        <span className="text-[10px] font-semibold tabular-nums" style={{ color: PANEL.faint }}>
          · {edge.dateLabel}
        </span>
      </span>
      {matesLabel ? (
        <span className="mt-0.5 block text-[10px] leading-3" style={{ color: PANEL.faint }}>
          w/ {matesLabel}
        </span>
      ) : null}
      <span
        className="mt-1 block text-[9px] font-bold uppercase tracking-[0.18em]"
        style={{ color: edge.byTeam.accent }}
      >
        {showByTeam ? `${edge.byTeam.name} received` : 'In return'}
      </span>
    </Link>
  );
}

function Branch({ edge, showByTeam }: { edge: TradeTreeEdgeModel; showByTeam: boolean }) {
  return (
    <>
      <Stem />
      <EdgePill edge={edge} showByTeam={showByTeam} />
      <ul className="evw-ttree-children">
        {edge.received.length ? (
          edge.received.map((child, i) => <NodeBranch key={`${child.id}-${i}`} node={child} />)
        ) : (
          <li className="evw-ttree-node">
            <div className="px-3 py-2 text-xs" style={{ color: PANEL.faint }}>
              Nothing received
            </div>
          </li>
        )}
      </ul>
    </>
  );
}

function NodeBranch({ node }: { node: TradeTreeNodeModel }) {
  return (
    <li className="evw-ttree-node">
      <AssetChip node={node} />
      {node.trade ? <Branch edge={node.trade} showByTeam={false} /> : null}
    </li>
  );
}

export default function TradeTreeGraphic({ tree }: { tree: TradeTreeModel }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Wide trees overflow horizontally; start centered on the root.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, [tree]);

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: PANEL.card, boxShadow: `inset 0 0 0 1px ${PANEL.border}, 0 4px 18px rgba(0,0,0,0.30)` }}
    >
      <div
        className="flex items-center justify-between gap-3 px-5 py-3"
        style={{ background: 'rgba(255,255,255,0.025)', borderBottom: `1px solid ${PANEL.hairline}` }}
      >
        <span className="text-[11px] font-extrabold uppercase tracking-[0.3em]" style={{ color: PANEL.text }}>
          Trade Tree
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: PANEL.faint }}>
          Tap any asset to re-root
        </span>
      </div>

      <div ref={scrollRef} className="overflow-x-auto px-4 py-6">
        {tree.moves.length === 0 ? (
          <div className="py-6 text-center text-sm" style={{ color: PANEL.muted }}>
            No trades found for {tree.root.label}.
          </div>
        ) : (
          <div className="evw-ttree mx-auto w-max min-w-full">
            <div className="flex flex-col items-center">
              <AssetChip node={tree.root} isRoot />
              {tree.moves.length === 1 ? (
                <Branch edge={tree.moves[0]} showByTeam />
              ) : (
                <ul className="evw-ttree-children">
                  {tree.moves.map((move) => (
                    <li key={move.tradeId} className="evw-ttree-node">
                      <Branch edge={move} showByTeam />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {tree.truncated ? (
          <div className="mt-4 text-center text-[11px]" style={{ color: PANEL.faint }}>
            Some branches were cut at the current depth — increase depth to follow them further.
          </div>
        ) : null}
      </div>

      {/*

        Connector lines: classic CSS org-chart pattern, scoped to .evw-ttree.

        - each children row (ul) drops a stem from its parent
        - each child (li) draws half-width rails toward its siblings and a
          drop line down to its own content
      */}
      <style>{`
        .evw-ttree ul.evw-ttree-children {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding-top: 16px;
          position: relative;
        }
        .evw-ttree ul.evw-ttree-children::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          width: 1px;
          height: 16px;
          background: ${PANEL.line};
        }
        .evw-ttree li.evw-ttree-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          padding: 16px 8px 0 8px;
          list-style: none;
        }
        .evw-ttree li.evw-ttree-node::before,
        .evw-ttree li.evw-ttree-node::after {
          content: '';
          position: absolute;
          top: 0;
          right: 50%;
          width: 50%;
          height: 16px;
          border-top: 1px solid ${PANEL.line};
        }
        .evw-ttree li.evw-ttree-node::after {
          right: auto;
          left: 50%;
          border-left: 1px solid ${PANEL.line};
        }
        .evw-ttree li.evw-ttree-node:only-child::before,
        .evw-ttree li.evw-ttree-node:only-child::after {
          display: none;
        }
        .evw-ttree li.evw-ttree-node:only-child {
          padding-top: 0;
        }
        .evw-ttree li.evw-ttree-node:first-child::before,
        .evw-ttree li.evw-ttree-node:last-child::after {
          border: 0 none;
        }
        .evw-ttree li.evw-ttree-node:last-child::before {
          border-right: 1px solid ${PANEL.line};
          border-radius: 0 6px 0 0;
        }
        .evw-ttree li.evw-ttree-node:first-child::after {
          border-radius: 6px 0 0 0;
        }
      `}</style>
    </div>
  );
}
