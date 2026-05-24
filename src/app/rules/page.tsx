'use client';

import { useEffect, useMemo, useRef, useState, useCallback, ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { rulesHtmlSections } from '../../data/rules';
import SectionHeader from '@/components/ui/SectionHeader';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import Label from '@/components/ui/Label';

const TaxiSquadExplainer = dynamic(() => import('@/components/explainers/TaxiSquad'), { ssr: false });
const TradePicksExplainer = dynamic(() => import('@/components/explainers/TradePicks'), { ssr: false });
const PlayoffStructureExplainer = dynamic(() => import('@/components/explainers/PlayoffStructure'), { ssr: false });
const LineupComplianceExplainer = dynamic(() => import('@/components/explainers/LineupCompliance'), { ssr: false });
const AmendmentsExplainer = dynamic(() => import('@/components/explainers/Amendments'), { ssr: false });

const SECTION_EXPLAINERS: Record<string, ComponentType> = {
  'rosters-lineups': TaxiSquadExplainer,
  'trades': TradePicksExplainer,
  'standings-playoffs': PlayoffStructureExplainer,
  'competitive-integrity': LineupComplianceExplainer,
  'amendments-rule-changes': AmendmentsExplainer,
};

type RuleSection = {
  id: string;
  title: string;
  rawHtml: string;
  searchText: string;
};

// Section number → anchor ID map for cross-reference linking (D)
const SECTION_ID_MAP: Record<number, string> = {
  1: 'league-overview',
  2: 'definitions-terms',
  3: 'governance-authority',
  4: 'season-calendar',
  5: 'rosters-lineups',
  6: 'free-agency-waivers',
  7: 'trades',
  8: 'draft',
  9: 'standings-playoffs',
  10: 'money-dues-prizes',
  11: 'competitive-integrity',
  12: 'enforcement-penalties',
  13: 'amendments-rule-changes',
  14: 'draft-trip',
  15: 'scoring',
};

const stripTags = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** (A) Wrap matched text between tags in <mark> for search highlighting. */
function highlightHtml(html: string, query: string): string {
  if (!query.trim()) return html;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return html.replace(/>([^<]+)</g, (_, text) =>
    '>' + text.replace(regex, '<mark class="rules-highlight">$1</mark>') + '<'
  );
}

/** (D) Replace "Section X.Y(z)" / "Rule X.Y(z)" references with clickable anchors. */
function linkifyRuleRefs(html: string): string {
  return html.replace(
    /\b(Section|Rule)\s+(\d{1,2})((?:\.\d+)*(?:\([a-z0-9]+\))*)/gi,
    (match, prefix, num, suffix) => {
      const id = SECTION_ID_MAP[parseInt(num)];
      if (!id) return match;
      return `<a href="#${id}" class="rules-xref" data-section="${id}">${match}</a>`;
    }
  );
}

function CopyLinkButton({ sectionId }: { sectionId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard
          .writeText(`${window.location.origin}${window.location.pathname}#${sectionId}`)
          .catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity p-1 rounded text-[var(--muted)] hover:text-[var(--accent)]"
      title="Copy link to this section"
      aria-label="Copy link to this section"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      )}
    </button>
  );
}

