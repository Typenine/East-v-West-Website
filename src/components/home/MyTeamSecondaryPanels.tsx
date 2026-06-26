import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import {
  isTeamDataStale,
  TEAM_NEWS_CATEGORY_LABELS,
  teamTimeAgo,
} from '@/components/home/MyTeamCardParts';

export type MyTeamNewsItem = {
  title: string;
  link: string;
  sourceName: string;
  publishedAt: string | null;
  category?: string;
  matches?: Array<{ name: string; position?: string }>;
};

export default function MyTeamSecondaryPanels({
  tradeLabels,
  tradeAssetCount,
  wantedPositions,
  tradeWantsText,
  tradeBlockUpdatedAt,
  news,
}: {
  tradeLabels: string[];
  tradeAssetCount: number;
  wantedPositions: string[];
  tradeWantsText?: string;
  tradeBlockUpdatedAt: string | null;
  news: MyTeamNewsItem[];
}) {
  const tradeBlockIsStale = tradeAssetCount > 0 && isTeamDataStale(tradeBlockUpdatedAt, 14);

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div
        className="rounded-lg p-3"
        style={{
          background: 'rgba(16,185,129,0.07)',
          border: '1px solid rgba(16,185,129,0.2)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#10b981' }}>
            Your trade block
          </div>
          {tradeBlockUpdatedAt && (
            <span
              className="text-[9px]"
              style={tradeBlockIsStale ? { color: '#f59e0b' } : broadcastFaintTextStyle}
            >
              {tradeBlockIsStale ? 'Stale · ' : ''}Last updated by team {teamTimeAgo(tradeBlockUpdatedAt)}
            </span>
          )}
        </div>
        {tradeLabels.length ? (
          <>
            <div className="text-xs font-semibold mt-2" style={broadcastBodyTextStyle}>
              {tradeLabels.join(' · ')}
            </div>
            <div className="text-[11px] mt-1" style={broadcastMutedTextStyle}>
              {tradeAssetCount} asset{tradeAssetCount === 1 ? '' : 's'} listed
              {wantedPositions.length
                ? ` · Seeking ${wantedPositions.slice(0, 3).join(', ')}`
                : ''}
              {tradeWantsText ? ` · ${tradeWantsText}` : ''}
            </div>
          </>
        ) : (
          <div className="text-xs mt-2" style={broadcastMutedTextStyle}>
            Nothing is currently listed. Add players, picks, or FAAB to signal availability.
          </div>
        )}
      </div>

      <div
        className="rounded-lg p-3"
        style={{ background: PANEL.tint, border: `1px solid ${PANEL.hairline}` }}
      >
        <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
          Player news
        </div>
        {news.length ? (
          <div className="mt-2 space-y-2">
            {news.map((item) => (
              <a
                key={item.link}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="text-xs font-semibold leading-snug group-hover:underline"
                    style={broadcastBodyTextStyle}
                  >
                    {item.title}
                  </div>
                  <span className="text-[9px] shrink-0" style={broadcastFaintTextStyle}>
                    {teamTimeAgo(item.publishedAt)}
                  </span>
                </div>
                <div className="text-[9px] mt-0.5" style={broadcastFaintTextStyle}>
                  {TEAM_NEWS_CATEGORY_LABELS[item.category || ''] || 'News'} · {item.sourceName}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-xs mt-2" style={broadcastMutedTextStyle}>
            No high-priority team news in the current window.
          </div>
        )}
      </div>
    </div>
  );
}
