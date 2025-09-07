'use client';

import { useState } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';

type ChampionDetails = {
  year: string;
  team: string;
  record: string;
  pointsFor: number;
  pointsAgainst: number;
  playoffPath: string;
  championshipScore: string;
  mvpPlayer: string;
};

export default function ChampionsPage() {
  // Sample champion details - in a real app, this would come from API data
  const championDetails: ChampionDetails[] = [
    {
      year: '2024',
      team: 'Diggs in the Chat',
      record: '11-3-0',
      pointsFor: 2145.8,
      pointsAgainst: 1876.2,
      playoffPath: 'First-round bye → Defeated Kittle Me This → Defeated Burrow My Sorrows',
      championshipScore: 'Diggs in the Chat 142.60 - 138.20 Burrow My Sorrows',
      mvpPlayer: 'Stefon Diggs (WR)'
    },
    {
      year: '2023',
      team: 'Burrow My Sorrows',
      record: '10-4-0',
      pointsFor: 1984.6,
      pointsAgainst: 1856.4,
      playoffPath: 'First-round bye → Defeated Waddle Waddle → Defeated Diggs in the Chat',
      championshipScore: 'Burrow My Sorrows 156.40 - 134.80 Diggs in the Chat',
      mvpPlayer: 'Joe Burrow (QB)'
    }
  ];
  
  const [selectedYear, setSelectedYear] = useState<string>(championDetails[0].year);
  
  // Get the details for the selected year
  const selectedChampion = championDetails.find(c => c.year === selectedYear) || championDetails[0];
  
  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader 
        title="League Champions"
        actions={
          <div className="inline-flex rounded-md shadow-sm" role="group">
            {championDetails.map(champion => (
              <button
                key={champion.year}
                type="button"
                onClick={() => setSelectedYear(champion.year)}
                className={`px-4 py-2 text-sm font-medium pill ${
                  selectedYear === champion.year
                    ? 'pill-active'
                    : 'evw-surface pill-hover border border-[var(--border)]'
                } ${
                  champion.year === championDetails[0].year ? 'rounded-l-lg' : ''
                } ${
                  champion.year === championDetails[championDetails.length - 1].year ? 'rounded-r-lg' : ''
                }`}
              >
                {champion.year} Season
              </button>
            ))}
          </div>
        }
      />
      
      {/* Champion Trophy Card */}
      <div className="max-w-3xl mx-auto evw-surface border border-[var(--border)] rounded-lg shadow-lg overflow-hidden mb-8">
        <div className="brand-gradient text-on-brand p-6 text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-3xl font-bold">{selectedChampion.team}</h2>
          <p className="text-xl mt-2">{selectedChampion.year} Champion</p>
        </div>
        
        <div className="p-6">
          {/* Champion Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <p className="text-sm text-[var(--muted)]">Record</p>
              <p className="text-xl font-bold">{selectedChampion.record}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-[var(--muted)]">Points For</p>
              <p className="text-xl font-bold">{selectedChampion.pointsFor.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-[var(--muted)]">Points Against</p>
              <p className="text-xl font-bold">{selectedChampion.pointsAgainst.toFixed(2)}</p>
            </div>
          </div>
          
          {/* Championship Details */}
          <div className="border-t border-[var(--border)] pt-6">
            <h3 className="text-xl font-bold mb-4">Championship Journey</h3>
            
            <div className="mb-4">
              <p className="text-sm text-[var(--muted)]">Playoff Path</p>
              <p className="text-lg">{selectedChampion.playoffPath}</p>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-[var(--muted)]">Championship Game</p>
              <p className="text-lg font-medium">{selectedChampion.championshipScore}</p>
            </div>
            
            <div>
              <p className="text-sm text-[var(--muted)]">Season MVP</p>
              <p className="text-lg">{selectedChampion.mvpPlayer}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Championship Game Recap */}
      <div className="max-w-3xl mx-auto evw-surface border border-[var(--border)] rounded-lg shadow-lg overflow-hidden mb-8">
        <div className="evw-subtle px-6 py-4">
          <h3 className="text-xl font-bold">Championship Game Recap</h3>
        </div>
        
        <div className="p-6">
          {selectedYear === '2024' ? (
            <div>
              <p className="mb-4">
                In a thrilling championship matchup, Diggs in the Chat secured their first league title with a narrow victory over Burrow My Sorrows. The game came down to Monday Night Football, where Stefon Diggs&apos; late touchdown sealed the win.
              </p>
              <p className="mb-4">
                Diggs in the Chat was led by stellar performances from Stefon Diggs (28.4 pts), Josh Allen (26.2 pts), and a surprise contribution from their defense (18.0 pts). Despite Joe Burrow&apos;s heroic effort (32.6 pts) for Burrow My Sorrows, it wasn&apos;t enough to overcome the balanced attack from Diggs in the Chat.
              </p>
              <p>
                This championship victory capped off a dominant season for Diggs in the Chat, who led the league in scoring and finished with an impressive 11-3 record.
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-4">
                Burrow My Sorrows claimed the inaugural league championship with a decisive victory over Diggs in the Chat. Joe Burrow&apos;s 4-touchdown performance in the championship game proved to be the difference-maker.
              </p>
              <p className="mb-4">
                The championship team was powered by Joe Burrow (36.8 pts), Ja&apos;Marr Chase (24.2 pts), and Travis Kelce (22.6 pts). Diggs in the Chat fought hard but couldn&apos;t overcome an injury to their starting running back in the first quarter.
              </p>
              <p>
                This championship marked the culmination of a strong season for Burrow My Sorrows, who overcame a slow start to win 8 of their final 9 regular-season games before dominating in the playoffs.
              </p>
            </div>
          )}
        </div>
      </div>
      
      {/* Championship Roster */}
      <div className="max-w-3xl mx-auto evw-surface border border-[var(--border)] rounded-lg shadow-lg overflow-hidden mb-8">
        <div className="evw-subtle px-6 py-4">
          <h3 className="text-xl font-bold">Championship Roster</h3>
        </div>
        
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)]">
              <thead className="evw-subtle">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                    Position
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                    Player
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                    Championship Game Points
                  </th>
                </tr>
              </thead>
              <tbody className="evw-surface divide-y divide-[var(--border)]">
                {selectedYear === '2024' ? (
                  <>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">QB</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Josh Allen</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">26.2</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">RB</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Saquon Barkley</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">18.6</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">RB</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Breece Hall</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">14.8</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">WR</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Stefon Diggs</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">28.4</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">WR</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Amon-Ra St. Brown</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">16.2</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">TE</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Mark Andrews</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">12.4</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">FLEX</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">DeVonta Smith</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">8.0</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">FLEX</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Rachaad White</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">10.0</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">SF</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Tua Tagovailoa</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">18.0</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">DEF</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">San Francisco 49ers</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">18.0</td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">QB</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Joe Burrow</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">36.8</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">RB</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Derrick Henry</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">20.4</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">RB</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Rhamondre Stevenson</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">16.8</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">WR</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Ja&apos;Marr Chase</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">24.2</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">WR</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">CeeDee Lamb</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">18.6</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">TE</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Travis Kelce</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">22.6</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">FLEX</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Deebo Samuel</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">12.8</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">FLEX</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">David Montgomery</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">8.6</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">SF</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Jared Goff</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">14.2</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">DEF</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">Dallas Cowboys</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">12.0</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <div className="mt-8 text-center">
        <Link 
          href="/history" 
          className="btn btn-primary"
        >
          Back to History
        </Link>
      </div>
    </div>
  );
}
