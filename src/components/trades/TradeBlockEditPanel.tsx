'use client';

import { useMemo, useState, type Dispatch, type InputHTMLAttributes, type ReactNode, type SetStateAction } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import {
  BroadcastPanel,
  BroadcastSubmitButton,
  PANEL,
  broadcastFieldClass,
  broadcastFieldStyle,
  broadcastLabelClass,
  teamAccent,
} from '@/components/ui/BroadcastPanel';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import type { AssetsResponse, PlayersLookup, TradeWants } from '@/components/trades/TradeBlockTab';

const WANT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', '1st', '2nd', '3rd'];
const PLAYER_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
type AssetSection = 'players' | 'picks' | 'faab';

type Pick = { year: number; round: number; originalTeam: string };

export type TradeBlockEditPanelProps = {
  myTeam: string | null;
  myAssets: AssetsResponse;
  playerNames: PlayersLookup;
  selPlayers: Record<string, boolean>;
  setSelPlayers: Dispatch<SetStateAction<Record<string, boolean>>>;
  selPicks: Record<string, boolean>;
  setSelPicks: Dispatch<SetStateAction<Record<string, boolean>>>;
  faabOn: boolean;
  setFaabOn: Dispatch<SetStateAction<boolean>>;
  faabAmt: number;
  setFaabAmt: Dispatch<SetStateAction<number>>;
  wantsText: string;
  setWantsText: Dispatch<SetStateAction<string>>;
  wantsPos: Record<string, boolean>;
  setWantsPos: Dispatch<SetStateAction<Record<string, boolean>>>;
  contactMethod: TradeWants['contactMethod'];
  setContactMethod: Dispatch<SetStateAction<TradeWants['contactMethod']>>;
  phone: string;
  setPhone: Dispatch<SetStateAction<string>>;
  snap: string;
  setSnap: Dispatch<SetStateAction<string>>;
  saving: boolean;
  dirty: boolean;
  saveStatus: string | null;
  saveError: string | null;
  pickLabel: (asset: Pick) => string;
  pickSlot: (asset: { year: number; originalTeam: string }) => number;
  onSave: () => void;
  onDiscard: () => void;
};

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className={broadcastLabelClass} style={{ color: PANEL.faint }}>{children}</label>;
}

function InlineInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[broadcastFieldClass, props.className].filter(Boolean).join(' ')}
      style={{ ...broadcastFieldStyle, ...props.style }}
    />
  );
}

function pickKey(p: Pick): string {
  return [p.year, p.round, p.originalTeam].join('-');
}

function CountBadge({ value }: { value: number }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{ background: PANEL.tintStronger, color: PANEL.text }}>
      {value}
    </span>
  );
}

function SmallTag({ children, accent }: { children: ReactNode; accent: string }) {
  return (
    <span className="inline-flex min-w-10 shrink-0 justify-center rounded-md px-2 py-1 text-[11px] font-bold"
      style={{ color: accent, background: accent + '1b', border: '1px solid ' + accent + '45' }}>
      {children}
    </span>
  );
}

function SelectionButton({ selected, onClick, accent }: {
  selected: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={selected ? 'Remove from trade block' : 'Add to trade block'}
      aria-pressed={selected}
      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        color: selected ? PANEL.text : accent,
        background: selected ? PANEL.tintStrong : accent + '16',
        border: '1px solid ' + (selected ? PANEL.border : accent + '55'),
        outlineColor: accent,
      }}
    >
      {selected ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
      {selected ? 'Added' : 'Add'}
    </button>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={'Remove ' + label + ' from trade block'}
      className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors hover:bg-[var(--panel-tint-strong)] focus-visible:outline focus-visible:outline-2"
      style={{ color: PANEL.muted, borderColor: PANEL.hairline }}
    >
      <X size={15} aria-hidden="true" /> Remove
    </button>
  );
}

