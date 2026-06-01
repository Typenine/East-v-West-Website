'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Label from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';

// ── Types ────────────────────────────────────────────────────────────────────

type Bot = 'entertainer' | 'analyst';

interface VoiceConfig {
  sarcasm?: number;
  excitability?: number;
  depth?: number;
  snark?: number;
}

interface BotSettingsData {
  bot: Bot;
  hardcodedDefaults: {
    displayName: string;
    role: string;
    voice: VoiceConfig;
    safetyBoundaries: string[];
    blindSpots: string[];
  };
  dbOverrides: {
    displayName?: string;
    roleDescription?: string;
    voiceConfig?: VoiceConfig;
    bannedPhrases?: string[];
    safetyBoundaries?: string[];
    adminNotes?: string;
  } | null;
  effectiveDisplayName: string;
}

interface TeamCardRow {
  teamName: string;
  archetype: string;
  era: string;
  currentSeasonArc: string | null;
  dataConfidence: string;
  hasDbOverride: boolean;
}

interface TeamsResponse {
  teams: TeamCardRow[];
  knownTeamNames: string[];
}

interface PhrasePool {
  poolKey: string;
  phrases: string[];
  adminNotes?: string;
}

interface PreviewResult {
  bot: Bot;
  sectionType: string;
  episodeType: string;
  stance: string;
  stanceInstructions: string;
  judgment: {
    stakes: string;
    comedyValue: number;
    sensitivity: number;
    note: string;
    rivalryScore: number;
    avoidList: string[];
  };
  narrativeHeat: { score: number; tier: string; factors: string[] };
  phaseRules: { name: string; priorities: string[]; avoidances: string[]; preferredStances: string[] };
  guardrailResult: { blocked: boolean; warningCount: number; warnings: Array<{ rule: string; severity: string; snippet: string }> } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function adminFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PersonalityConsolePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<'bots' | 'teams' | 'phrases' | 'preview'>('bots');

  useEffect(() => {
    fetch('/api/admin-login', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setIsAdmin(Boolean(d?.isAdmin)); setChecked(true); })
      .catch(() => setChecked(true));
  }, []);

  if (!checked) return <div className="p-8 text-[var(--muted)]">Loading…</div>;
  if (!isAdmin) return <div className="p-8 text-red-400">Admin access required.</div>;

  const tabs = [
    { key: 'bots',    label: 'Bot Settings' },
    { key: 'teams',   label: 'Team Cards' },
    { key: 'phrases', label: 'Phrase Pools' },
    { key: 'preview', label: 'Preview Tool' },
  ] as const;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <SectionHeader title="Personality Console" subtitle="Admin bot and team narrative settings" />

      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/newsletter" className="text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Newsletter Admin
        </Link>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--border)]">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-[var(--accent)] text-[var(--foreground)]'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'bots'    && <BotSettingsPanel />}
      {activeTab === 'teams'   && <TeamCardsPanel />}
      {activeTab === 'phrases' && <PhrasesPanel />}
      {activeTab === 'preview' && <PreviewPanel />}
    </div>
  );
}

// ── Bot Settings Panel ────────────────────────────────────────────────────────

