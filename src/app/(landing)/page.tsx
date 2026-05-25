'use client';

import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';

const FEATURES = [
  {
    icon: '📊',
    title: 'Live Standings & Matchups',
    description: 'Real-time standings, weekly matchups, and head-to-head records synced directly from Sleeper.',
  },
  {
    icon: '🏆',
    title: 'League History',
    description: 'Track championships, playoff brackets, and historical records across all your seasons.',
  },
  {
    icon: '📈',
    title: 'Draft Hub',
    description: 'View past drafts, upcoming draft info, and live draft boards with pick tracking.',
  },
  {
    icon: '🔄',
    title: 'Trade & Transaction Tracking',
    description: 'Complete transaction history with trade trees showing how assets moved through your league.',
  },
  {
    icon: '💡',
    title: 'League Suggestions',
    description: 'Democratic rule change proposals with voting and ballot tracking for your league constitution.',
  },
  {
    icon: '🎨',
    title: 'Custom Branding',
    description: 'Personalize with your league colors, logo, team colors, and custom rules document.',
  },
];

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] to-[color-mix(in_srgb,var(--accent)_60%,#000)] opacity-90" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        
        <div className="relative max-w-6xl mx-auto px-4 py-24 sm:py-32">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
              Your Dynasty League,<br />
              <span className="text-[color-mix(in_srgb,var(--accent)_30%,#fff)]">Elevated</span>
            </h1>
            <p className="text-xl text-white/80 max-w-2xl mx-auto mb-8">
              A beautiful, feature-rich website for your fantasy football dynasty league. 
              Connect your Sleeper league and get started in minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => router.push('/setup')}
                className="text-lg px-8 py-3"
              >
                Set Up Your League
              </Button>
              <Button
                variant="secondary"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-lg px-8 py-3 bg-white/10 hover:bg-white/20 text-white border-white/20"
              >
                See Features
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-[var(--text)] mb-4">
              Everything Your League Needs
            </h2>
            <p className="text-[var(--muted)] max-w-2xl mx-auto">
              Built specifically for dynasty fantasy football leagues. Syncs with Sleeper 
              to give your league a professional home base.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-[var(--text)] mb-2">
                  {feature.title}
                </h3>
                <p className="text-[var(--muted)] text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4 bg-[var(--surface)]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-[var(--text)] mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-[var(--muted)]">
              Three simple steps to launch your league website
            </p>
          </div>

          <div className="space-y-8">
            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xl font-bold">
                1
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)] mb-1">
                  Connect Your Sleeper League
                </h3>
                <p className="text-[var(--muted)]">
                  Enter your Sleeper league ID and we&apos;ll import your teams, rosters, and historical data automatically.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xl font-bold">
                2
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)] mb-1">
                  Customize Your Branding
                </h3>
                <p className="text-[var(--muted)]">
                  Add your league name, colors, logo, and optionally customize each team&apos;s colors for a personalized look.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xl font-bold">
                3
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)] mb-1">
                  Invite Your League
                </h3>
                <p className="text-[var(--muted)]">
                  Share invite links with your league members so they can claim their teams and start using the site.
                </p>
              </div>
            </div>
          </div>

          <div className="text-center mt-12">
            <Button
              onClick={() => router.push('/setup')}
              className="text-lg px-8 py-3"
            >
              Start Setup Wizard
            </Button>
          </div>
        </div>
      </section>

      {/* Sleeper Integration Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--surface)] border border-[var(--border)] mb-6">
            <span className="text-sm text-[var(--muted)]">Powered by</span>
            <span className="font-semibold text-[var(--text)]">Sleeper API</span>
          </div>
          <h2 className="text-3xl font-bold text-[var(--text)] mb-4">
            Seamless Sleeper Integration
          </h2>
          <p className="text-[var(--muted)] max-w-2xl mx-auto mb-8">
            Your league data stays in sync automatically. Rosters, matchups, transactions, 
            and standings update in real-time from Sleeper&apos;s public API.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-[var(--muted)]">
            <span className="px-3 py-1 rounded-full bg-[var(--surface)]">✓ Real-time sync</span>
            <span className="px-3 py-1 rounded-full bg-[var(--surface)]">✓ No manual updates</span>
            <span className="px-3 py-1 rounded-full bg-[var(--surface)]">✓ Historical data</span>
            <span className="px-3 py-1 rounded-full bg-[var(--surface)]">✓ Multi-season support</span>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 px-4 bg-gradient-to-r from-[var(--accent)] to-[color-mix(in_srgb,var(--accent)_70%,#000)]">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Ready to elevate your league?
          </h2>
          <p className="text-white/80 mb-8">
            Set up takes less than 5 minutes. Your league deserves a proper home.
          </p>
          <Button
            onClick={() => router.push('/setup')}
            className="text-lg px-8 py-3 bg-white text-[var(--accent)] hover:bg-white/90"
          >
            Get Started Free
          </Button>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="py-8 px-4 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto text-center text-sm text-[var(--muted)]">
          <p>Fantasy Football League Website Template</p>
          <p className="mt-1">Built for dynasty leagues. Powered by Sleeper.</p>
        </div>
      </footer>
    </div>
  );
}
