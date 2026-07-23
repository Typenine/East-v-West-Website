import type { NextConfig } from "next";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PREVIOUS_DRAFT_BOARD_MARKER = 'data-previous-draft-board="full"';

function replacePreviousDraftSourceOnce(source: string, oldValue: string, newValue: string, label: string): string {
  const matches = source.split(oldValue).length - 1;
  if (matches !== 1) {
    throw new Error(`[previous-draft-board] ${label}: expected one match, found ${matches}`);
  }
  return source.replace(oldValue, () => newValue);
}

function applyPreviousDraftBoardPatch(): void {
  const targetPath = resolve(process.cwd(), 'src/app/draft/DraftContent.tsx');
  let source = readFileSync(targetPath, 'utf8');

  if (source.includes(PREVIOUS_DRAFT_BOARD_MARKER)) {
    return;
  }

  source = replacePreviousDraftSourceOnce(
    source,
    "  const [draftView, setDraftView] = useState<'teams' | 'linear'>('teams');",
    "  const [draftView, setDraftView] = useState<'teams' | 'linear' | 'board'>('teams');",
    'draft view state',
  );

  const pastStart = source.indexOf("              id: 'past',");
  const pastEnd = source.indexOf("              id: 'team-prospect-draftboard',", pastStart);
  if (pastStart < 0 || pastEnd < 0) {
    throw new Error('[previous-draft-board] previous drafts section not found');
  }

  let pastSection = source.slice(pastStart, pastEnd);
  pastSection = replacePreviousDraftSourceOnce(
    pastSection,
    '                          <div className="flex items-center justify-between mb-3">',
    '                          <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-center sm:justify-between">',
    'responsive view controls',
  );
  pastSection = replacePreviousDraftSourceOnce(
    pastSection,
    "                              {draftView === 'teams' ? 'Team Hauls' : 'Linear Picks'}",
    "                              {draftView === 'teams' ? 'Team Hauls' : draftView === 'linear' ? 'Linear Picks' : 'Full Draft Board'}",
    'view heading',
  );

  const linearButton = String.raw`                              <Button
                                variant={draftView === 'linear' ? 'primary' : 'ghost'}
                                size="sm"
                                className="px-3"
                                onClick={() => setDraftView('linear')}
                              >
                                Linear
                              </Button>`;
  const buttonsWithBoard = linearButton + String.raw`
                              <Button
                                variant={draftView === 'board' ? 'primary' : 'ghost'}
                                size="sm"
                                className="px-3"
                                onClick={() => setDraftView('board')}
                              >
                                Full Board
                              </Button>`;
  pastSection = replacePreviousDraftSourceOnce(pastSection, linearButton, buttonsWithBoard, 'full board button');
  pastSection = replacePreviousDraftSourceOnce(
    pastSection,
    String.raw`                            </div>
                          ) : (
                            <Card className="overflow-x-auto">`,
    String.raw`                            </div>
                          ) : draftView === 'linear' ? (
                            <Card className="overflow-x-auto">`,
    'linear branch',
  );
  pastSection = replacePreviousDraftSourceOnce(
    pastSection,
    String.raw`                                })()}
                              </CardContent>
                            </Card>
                          )}`,
    String.raw`                                })()}
                              </CardContent>
                            </Card>
                          ) : (
                            <FullDraftBoard
                              data={draftsByYear[selectedYear] as DraftYearData}
                              selectedYear={selectedYear}
                            />
                          )}`,
    'full board branch',
  );

  source = source.slice(0, pastStart) + pastSection + source.slice(pastEnd);

  const fullBoardComponent = String.raw`
function FullDraftBoard({ data, selectedYear }: { data: DraftYearData; selectedYear: string }) {
  const roundNumbers = Array.from(new Set(data.linear_picks.map((pick) => pick.round))).sort((a, b) => a - b);
  const rounds = roundNumbers.length > 0
    ? roundNumbers
    : Array.from({ length: data.rounds }, (_, index) => index + 1);
  const columnMinWidth = 255;
  const boardMinWidth = Math.max(rounds.length * columnMinWidth + Math.max(0, rounds.length - 1) * 12, columnMinWidth);

  return (
    <Card data-previous-draft-board="full">
      <CardContent>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">{selectedYear} draft board</div>
            <p className="mt-1 text-xs text-[var(--muted)]">All rounds are shown side by side. Scroll horizontally on smaller screens.</p>
          </div>
          <div className="text-xs font-semibold text-[var(--muted)]">{data.linear_picks.length} selections</div>
        </div>
        <div className="overflow-x-auto pb-2">
          <div
            className="grid gap-3"
            style={{
              minWidth: String(boardMinWidth) + 'px',
              gridTemplateColumns: 'repeat(' + rounds.length + ', minmax(' + columnMinWidth + 'px, 1fr))',
            }}
          >
            {rounds.map((round) => {
              const picks = data.linear_picks
                .filter((pick) => pick.round === round)
                .sort((a, b) => a.pick - b.pick);
              return (
                <section key={round} aria-label={'Round ' + round} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]/45">
                  <div className="flex items-center justify-between border-b border-[var(--border)] bg-black/15 px-3 py-2">
                    <h4 className="text-sm font-bold text-[var(--text)]">Round {round}</h4>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{picks.length} picks</span>
                  </div>
                  <ol className="divide-y divide-[var(--border)]">
                    {picks.map((pick) => {
                      const colors = getTeamColors(pick.team);
                      const logoStyle = getTeamColorStyle(pick.team, 'primary');
                      const tint = /^#[0-9a-f]{6}$/i.test(colors.primary) ? colors.primary + '14' : undefined;
                      const priceEnabled = selectedYear === '2023' && data.isAuction && pick.price != null;
                      return (
                        <li
                          key={pick.pick_no}
                          className="min-h-[76px] px-2.5 py-2"
                          style={{
                            borderLeft: '3px solid ' + (colors.secondary || colors.primary),
                            backgroundColor: tint,
                          }}
                        >
                          <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
                            <span>{round + '.' + String(pick.pick).padStart(2, '0')}</span>
                            <span>{'#' + pick.pick_no}</span>
                          </div>
                          <div className="mt-1.5 flex min-w-0 items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full" style={logoStyle}>
                              <Image
                                src={getTeamLogoPath(pick.team)}
                                alt={pick.team + ' logo'}
                                width={24}
                                height={24}
                                className="object-contain"
                                onError={(event) => { (event.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-[var(--text)]">{pick.player}</span>
                                {pick.pos ? (
                                  <span className="shrink-0 rounded bg-black/15 px-1 py-0.5 text-[9px] font-bold text-[var(--muted)]">{pick.pos}</span>
                                ) : null}
                              </div>
                              <div className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{pick.team}</div>
                            </div>
                            {priceEnabled ? (
                              <span className="shrink-0 rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--text)]">{'$' + pick.price}</span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

`;

  source = replacePreviousDraftSourceOnce(
    source,
    'type DraftOrderHistoryHop = {',
    fullBoardComponent + 'type DraftOrderHistoryHop = {',
    'board component',
  );

  writeFileSync(targetPath, source, 'utf8');
  console.log('[previous-draft-board] Added the full historical draft board view.');
}