function BotSettingsPanel() {
  const [bot, setBot] = useState<Bot>('entertainer');
  const [data, setData] = useState<BotSettingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Form fields
  const [displayName, setDisplayName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [bannedPhrases, setBannedPhrases] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [voiceSarcasm, setVoiceSarcasm] = useState('');
  const [voiceDepth, setVoiceDepth] = useState('');
  const [voiceSnark, setVoiceSnark] = useState('');
  const [voiceExcitability, setVoiceExcitability] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMsg('');
    try {
      const d: BotSettingsData = await adminFetch(`/api/admin/newsletter/bot-settings?bot=${bot}`);
      setData(d);
      const ov = d.dbOverrides;
      setDisplayName(ov?.displayName ?? '');
      setRoleDescription(ov?.roleDescription ?? '');
      setBannedPhrases((ov?.bannedPhrases ?? []).join('\n'));
      setAdminNotes(ov?.adminNotes ?? '');
      setVoiceSarcasm(ov?.voiceConfig?.sarcasm?.toString() ?? '');
      setVoiceDepth(ov?.voiceConfig?.depth?.toString() ?? '');
      setVoiceSnark(ov?.voiceConfig?.snark?.toString() ?? '');
      setVoiceExcitability(ov?.voiceConfig?.excitability?.toString() ?? '');
    } catch (e) {
      setMsg(`Load error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [bot]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const parseNum = (v: string) => { const n = parseFloat(v); return isNaN(n) ? undefined : Math.min(10, Math.max(0, n)); };
      await adminFetch('/api/admin/newsletter/bot-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot,
          displayName:    displayName.trim() || undefined,
          roleDescription: roleDescription.trim() || undefined,
          bannedPhrases:  bannedPhrases.split('\n').map(s => s.trim()).filter(Boolean),
          adminNotes:     adminNotes.trim() || undefined,
          voiceConfig: {
            sarcasm:      parseNum(voiceSarcasm),
            depth:        parseNum(voiceDepth),
            snark:        parseNum(voiceSnark),
            excitability: parseNum(voiceExcitability),
          },
        }),
      });
      setMsg('Saved. Will take effect on next newsletter generation.');
    } catch (e) {
      setMsg(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`Reset ${bot} to hardcoded defaults? This clears all admin overrides.`)) return;
    setSaving(true);
    try {
      await adminFetch(`/api/admin/newsletter/bot-settings?bot=${bot}`, { method: 'DELETE' });
      setMsg('Reset to defaults.');
      load();
    } catch (e) {
      setMsg(`Reset failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const defaults = data?.hardcodedDefaults;

  return (
    <div className="space-y-6">
      {/* Bot selector */}
      <div className="flex gap-3">
        {(['entertainer', 'analyst'] as Bot[]).map(b => (
          <button
            key={b}
            onClick={() => setBot(b)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              bot === b
                ? (b === 'entertainer' ? 'bg-red-700 text-white' : 'bg-blue-700 text-white')
                : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            {b === 'entertainer' ? 'Mason Reed' : 'Westy / Trent Weston'}
          </button>
        ))}
      </div>

      {loading && <div className="text-[var(--muted)] text-sm">Loading…</div>}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hardcoded defaults (read-only) */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Hardcoded Defaults (read-only)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--muted)]">
              <div><span className="font-medium text-[var(--foreground)]">Name:</span> {defaults?.displayName}</div>
              <div><span className="font-medium text-[var(--foreground)]">Role:</span> {defaults?.role}</div>
              <div><span className="font-medium text-[var(--foreground)]">Voice:</span> sarcasm {defaults?.voice.sarcasm} | depth {defaults?.voice.depth} | snark {defaults?.voice.snark} | excitability {defaults?.voice.excitability}</div>
              <div><span className="font-medium text-[var(--foreground)]">Safety:</span> {defaults?.safetyBoundaries[0]}</div>
            </CardContent>
          </Card>

          {/* Admin overrides */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Admin Overrides (override defaults)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Display Name override</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={defaults?.displayName} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Role description override</Label>
                <Textarea value={roleDescription} onChange={e => setRoleDescription(e.target.value)} rows={2} placeholder={defaults?.role} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Voice sliders (0–10 each; blank = use default)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[['Sarcasm', voiceSarcasm, setVoiceSarcasm], ['Depth', voiceDepth, setVoiceDepth],
                    ['Snark', voiceSnark, setVoiceSnark], ['Excitability', voiceExcitability, setVoiceExcitability]].map(([label, val, set]) => (
                    <div key={label as string}>
                      <Label className="text-xs">{label as string}</Label>
                      <Input type="number" min="0" max="10" step="0.5" value={val as string} onChange={e => (set as (v: string) => void)(e.target.value)} placeholder="default" className="text-sm" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Banned phrases (one per line) — fed into guardrails</Label>
                <Textarea value={bannedPhrases} onChange={e => setBannedPhrases(e.target.value)} rows={4} placeholder="e.g. colluding&#10;official ruling" className="text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs">Admin notes (not injected into prompts)</Label>
                <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2} className="text-sm" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {msg && <div className={`text-sm p-3 rounded ${msg.startsWith('Save') || msg.startsWith('Reset') ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>{msg}</div>}

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save Overrides'}
        </Button>
        <Button onClick={handleReset} disabled={saving || loading} variant="secondary">
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}

// ── Team Cards Panel ──────────────────────────────────────────────────────────

function TeamCardsPanel() {
  const [teams, setTeams] = useState<TeamCardRow[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [cardData, setCardData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Editable fields
  const [archetype, setArchetype] = useState('');
  const [era, setEra] = useState('');
  const [currentSeasonArc, setCurrentSeasonArc] = useState('');
  const [historicalArc, setHistoricalArc] = useState('');
  const [runningJokes, setRunningJokes] = useState('');
  const [retiredJokes, setRetiredJokes] = useState('');
  const [sensitivityLevel, setSensitivityLevel] = useState('');
  const [preferredAngles, setPreferredAngles] = useState('');

  useEffect(() => {
    adminFetch('/api/admin/newsletter/team-narratives')
      .then((d: TeamsResponse) => setTeams(d.teams))
      .catch(() => {});
  }, []);

  const loadTeam = async (teamName: string) => {
    setLoading(true);
    setMsg('');
    try {
      const d = await adminFetch(`/api/admin/newsletter/team-narratives?team=${encodeURIComponent(teamName)}`);
      const eff = d.hardcoded ?? {};
      const ov  = d.dbOverride ?? {};
      setCardData({ ...eff, ...ov });
      setArchetype(ov.archetype ?? eff.archetype ?? '');
      setEra(ov.era ?? eff.era ?? '');
      setCurrentSeasonArc(ov.currentSeasonArc ?? eff.currentSeasonArc ?? '');
      setHistoricalArc(ov.historicalArc ?? eff.historicalArc ?? '');
      setRunningJokes((ov.runningJokes ?? eff.runningJokes ?? []).join('\n'));
      setRetiredJokes((ov.retiredJokes ?? eff.retiredJokes ?? []).join('\n'));
      setSensitivityLevel(ov.sensitivityLevel ?? eff.sensitivityLevel ?? '');
      setPreferredAngles((ov.preferredAngles ?? eff.preferredAngles ?? []).join('\n'));
    } catch (e) {
      setMsg(`Load error: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTeamChange = (name: string) => {
    setSelectedTeam(name);
    if (name) loadTeam(name);
  };

  const handleSave = async () => {
    if (!selectedTeam) return;
    setSaving(true);
    setMsg('');
    try {
      await adminFetch('/api/admin/newsletter/team-narratives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: selectedTeam,
          cardData: {
            archetype:      archetype.trim() || undefined,
            era:            era || undefined,
            currentSeasonArc: currentSeasonArc.trim(),
            historicalArc:  historicalArc.trim() || undefined,
            runningJokes:   runningJokes.split('\n').map(s => s.trim()).filter(Boolean),
            retiredJokes:   retiredJokes.split('\n').map(s => s.trim()).filter(Boolean),
            sensitivityLevel: sensitivityLevel || undefined,
            preferredAngles: preferredAngles.split('\n').map(s => s.trim()).filter(Boolean),
          },
        }),
      });
      setMsg('Saved. Takes effect on next generation.');
    } catch (e) {
      setMsg(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedTeam) return;
    if (!confirm(`Remove all admin overrides for ${selectedTeam}? Hardcoded defaults restored.`)) return;
    setSaving(true);
    try {
      await adminFetch(`/api/admin/newsletter/team-narratives?team=${encodeURIComponent(selectedTeam)}`, { method: 'DELETE' });
      setMsg('Override removed. Hardcoded defaults are now active.');
      loadTeam(selectedTeam);
    } catch (e) {
      setMsg(`Reset failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-xs">Select team</Label>
        <select
          value={selectedTeam}
          onChange={e => handleTeamChange(e.target.value)}
          className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm"
        >
          <option value="">— choose a team —</option>
          {teams.map(t => (
            <option key={t.teamName} value={t.teamName}>
              {t.teamName} {t.hasDbOverride ? '✏️' : ''} ({t.dataConfidence} confidence)
            </option>
          ))}
        </select>
      </div>

      {selectedTeam && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Narrative Card — {selectedTeam}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Franchise archetype</Label>
                <Input value={archetype} onChange={e => setArchetype(e.target.value)} className="text-sm" placeholder="e.g. Perennial contender…" />
              </div>
              <div>
                <Label className="text-xs">Era</Label>
                <select value={era} onChange={e => setEra(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm">
                  {['', 'early', 'peak', 'decline', 'rebuild', 'unknown'].map(e => (
                    <option key={e} value={e}>{e || '— unchanged —'}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Current season arc (most impactful — shown each week)</Label>
                <Textarea value={currentSeasonArc} onChange={e => setCurrentSeasonArc(e.target.value)} rows={3} placeholder="What is happening for this team THIS season?" className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Historical arc (1-2 sentences)</Label>
                <Textarea value={historicalArc} onChange={e => setHistoricalArc(e.target.value)} rows={2} className="text-sm" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Tone & Phrases</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Sensitivity level</Label>
                <select value={sensitivityLevel} onChange={e => setSensitivityLevel(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm">
                  {['', 'low', 'medium', 'high'].map(v => <option key={v} value={v}>{v || '— unchanged —'}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Running jokes / approved bits (one per line)</Label>
                <Textarea value={runningJokes} onChange={e => setRunningJokes(e.target.value)} rows={4} placeholder="e.g. Always the runner-up when they don't win it" className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Retired / overused jokes (one per line) — bots will avoid these</Label>
                <Textarea value={retiredJokes} onChange={e => setRetiredJokes(e.target.value)} rows={3} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Preferred narrative angles (one per line)</Label>
                <Textarea value={preferredAngles} onChange={e => setPreferredAngles(e.target.value)} rows={3} className="text-sm" />
              </div>
            </CardContent>
          </Card>

          <div className="md:col-span-2 text-xs text-[var(--muted)] bg-[var(--card)] p-3 rounded border border-[var(--border)]">
            <strong>Current effective card summary:</strong>{' '}
            archetype: {(cardData.archetype as string) || '—'} | era: {(cardData.era as string) || '—'} |{' '}
            runningJokes: {((cardData.runningJokes as string[]) || []).length} |{' '}
            retiredJokes: {((cardData.retiredJokes as string[]) || []).length}
          </div>
        </div>
      )}

      {msg && <div className={`text-sm p-3 rounded ${msg.startsWith('Save') || msg.startsWith('Override removed') ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>{msg}</div>}

      {selectedTeam && (
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save Card'}
          </Button>
          <Button onClick={handleReset} disabled={saving || loading} variant="secondary">
            Remove Override
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Phrases Panel ─────────────────────────────────────────────────────────────

function PhrasesPanel() {
  const COMMON_KEYS = ['banned_global', 'mason_openers', 'mason_closers', 'westy_openers', 'westy_closers'];
  const [poolKey, setPoolKey] = useState('banned_global');
  const [customKey, setCustomKey] = useState('');
  const [phrases, setPhrases] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const activeKey = poolKey === '__custom' ? customKey.trim() : poolKey;

  const load = useCallback(async () => {
    if (!activeKey) return;
    setLoading(true);
    setMsg('');
    try {
      const d = await adminFetch(`/api/admin/newsletter/phrase-pools?key=${encodeURIComponent(activeKey)}`);
      setPhrases((d.phrases ?? []).join('\n'));
      setAdminNotes(d.adminNotes ?? '');
    } catch {
      setPhrases('');
      setAdminNotes('');
    } finally {
      setLoading(false);
    }
  }, [activeKey]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!activeKey) { setMsg('Enter a pool key.'); return; }
    setSaving(true);
    setMsg('');
    try {
      await adminFetch('/api/admin/newsletter/phrase-pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolKey: activeKey,
          phrases: phrases.split('\n').map(s => s.trim()).filter(Boolean),
          adminNotes: adminNotes.trim() || undefined,
        }),
      });
      setMsg(`Saved ${activeKey}. Takes effect on next generation.`);
    } catch (e) {
      setMsg(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Label className="text-xs">Pool key</Label>
        <div className="flex gap-2 items-center flex-wrap">
          {COMMON_KEYS.map(k => (
            <button key={k} onClick={() => setPoolKey(k)} className={`px-3 py-1 rounded text-xs transition-colors ${poolKey === k ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]'}`}>
              {k}
            </button>
          ))}
          <button onClick={() => setPoolKey('__custom')} className={`px-3 py-1 rounded text-xs ${poolKey === '__custom' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)] text-[var(--muted)]'}`}>
            Custom…
          </button>
        </div>
        {poolKey === '__custom' && (
          <Input value={customKey} onChange={e => setCustomKey(e.target.value)} placeholder="e.g. team:Double Trouble:bits" className="mt-2 text-sm font-mono" />
        )}
      </div>

      <div className="text-xs text-[var(--muted)] p-3 bg-[var(--card)] rounded border border-[var(--border)] space-y-1">
        <div><strong>banned_global</strong> — phrases blocked by guardrails across all sections</div>
        <div><strong>mason_openers / westy_closers</strong> — additive phrase pools merged with hardcoded ones</div>
        <div><strong>team:Name:bits</strong> — team-specific approved angles (future use)</div>
      </div>

      {loading && <div className="text-sm text-[var(--muted)]">Loading…</div>}

      {!loading && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Phrases — one per line</Label>
            <Textarea value={phrases} onChange={e => setPhrases(e.target.value)} rows={10} className="text-sm font-mono" placeholder={activeKey === 'banned_global' ? 'collusion\nofficial ruling\ncheating' : 'One phrase per line'} />
          </div>
          <div>
            <Label className="text-xs">Admin notes (not injected into prompts)</Label>
            <Input value={adminNotes} onChange={e => setAdminNotes(e.target.value)} className="text-sm" />
          </div>
        </div>
      )}

      {msg && <div className={`text-sm p-3 rounded ${msg.startsWith('Save') ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>{msg}</div>}

      <Button onClick={handleSave} disabled={saving || loading || !activeKey}>
        {saving ? 'Saving…' : 'Save Pool'}
      </Button>
    </div>
  );
}

// ── Preview Panel ─────────────────────────────────────────────────────────────

function PreviewPanel() {
  const [bot, setBot] = useState<Bot>('entertainer');
  const [sectionType, setSectionType] = useState('Recap_0');
  const [episodeType, setEpisodeType] = useState('regular');
  const [week, setWeek] = useState('8');
  const [season, setSeason] = useState('2025');
  const [team1, setTeam1] = useState('Double Trouble');
  const [team2, setTeam2] = useState('Belltown Raptors');
  const [matchupMargin, setMatchupMargin] = useState('14.5');
  const [sampleText, setSampleText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [err, setErr] = useState('');

  const SECTION_TYPES = ['Recap_0', 'Trade_0', 'Spotlight', 'WaiversAndFA', 'Intro', 'FinalWord', 'Forecast', 'Blurt'];
  const EPISODE_TYPES = ['regular', 'preseason', 'pre_draft', 'post_draft', 'trade_deadline', 'playoffs_preview', 'playoffs_round', 'championship', 'season_finale', 'offseason'];

  const handlePreview = async () => {
    setLoading(true);
    setErr('');
    setResult(null);
    try {
      const d: PreviewResult = await adminFetch('/api/admin/newsletter/personality-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot,
          sectionType,
          episodeType,
          week: parseInt(week) || 8,
          season: parseInt(season) || 2025,
          teamNames: [team1, team2].filter(Boolean),
          matchupMargin: parseFloat(matchupMargin) || undefined,
          sampleText: sampleText.trim() || undefined,
        }),
      });
      setResult(d);
    } catch (e) {
      setErr(`Preview failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Bot</Label>
          <select value={bot} onChange={e => setBot(e.target.value as Bot)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm">
            <option value="entertainer">Mason Reed</option>
            <option value="analyst">Westy</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Section type</Label>
          <select value={sectionType} onChange={e => setSectionType(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm">
            {SECTION_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Episode type</Label>
          <select value={episodeType} onChange={e => setEpisodeType(e.target.value)} className="w-full bg-[var(--card)] border border-[var(--border)] rounded px-3 py-2 text-sm">
            {EPISODE_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Week / Season</Label>
          <div className="flex gap-1">
            <Input value={week} onChange={e => setWeek(e.target.value)} placeholder="8" className="text-sm" />
            <Input value={season} onChange={e => setSeason(e.target.value)} placeholder="2025" className="text-sm" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Team 1</Label>
          <Input value={team1} onChange={e => setTeam1(e.target.value)} className="text-sm" />
        </div>
        <div>
          <Label className="text-xs">Team 2</Label>
          <Input value={team2} onChange={e => setTeam2(e.target.value)} className="text-sm" />
        </div>
        <div>
          <Label className="text-xs">Matchup margin</Label>
          <Input value={matchupMargin} onChange={e => setMatchupMargin(e.target.value)} placeholder="14.5" className="text-sm" />
        </div>
      </div>

      <div>
        <Label className="text-xs">Sample output text (optional — run guardrail check)</Label>
        <Textarea value={sampleText} onChange={e => setSampleText(e.target.value)} rows={3} placeholder="Paste draft output here to check guardrails…" className="text-sm" />
      </div>

      <Button onClick={handlePreview} disabled={loading}>
        {loading ? 'Running preview…' : 'Run Preview'}
      </Button>

      {err && <div className="text-sm p-3 bg-red-900/30 text-red-300 rounded">{err}</div>}

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Results for {result.bot} — {result.sectionType} ({result.episodeType})</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="font-medium text-[var(--foreground)] mb-1">Event Judgment</div>
                  <div className="text-[var(--muted)] space-y-1">
                    <div>Stakes: <span className="text-[var(--foreground)]">{result.judgment.stakes}</span></div>
                    <div>Comedy: <span className="text-[var(--foreground)]">{result.judgment.comedyValue}/10</span></div>
                    <div>Sensitivity: <span className="text-[var(--foreground)]">{result.judgment.sensitivity}/10</span></div>
                    <div>Rivalry: <span className="text-[var(--foreground)]">{result.judgment.rivalryScore}/10</span></div>
                    <div className="text-xs mt-1 italic">{result.judgment.note}</div>
                  </div>
                </div>
                <div>
                  <div className="font-medium text-[var(--foreground)] mb-1">Narrative Heat</div>
                  <div className="text-[var(--muted)] space-y-1">
                    <div>Score: <span className="text-[var(--foreground)]">{result.narrativeHeat.score}/100 ({result.narrativeHeat.tier})</span></div>
                    <div className="text-xs">{result.narrativeHeat.factors.slice(0, 4).join(', ')}</div>
                  </div>
                </div>
                <div>
                  <div className="font-medium text-[var(--foreground)] mb-1">Selected Stance</div>
                  <div className="text-[var(--accent)] font-medium">{result.stance}</div>
                  <div className="text-[var(--muted)] text-xs mt-1">{result.stanceInstructions.slice(0, 120)}…</div>
                </div>
                <div>
                  <div className="font-medium text-[var(--foreground)] mb-1">Phase: {result.phaseRules.name}</div>
                  <div className="text-[var(--muted)] text-xs space-y-0.5">
                    <div>Priority: {result.phaseRules.priorities[0]}</div>
                    <div>Avoid: {result.phaseRules.avoidances[0]}</div>
                    <div>Preferred: {result.phaseRules.preferredStances.slice(0, 2).join(', ')}</div>
                  </div>
                </div>
              </div>

              {result.judgment.avoidList.length > 0 && (
                <div className="p-2 bg-yellow-900/20 rounded text-xs text-yellow-300">
                  <strong>Avoid:</strong> {result.judgment.avoidList.join('; ')}
                </div>
              )}

              {result.guardrailResult && (
                <div className={`p-2 rounded text-xs ${result.guardrailResult.blocked ? 'bg-red-900/30 text-red-300' : result.guardrailResult.warningCount > 0 ? 'bg-yellow-900/20 text-yellow-300' : 'bg-green-900/20 text-green-300'}`}>
                  <strong>Guardrails:</strong>{' '}
                  {result.guardrailResult.blocked ? '🚫 BLOCKED' : result.guardrailResult.warningCount > 0 ? `⚠️ ${result.guardrailResult.warningCount} warning(s)` : '✅ Clean'}
                  {result.guardrailResult.warnings.map((w, i) => (
                    <div key={i} className="mt-1">[{w.severity}] {w.rule}: &ldquo;{w.snippet}&rdquo;</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
