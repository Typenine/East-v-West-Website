import Link from 'next/link';
import CountdownTimer from '@/components/ui/countdown-timer';
import MatchupCard from '@/components/ui/matchup-card';
import { IMPORTANT_DATES, TEAM_NAMES } from '@/lib/constants/league';

// Mock data for Week 1 matchups
const week1Matchups = [
  {
    homeTeam: TEAM_NAMES[0],
    awayTeam: TEAM_NAMES[1],
    kickoffTime: 'Thu Sep 4, 8:20 PM ET',
    week: 1
  },
  {
    homeTeam: TEAM_NAMES[2],
    awayTeam: TEAM_NAMES[3],
    kickoffTime: 'Sun Sep 7, 1:00 PM ET',
    week: 1
  },
  {
    homeTeam: TEAM_NAMES[4],
    awayTeam: TEAM_NAMES[5],
    kickoffTime: 'Sun Sep 7, 1:00 PM ET',
    week: 1
  },
  {
    homeTeam: TEAM_NAMES[6],
    awayTeam: TEAM_NAMES[7],
    kickoffTime: 'Sun Sep 7, 4:25 PM ET',
    week: 1
  },
  {
    homeTeam: TEAM_NAMES[8],
    awayTeam: TEAM_NAMES[9],
    kickoffTime: 'Sun Sep 7, 4:25 PM ET',
    week: 1
  },
  {
    homeTeam: TEAM_NAMES[10],
    awayTeam: TEAM_NAMES[11],
    kickoffTime: 'Mon Sep 8, 8:15 PM ET',
    week: 1
  },
];

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">East v. West Fantasy Football</h1>
      
      {/* Countdowns Section */}
      <section className="mb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CountdownTimer 
            targetDate={IMPORTANT_DATES.NFL_WEEK_1_START} 
            title="Regular season starts in" 
            className="bg-blue-50 border border-blue-200"
          />
          <CountdownTimer 
            targetDate={IMPORTANT_DATES.TRADE_DEADLINE} 
            title="Trade deadline in" 
            className="bg-amber-50 border border-amber-200"
          />
        </div>
      </section>
      
      {/* Week 1 Preview */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Week 1 Preview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {week1Matchups.map((matchup, index) => (
            <MatchupCard 
              key={index}
              homeTeam={matchup.homeTeam}
              awayTeam={matchup.awayTeam}
              kickoffTime={matchup.kickoffTime}
              week={matchup.week}
              className="bg-white"
            />
          ))}
        </div>
      </section>
      
      {/* Quick Links */}
      <section>
        <h2 className="text-2xl font-bold mb-6">Quick Links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link 
            href="/teams" 
            className="bg-slate-700 text-white p-4 rounded-lg text-center font-medium hover:bg-slate-800 transition-colors"
            aria-label="View all teams"
          >
            Teams
          </Link>
          <Link 
            href="/standings" 
            className="bg-slate-700 text-white p-4 rounded-lg text-center font-medium hover:bg-slate-800 transition-colors"
            aria-label="View league standings"
          >
            Standings
          </Link>
          <Link 
            href="/history" 
            className="bg-slate-700 text-white p-4 rounded-lg text-center font-medium hover:bg-slate-800 transition-colors"
            aria-label="View league history"
          >
            History
          </Link>
          <Link 
            href="/draft" 
            className="bg-slate-700 text-white p-4 rounded-lg text-center font-medium hover:bg-slate-800 transition-colors"
            aria-label="View draft information"
          >
            Draft
          </Link>
        </div>
      </section>
    </div>
  );
}
