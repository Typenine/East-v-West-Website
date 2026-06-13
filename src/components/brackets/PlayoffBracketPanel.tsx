import type { ReactNode } from 'react';
import type { SleeperBracketGameWithScore } from '@/lib/utils/sleeper-api';
import PlayoffBracketBoard from '@/components/brackets/PlayoffBracketBoard';

type PlayoffBracketPanelProps = {
  title: string;
  games: SleeperBracketGameWithScore[];
  variant: 'winners' | 'losers';
  nameMap: Map<number, string>;
  seedMap: Map<number, number>;
  keyPrefix?: string;
  emptyMessage?: string;
  className?: string;
  actions?: ReactNode;
};

export default function PlayoffBracketPanel({
  title,
  games,
  variant,
  nameMap,
  seedMap,
  keyPrefix,
  emptyMessage,
  className,
  actions,
}: PlayoffBracketPanelProps) {
  return (
    <div
      className={[
        'evw-surface border p-6 rounded-[var(--radius-card)] hover-lift',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xl font-bold">{title}</h3>
        {actions}
      </div>
      <PlayoffBracketBoard
        games={games}
        variant={variant}
        nameMap={nameMap}
        seedMap={seedMap}
        keyPrefix={keyPrefix}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