export default function RulesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [flashSection, setFlashSection] = useState<string | null>(null);
  const initialized = useRef(false);

  const ruleSections: RuleSection[] = useMemo(() =>
    rulesHtmlSections.map((s) => ({
      id: s.id,
      title: s.title,
      rawHtml: linkifyRuleRefs(s.html),
      searchText: stripTags(s.html),
    })),
  []);

  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(ruleSections.map((s) => s.id))
  );
  const [sectionView, setSectionView] = useState<Record<string, 'rules' | 'guide'>>({});
  const [pageView, setPageView] = useState<'rulebook' | 'guides'>('rulebook');
  const [activeGuide, setActiveGuide] = useState<string>('rosters-lineups');

  // (E) On mount: read URL hash and jump to that section
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const hash = window.location.hash.replace('#', '');
    if (hash && ruleSections.some((s) => s.id === hash)) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          setActiveSection(hash);
          setFlashSection(hash);
          setTimeout(() => setFlashSection(null), 1500);
        }
      }, 150);
    }
  }, [ruleSections]);

  // (E) Jump to a section: open it, update URL hash, scroll, flash
  const jumpToSection = (sectionId: string) => {
    setOpenSections((prev) => { const n = new Set(prev); n.add(sectionId); return n; });
    setActiveSection(sectionId);
    window.history.pushState(null, '', `#${sectionId}`);
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        setFlashSection(sectionId);
        setTimeout(() => setFlashSection(null), 1500);
      }
    }, 50);
  };

  // (D) Delegated handler for cross-reference link clicks inside rendered HTML
  const handleContentClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('.rules-xref');
    if (!target) return;
    e.preventDefault();
    const sectionId = target.getAttribute('data-section');
    if (sectionId) jumpToSection(sectionId);
  };

  // --- Clancy chat state ---
  const [clancyQuestion, setClancyQuestion] = useState('');
  const [clancyAnswer, setClancyAnswer] = useState<string | null>(null);
  const [clancySectionId, setClancySectionId] = useState<string | null>(null);
  const [clancyLoading, setClancyLoading] = useState(false);
  const [clancyError, setClancyError] = useState<string | null>(null);
  const [clancyRemaining, setClancyRemaining] = useState<number | null>(null);
  const [clancyLimit, setClancyLimit] = useState(30);
  const [clancyWarn, setClancyWarn] = useState(false);

  // Load remaining count on mount
  useEffect(() => {
    fetch('/api/rules/ask')
      .then((r) => r.json())
      .then((d: { remaining?: number; limit?: number; warn?: boolean }) => {
        if (d.remaining != null) setClancyRemaining(d.remaining);
        if (d.limit != null) setClancyLimit(d.limit);
        if (d.warn != null) setClancyWarn(d.warn);
      })
      .catch(() => {});
  }, []);

  const askClancy = useCallback(async () => {
    const q = clancyQuestion.trim();
    if (!q || clancyLoading) return;
    setClancyLoading(true);
    setClancyAnswer(null);
    setClancySectionId(null);
    setClancyError(null);
    try {
      const res = await fetch('/api/rules/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json() as {
        answer?: string; sectionId?: string; error?: string;
        remaining?: number; limit?: number; warn?: boolean; limitReached?: boolean;
      };
      if (!res.ok || data.error) {
        setClancyError(data.error ?? 'Something went wrong.');
        if (data.remaining != null) setClancyRemaining(data.remaining);
      } else {
        setClancyAnswer(data.answer ?? '');
        setClancySectionId(data.sectionId ?? null);
        if (data.remaining != null) setClancyRemaining(data.remaining);
        if (data.limit != null) setClancyLimit(data.limit);
        if (data.warn != null) setClancyWarn(data.warn);
      }
    } catch {
      setClancyError('Could not reach Clancy. Check your connection.');
    } finally {
      setClancyLoading(false);
    }
  }, [clancyQuestion, clancyLoading]);

  // --- end Clancy ---

  const q = searchQuery.toLowerCase().trim();
  const filteredSections = q
    ? ruleSections.filter((s) => s.title.toLowerCase().includes(q) || s.searchText.includes(q))
    : ruleSections;

  const GUIDES = [
    { id: 'rosters-lineups',       label: 'Taxi Squad',        desc: 'Roster rules, activation, eligibility & penalties',                   emoji: '🚕' },
    { id: 'trades',                label: 'Trading Picks',      desc: 'Which picks can be traded, dues requirements & deadline',             emoji: '🔄' },
    { id: 'standings-playoffs',    label: 'Playoffs & Payouts', desc: 'Bracket, Toilet Bowl, draft order & prize money',                    emoji: '🏆' },
    { id: 'competitive-integrity',   label: 'Lineup Compliance', desc: 'The 12-hr rule, QB exception, tanking & what counts as a violation',  emoji: '✅' },
    { id: 'amendments-rule-changes', label: 'Amendments',        desc: 'Proposals, endorsements, vote thresholds & competing amendments',       emoji: '📝' },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <style jsx global>{`
        .rules-content p { margin-bottom: 0.75rem; line-height: 1.6; }
        .rules-content p strong { color: var(--text); font-weight: 600; }
        .rules-content ul { margin-left: 1.5rem; margin-bottom: 1rem; list-style-type: disc; }
        .rules-content ul ul { margin-left: 1.5rem; margin-top: 0.5rem; list-style-type: circle; }
        .rules-content ul ul ul { list-style-type: square; }
        .rules-content li { margin-bottom: 0.5rem; line-height: 1.6; padding-left: 0.25rem; }
        .rules-content li strong { color: var(--text); font-weight: 600; }
        .rules-content li > ul { margin-top: 0.5rem; }

        /* (A) Search highlight */
        mark.rules-highlight {
          background-color: color-mix(in srgb, var(--gold, #f59e0b) 30%, transparent);
          color: var(--text);
          border-radius: 2px;
          padding: 0 2px;
        }

        /* (D) Cross-reference links */
        a.rules-xref {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 2px;
          cursor: pointer;
          font-weight: 500;
        }
        a.rules-xref:hover { opacity: 0.75; }

        /* (E) Section flash on jump */
        @keyframes sectionFlash {
          0%   { box-shadow: 0 0 0 2px var(--accent); }
          70%  { box-shadow: 0 0 0 2px var(--accent); }
          100% { box-shadow: none; }
        }
        .rules-section-flash { animation: sectionFlash 1.4s ease-out forwards; }
      `}</style>

      <SectionHeader title="League Rules" />

      {/* Top-level page tabs */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setPageView('rulebook')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: pageView === 'rulebook' ? 'var(--surface-strong)' : 'transparent',
            color: pageView === 'rulebook' ? 'var(--text)' : 'var(--muted)',
            border: `1px solid ${pageView === 'rulebook' ? 'var(--border)' : 'transparent'}`,
          }}
        >
          📋 Rulebook
        </button>
        <button
          onClick={() => setPageView('guides')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: pageView === 'guides' ? 'var(--accent)' : 'transparent',
            color: pageView === 'guides' ? '#fff' : 'var(--muted)',
            border: `1px solid ${pageView === 'guides' ? 'var(--accent)' : 'transparent'}`,
          }}
        >
          📊 Key Rules Guides
        </button>
      </div>

      {/* Key Rules Guides view */}
      {pageView === 'guides' && (() => {
        const ActiveGuideComp = SECTION_EXPLAINERS[activeGuide];
        return (
          <div className="mb-10">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {GUIDES.map((g) => {
                const isActive = activeGuide === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setActiveGuide(g.id)}
                    className="flex flex-col items-start gap-1.5 p-4 rounded-xl text-left transition-all"
                    style={{
                      background: isActive ? 'var(--accent)' : 'var(--surface)',
                      border: `1.5px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      color: isActive ? '#fff' : 'var(--text)',
                    }}
                  >
                    <span className="text-2xl">{g.emoji}</span>
                    <span className="text-sm font-bold leading-tight">{g.label}</span>
                    <span className="text-xs leading-snug" style={{ color: isActive ? 'rgba(255,255,255,0.75)' : 'var(--muted)' }}>{g.desc}</span>
                  </button>
                );
              })}
            </div>
            {ActiveGuideComp && (
              <div className="rounded-xl overflow-hidden">
                <ActiveGuideComp />
              </div>
            )}
          </div>
        );
      })()}

      {/* Rulebook view */}
      {pageView === 'rulebook' && (
        <>
      <div className="mb-8">
        <Label htmlFor="rules-search" className="mb-1 block">Search rules</Label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[var(--muted)]" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <Input
            id="rules-search"
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Ask Clancy */}
      <div className="mb-8 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-soft)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]" style={{ background: 'var(--surface-strong)' }}>
          <img src="/clancy.png" alt="Clancy" className="w-7 h-7 rounded-full object-cover shrink-0" />
          <span className="text-sm font-bold text-[var(--text)] tracking-wide">Ask Clancy</span>
          <span className="text-xs text-[var(--muted)] ml-1">— rulebook Q&amp;A</span>
          <span className="text-xs text-[var(--muted)] px-1.5 py-0.5 rounded-full border border-[var(--border)] ml-1" title="AI-generated answers may be inaccurate. Always verify against the actual rulebook.">
            AI · May be wrong
          </span>
          {clancyRemaining !== null && (
            <span className={`ml-auto text-xs font-medium ${clancyWarn ? '' : 'text-[var(--muted)]'}`}
              style={clancyWarn ? { color: clancyRemaining === 0 ? 'var(--danger)' : '#f59e0b' } : {}}>
              {clancyRemaining === 0
                ? 'Daily limit reached — resets at midnight UTC'
                : clancyWarn
                  ? `⚠️ Only ${clancyRemaining} of ${clancyLimit} questions left today`
                  : `${clancyRemaining} of ${clancyLimit} questions remaining today`}
            </span>
          )}
        </div>
        <div className="p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={clancyQuestion}
              onChange={(e) => setClancyQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && askClancy()}
              placeholder="e.g. Can I have two QBs on taxi? What's the trade deadline?"
              maxLength={500}
              disabled={clancyRemaining === 0 || clancyLoading}
              className="flex-1 rounded-[var(--radius-card)] bg-[var(--surface-strong)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40"
            />
            <button
              onClick={askClancy}
              disabled={!clancyQuestion.trim() || clancyRemaining === 0 || clancyLoading}
              className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {clancyLoading ? '…' : 'Ask'}
            </button>
          </div>

          {/* Answer */}
          {(clancyAnswer || clancyError) && (
            <div className={`mt-3 rounded-[var(--radius-card)] px-4 py-3 text-sm border ${clancyError ? 'border-[var(--danger)]' : 'border-[var(--border)]'}`}
              style={{ background: 'var(--surface-strong)' }}>
              {clancyError ? (
                <p style={{ color: 'var(--danger)' }}>{clancyError}</p>
              ) : (
                <>
                  <p className="text-[var(--text)] whitespace-pre-wrap leading-relaxed">{clancyAnswer}</p>
                  {clancySectionId && (
                    <button
                      onClick={() => jumpToSection(clancySectionId!)}
                      className="mt-2 text-xs font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                      style={{ color: 'var(--accent)' }}>
                      Jump to section ↓
                    </button>
                  )}
                  <p className="mt-3 text-xs leading-snug" style={{ color: 'var(--muted)' }}>
                    ⚠️ Clancy is an AI and can make mistakes, especially on complex or multi-rule questions. Always verify rulings against the actual rulebook text before acting on them.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Table of Contents */}
        <div className="md:w-1/4">
          <Card className="sticky top-4">
            <CardHeader>
              <p className="font-semibold text-[var(--text)]">Table of Contents</p>
            </CardHeader>
            <CardContent>
              <nav className="space-y-1">
                {ruleSections.map((section) => (
                  <Button
                    key={section.id}
                    variant={activeSection === section.id ? 'secondary' : 'ghost'}
                    size="sm"
                    fullWidth
                    className="justify-start text-left"
                    onClick={() => jumpToSection(section.id)}
                  >
                    {section.title}
                  </Button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Rules Content */}
        <div className="md:w-3/4" onClick={handleContentClick}>
          {filteredSections.length > 0 ? (
            <div className="space-y-4">
              {filteredSections.map((section) => {
                const isOpen = openSections.has(section.id);
                const isFlashing = flashSection === section.id;
                const processedHtml = highlightHtml(section.rawHtml, q);
                return (
                  <Card
                    key={section.id}
                    id={section.id}
                    className={`scroll-mt-4 group${isFlashing ? ' rules-section-flash' : ''}`}
                  >
                    <CardHeader>
                      <button
                        className="w-full flex items-center justify-between text-left px-1 py-0.5"
                        aria-expanded={isOpen}
                        aria-controls={`panel-${section.id}`}
                        onClick={() =>
                          setOpenSections((prev) => {
                            const next = new Set(prev);
                            if (next.has(section.id)) next.delete(section.id);
                            else next.add(section.id);
                            return next;
                          })
                        }
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-lg font-medium text-[var(--text)]">{section.title}</span>
                          {SECTION_EXPLAINERS[section.id] && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tracking-wide" style={{ background: 'var(--accent)', color: '#fff', opacity: 0.9 }}>
                              Guide
                            </span>
                          )}
                          <CopyLinkButton sectionId={section.id} />
                        </span>
                        <svg
                          className={`w-5 h-5 text-[var(--muted)] shrink-0 transition-transform duration-200${isOpen ? ' rotate-180' : ''}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </CardHeader>
                    <CardContent id={`panel-${section.id}`} hidden={!isOpen}>
                      {SECTION_EXPLAINERS[section.id] ? (() => {
                        const view = sectionView[section.id] ?? 'rules';
                        const ExplainerComp = SECTION_EXPLAINERS[section.id];
                        return (
                          <>
                            <div className="flex items-center gap-1.5 mb-4 pb-3 border-b border-[var(--border)]">
                              <button
                                onClick={() => setSectionView((p) => ({ ...p, [section.id]: 'rules' }))}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all"
                                style={{
                                  background: view === 'rules' ? 'var(--surface-strong)' : 'transparent',
                                  color: view === 'rules' ? 'var(--text)' : 'var(--muted)',
                                  border: `1px solid ${view === 'rules' ? 'var(--border)' : 'transparent'}`,
                                }}
                              >
                                📋 Rules Text
                              </button>
                              <button
                                onClick={() => setSectionView((p) => ({ ...p, [section.id]: 'guide' }))}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all"
                                style={{
                                  background: view === 'guide' ? 'var(--accent)' : 'transparent',
                                  color: view === 'guide' ? '#fff' : 'var(--muted)',
                                  border: `1px solid ${view === 'guide' ? 'var(--accent)' : 'transparent'}`,
                                }}
                              >
                                📊 Interactive Guide
                              </button>
                            </div>
                            {view === 'rules' ? (
                              <div className="rules-content space-y-4" dangerouslySetInnerHTML={{ __html: processedHtml }} />
                            ) : (
                              <div className="rounded-xl overflow-hidden">
                                <ExplainerComp />
                              </div>
                            )}
                          </>
                        );
                      })() : (
                        <div className="rules-content space-y-4" dangerouslySetInnerHTML={{ __html: processedHtml }} />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-[var(--muted)]">No rules found matching your search.</p>
              <Button onClick={() => setSearchQuery('')} className="mt-4">Clear Search</Button>
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