applyPreviousDraftBoardPatch();

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Canonical compatibility routes. Keep old bookmarks and any remaining
      // legacy links pointed at the live pages instead of obsolete screens.
      {
        source: '/trade-block',
        destination: '/trades/block',
        permanent: true,
      },
      {
        source: '/brackets',
        destination: '/history?tab=brackets',
        permanent: true,
      },
      {
        source: '/trades/trees',
        destination: '/trades/tracker',
        permanent: true,
      },
      {
        source: '/history/champions',
        destination: '/history?tab=champions',
        permanent: true,
      },
      {
        source: '/history/records',
        destination: '/history?tab=records',
        permanent: true,
      },

      // Around the League previously generated team-name slugs, while the
      // actual team route expects the current Sleeper roster ID. Preserve those
      // links and route each slug to the correct live team dashboard.
      {
        source: '/teams/belltown-raptors',
        destination: '/teams/1',
        permanent: true,
      },
      {
        source: '/teams/double-trouble',
        destination: '/teams/2',
        permanent: true,
      },
      {
        source: '/teams/elemental-heroes',
        destination: '/teams/3',
        permanent: true,
      },
      {
        source: '/teams/mt-lebanon-cake-eaters',
        destination: '/teams/4',
        permanent: true,
      },
      {
        source: '/teams/belleview-badgers',
        destination: '/teams/5',
        permanent: true,
      },
      {
        source: '/teams/beerneverbrokemyheart',
        destination: '/teams/6',
        permanent: true,
      },
      {
        source: '/teams/detroit-dawgs',
        destination: '/teams/7',
        permanent: true,
      },
      {
        source: '/teams/bop-pop',
        destination: '/teams/8',
        permanent: true,
      },
      {
        source: '/teams/cascade-marauders',
        destination: '/teams/9',
        permanent: true,
      },
      {
        source: '/teams/gardners-ghost',
        destination: '/teams/9',
        permanent: true,
      },
      {
        source: '/teams/minshew-s-maniacs',
        destination: '/teams/9',
        permanent: true,
      },
      {
        source: '/teams/red-pandas',
        destination: '/teams/10',
        permanent: true,
      },
      {
        source: '/teams/the-lone-ginger',
        destination: '/teams/11',
        permanent: true,
      },
      {
        source: '/teams/bimg-bamg-boomg',
        destination: '/teams/12',
        permanent: true,
      },
    ];
  },
  outputFileTracingIncludes: {
    '/api/team-prospect-draftboard/scouting': ['./public/scouting-reports.json'],
  },
};

export default nextConfig;