export default function TradeBlockEditPanel({
  myTeam, myAssets, playerNames, selPlayers, setSelPlayers, selPicks, setSelPicks,
  faabOn, setFaabOn, faabAmt, setFaabAmt, wantsText, setWantsText, wantsPos,
  setWantsPos, contactMethod, setContactMethod, phone, setPhone, snap, setSnap,
  saving, dirty, saveStatus, saveError, pickLabel, pickSlot, onSave, onDiscard,
}: TradeBlockEditPanelProps) {
  const accent = teamAccent(myTeam);
  const [section, setSection] = useState<AssetSection>('players');
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<string>('ALL');
  const [pickYear, setPickYear] = useState<number | null>(null);

  const players = useMemo(() =>
    [...myAssets.players].sort((a, b) =>
      (playerNames[a]?.name || a).localeCompare(playerNames[b]?.name || b)
    ), [myAssets.players, playerNames]
  );
  const selectedPlayers = players.filter((pid) => selPlayers[pid]);
  const picks = useMemo(() => [...myAssets.picks].sort((a, b) =>
    a.year - b.year || a.round - b.round || pickSlot(a) - pickSlot(b) ||
    a.originalTeam.localeCompare(b.originalTeam)
  // pickSlot depends on the latest draft order held by the parent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [myAssets.picks, pickSlot]);
  const selectedPicks = picks.filter((p) => selPicks[pickKey(p)]);
  const years = Array.from(new Set(picks.map((p) => p.year))).sort((a, b) => a - b);
  const selectedCount = selectedPlayers.length + selectedPicks.length + Number(faabOn);
  const filteredPlayers = players.filter((pid) => {
    const p = playerNames[pid];
    const matchesPosition = position === 'ALL' || p?.position?.toUpperCase() === position;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [p?.name, p?.team, p?.position, pid]
      .some((s) => (s || '').toLowerCase().includes(query));
    return matchesPosition && matchesSearch;
  });

  const togglePlayer = (pid: string) => setSelPlayers((prev) => ({ ...prev, [pid]: !prev[pid] }));
  const togglePick = (p: Pick) => {
    const key = pickKey(p);
    setSelPicks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <form className="space-y-5 pb-3" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <BroadcastPanel accent={accent} title="Currently on Your Block" meta={myTeam || undefined}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold" style={{ color: PANEL.text }}>Your listed assets</h2>
            <p className="mt-1 text-sm" style={{ color: PANEL.muted }}>
              Remove anything here in one click, or add more below.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: PANEL.muted }}>
            <CountBadge value={selectedCount} /> listed
          </div>
        </div>
        {selectedCount === 0 ? (
          <div className="rounded-xl border border-dashed px-5 py-7 text-center"
            style={{ borderColor: PANEL.border, color: PANEL.muted, background: PANEL.tintSoft }}>
            <p className="font-semibold" style={{ color: PANEL.text }}>Your block is empty</p>
            <p className="mt-1 text-sm">Choose players, picks, or FAAB below to start listing assets.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {selectedPlayers.map((pid) => {
              const p = playerNames[pid];
              const name = p?.name || pid;
              return (
                <div key={'selected-' + pid} className="flex min-w-0 items-center gap-2 rounded-xl border p-3"
                  style={{ borderColor: PANEL.hairline, background: PANEL.tintSoft }}>
                  <SmallTag accent={accent}>{p?.position || 'PLR'}</SmallTag>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: PANEL.text }}>{name}</div>
                    {p?.team && <div className="text-xs" style={{ color: PANEL.muted }}>{p.team}</div>}
                  </div>
                  <RemoveButton label={name} onClick={() => togglePlayer(pid)} />
                </div>
              );
            })}
            {selectedPicks.map((p) => {
              const label = p.year + ' ' + pickLabel(p);
              return (
                <div key={'selected-' + pickKey(p)} className="flex min-w-0 items-center gap-2 rounded-xl border p-3"
                  style={{ borderColor: PANEL.hairline, background: PANEL.tintSoft }}>
                  <SmallTag accent={accent}>{'R' + p.round}</SmallTag>
                  <div className="min-w-0 flex-1 text-sm font-semibold" style={{ color: PANEL.text }}>{label}</div>
                  <RemoveButton label={label} onClick={() => togglePick(p)} />
                </div>
              );
            })}
            {faabOn && (
              <div className="flex min-w-0 items-center gap-2 rounded-xl border p-3"
                style={{ borderColor: PANEL.hairline, background: PANEL.tintSoft }}>
                <SmallTag accent={accent}>FAAB</SmallTag>
                <div className="min-w-0 flex-1 text-sm font-semibold" style={{ color: PANEL.text }}>
                  {'$' + faabAmt + ' FAAB'}
                </div>
                <RemoveButton label="FAAB" onClick={() => setFaabOn(false)} />
              </div>
            )}
          </div>
        )}
      </BroadcastPanel>

      <BroadcastPanel accent={accent} title="Add Assets" meta="Choose what to shop">
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Asset type">
          {([
            ['players', 'Players', selectedPlayers.length],
            ['picks', 'Draft picks', selectedPicks.length],
            ['faab', 'FAAB', Number(faabOn)],
          ] as const).map(([value, label, count]) => {
            const active = section === value;
            return (
              <button key={value} type="button" onClick={() => setSection(value)} aria-pressed={active}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2"
                style={{
                  color: active ? accent : PANEL.muted,
                  background: active ? accent + '16' : PANEL.tintSoft,
                  borderColor: active ? accent + '65' : PANEL.hairline,
                }}>
                {label} <CountBadge value={count} />
              </button>
            );
          })}
        </div>

        {section === 'players' && (
          <div>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: PANEL.muted }} aria-hidden="true" />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your roster..." aria-label="Search your roster"
                  className="min-h-11 w-full rounded-lg border py-2 pl-10 pr-3 text-sm outline-none focus-visible:ring-2"
                  style={{ background: PANEL.tintMedium, borderColor: PANEL.hairline, color: PANEL.text }} />
              </div>
              <p className="text-xs font-semibold tabular-nums" style={{ color: PANEL.muted }}>
                {filteredPlayers.length} of {players.length} players
              </p>
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter roster by position">
              {PLAYER_FILTERS.map((pos) => {
                const active = position === pos;
                return (
                  <button key={pos} type="button" aria-pressed={active} onClick={() => setPosition(pos)}
                    className="min-h-9 rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2"
                    style={{ color: active ? accent : PANEL.muted, background: active ? accent + '16' : 'transparent',
                      borderColor: active ? accent + '65' : PANEL.hairline }}>
                    {pos === 'ALL' ? 'All' : pos}
                  </button>
                );
              })}
            </div>
            {filteredPlayers.length === 0 ? (
              <div className="rounded-xl border border-dashed py-8 text-center text-sm"
                style={{ color: PANEL.muted, borderColor: PANEL.border }}>
                {players.length === 0 ? 'No rostered players available.' : 'No players match these filters.'}
                {(search || position !== 'ALL') && (
                  <button type="button" className="ml-2 font-semibold underline"
                    style={{ color: accent }} onClick={() => { setSearch(''); setPosition('ALL'); }}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {filteredPlayers.map((pid) => {
                  const p = playerNames[pid];
                  const active = !!selPlayers[pid];
                  return (
                    <div key={pid} className="flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3"
                      style={{ background: active ? accent + '0c' : PANEL.tintSoft,
                        borderColor: active ? accent + '55' : PANEL.hairline }}>
                      <SmallTag accent={accent}>{p?.position || 'PLR'}</SmallTag>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold" style={{ color: PANEL.text }}
                          title={p?.name || pid}>{p?.name || pid}</div>
                        {p?.team && <div className="text-xs" style={{ color: PANEL.muted }}>{p.team}</div>}
                      </div>
                      <SelectionButton selected={active} onClick={() => togglePlayer(pid)} accent={accent} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {section === 'picks' && (
          <div>
            {picks.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-sm"
                style={{ color: PANEL.muted, borderColor: PANEL.border }}>No draft picks currently owned.</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter picks by year">
                  <button type="button" onClick={() => setPickYear(null)}
                    aria-pressed={pickYear === null} className="min-h-9 rounded-full border px-3 text-xs font-semibold"
                    style={{ color: pickYear === null ? accent : PANEL.muted,
                      borderColor: pickYear === null ? accent + '65' : PANEL.hairline }}>All years</button>
                  {years.map((year) => (
                    <button type="button" key={year} onClick={() => setPickYear(year)}
                      aria-pressed={pickYear === year} className="min-h-9 rounded-full border px-3 text-xs font-semibold"
                      style={{ color: pickYear === year ? accent : PANEL.muted,
                        borderColor: pickYear === year ? accent + '65' : PANEL.hairline }}>{year}</button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {picks.filter((p) => pickYear === null || p.year === pickYear).map((p) => {
                    const active = !!selPicks[pickKey(p)];
                    return (
                      <div key={pickKey(p)} className="flex min-w-0 items-center gap-3 rounded-xl border p-3"
                        style={{ background: active ? accent + '0c' : PANEL.tintSoft,
                          borderColor: active ? accent + '55' : PANEL.hairline }}>
                        <SmallTag accent={accent}>{p.year}</SmallTag>
                        <div className="min-w-0 flex-1 text-sm font-semibold" style={{ color: PANEL.text }}>
                          {pickLabel(p)}
                        </div>
                        <SelectionButton selected={active} onClick={() => togglePick(p)} accent={accent} />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {section === 'faab' && (
          <div className="max-w-lg rounded-xl border p-4 sm:p-5"
            style={{ borderColor: PANEL.hairline, background: PANEL.tintSoft }}>
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold"
              style={{ color: PANEL.text }}>
              <input type="checkbox" checked={faabOn} onChange={(e) => setFaabOn(e.target.checked)}
                className="h-5 w-5" style={{ accentColor: accent }} />
              Make FAAB available for trade
            </label>
            <div className="mt-4 flex items-end gap-3">
              <div className="w-40">
                <FieldLabel>Amount to list ($)</FieldLabel>
                <InlineInput type="number" min={0} max={myAssets.faab} step={1}
                  value={faabAmt} onChange={(e) => setFaabAmt(Math.max(0, Math.min(myAssets.faab, Number(e.target.value) || 0)))}
                  disabled={!faabOn} aria-label="FAAB amount" />
              </div>
              <div className="pb-2 text-xs" style={{ color: PANEL.muted }}>
                {'$' + myAssets.faab + ' available'}
              </div>
            </div>
          </div>
        )}
      </BroadcastPanel>

      <BroadcastPanel accent={accent} title="Trade Preferences" meta="Optional details">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <FieldLabel>What are you looking for?</FieldLabel>
            <Textarea rows={3} maxLength={300} value={wantsText}
              onChange={(e) => setWantsText(e.target.value)}
              placeholder="Example: young WRs, RB depth, future picks"
              className="!bg-[var(--panel-tint-medium)] !border-[var(--panel-hairline)] !text-[var(--panel-text)] !shadow-none placeholder:!text-[var(--panel-faint)]" />
            <p className="mt-1 text-right text-xs tabular-nums" style={{ color: PANEL.muted }}>
              {wantsText.length}/300
            </p>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Positions wanted">
              {WANT_POSITIONS.map((pos) => {
                const active = !!wantsPos[pos];
                return (
                  <button key={pos} type="button" aria-pressed={active}
                    onClick={() => setWantsPos((prev) => ({ ...prev, [pos]: !prev[pos] }))}
                    className="min-h-9 rounded-lg border px-3 text-xs font-bold transition-colors"
                    style={{ color: active ? accent : PANEL.muted,
                      background: active ? accent + '16' : 'transparent',
                      borderColor: active ? accent + '65' : PANEL.hairline }}>
                    {active && <Check size={12} className="mr-1 inline" aria-hidden="true" />}
                    {pos}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <FieldLabel>Preferred contact method</FieldLabel>
            <Select size="sm" value={contactMethod || ''} onChange={(e) =>
              setContactMethod((e.target.value || undefined) as TradeWants['contactMethod'])}
              className="!bg-[var(--panel-tint-medium)] !border-[var(--panel-hairline)] !text-[var(--panel-text)] !shadow-none">
              <option value="">No preference</option>
              <option value="text">Text</option>
              <option value="discord">Discord</option>
              <option value="snap">Snapchat</option>
              <option value="sleeper">Sleeper DM</option>
            </Select>
            {contactMethod === 'text' && (
              <div className="mt-3">
                <FieldLabel>Phone number</FieldLabel>
                <InlineInput type="tel" placeholder="Phone number" value={phone}
                  onChange={(e) => setPhone(e.target.value)} maxLength={20} autoComplete="tel" />
              </div>
            )}
            {contactMethod === 'snap' && (
              <div className="mt-3">
                <FieldLabel>Snapchat username</FieldLabel>
                <InlineInput type="text" placeholder="Snap username" value={snap}
                  onChange={(e) => setSnap(e.target.value)} maxLength={30} />
              </div>
            )}
            <p className="mt-3 text-xs leading-5" style={{ color: PANEL.muted }}>
              These preferences appear on your published trade block.
            </p>
          </div>
        </div>
      </BroadcastPanel>

      <div className="sticky bottom-2 z-20 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-xl sm:px-5"
        style={{ background: 'var(--panel-surface)', borderColor: PANEL.border }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm" aria-live="polite">
            {saveError ? (
              <span style={{ color: 'var(--danger)' }}>{saveError}</span>
            ) : dirty ? (
              <span className="font-semibold" style={{ color: PANEL.text }}>Unsaved changes</span>
            ) : saveStatus ? (
              <span className="font-semibold" style={{ color: accent }}>{saveStatus}</span>
            ) : (
              <span style={{ color: PANEL.muted }}>Your block is up to date.</span>
            )}
            <div className="mt-0.5 text-xs" style={{ color: PANEL.muted }}>
              {selectedCount} asset{selectedCount === 1 ? '' : 's'} selected
            </div>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button type="button" onClick={onDiscard} disabled={saving || !dirty}
              className="min-h-11 flex-1 rounded-lg border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
              style={{ color: PANEL.muted, borderColor: PANEL.hairline }}>Discard</button>
            <div className="flex-1 sm:flex-none">
              <BroadcastSubmitButton accent={accent} disabled={saving || !dirty}>
                {saving ? 'Saving...' : 'Save changes'}
              </BroadcastSubmitButton>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

export function TradeBlockEditPanelPlaceholder({
  message, accentTeam,
}: {
  message: string;
  accentTeam?: string | null;
}) {
  return (
    <BroadcastPanel accent={teamAccent(accentTeam)} title="Manage Your Block">
      <p className="text-sm" style={{ color: PANEL.muted }}>{message}</p>
    </BroadcastPanel>
  );
}
