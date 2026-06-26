'use client';

import { type Dispatch, type InputHTMLAttributes, type ReactNode, type SetStateAction } from 'react';
import {
  BroadcastPanel,
  BroadcastSubmitButton,
  broadcastBodyTextStyle,
  broadcastFieldClass,
  broadcastFieldStyle,
  broadcastFaintTextStyle,
  broadcastLabelClass,
  broadcastMutedTextStyle,
  broadcastScrollBoxClass,
  broadcastScrollBoxStyle,
  teamAccent,
} from '@/components/ui/BroadcastPanel';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import type {
  AssetsResponse,
  PlayersLookup,
  TradeWants,
} from '@/components/trades/TradeBlockTab';

const WANT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', '1st', '2nd', '3rd'];

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
  pickLabel: (asset: { year: number; round: number; originalTeam: string }) => string;
  pickSlot: (asset: { year: number; originalTeam: string }) => number;
  onSave: () => void;
};

function BroadcastFieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className={broadcastLabelClass} style={broadcastFaintTextStyle}>
      {children}
    </span>
  );
}

function BroadcastInlineInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[broadcastFieldClass, props.className].filter(Boolean).join(' ')}
      style={{ ...broadcastFieldStyle, ...props.style }}
    />
  );
}

function BroadcastCheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer" style={broadcastBodyTextStyle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded accent-white"
      />
      <span>{children}</span>
    </label>
  );
}

export default function TradeBlockEditPanel({
  myTeam,
  myAssets,
  playerNames,
  selPlayers,
  setSelPlayers,
  selPicks,
  setSelPicks,
  faabOn,
  setFaabOn,
  faabAmt,
  setFaabAmt,
  wantsText,
  setWantsText,
  wantsPos,
  setWantsPos,
  contactMethod,
  setContactMethod,
  phone,
  setPhone,
  snap,
  setSnap,
  saving,
  pickLabel,
  pickSlot,
  onSave,
}: TradeBlockEditPanelProps) {
  const accent = teamAccent(myTeam);

  const picksByYear = myAssets.picks.reduce<
    Record<number, { year: number; round: number; originalTeam: string }[]>
  >((acc, p) => {
    if (!acc[p.year]) acc[p.year] = [];
    acc[p.year].push(p);
    return acc;
  }, {});
  const years =
    myAssets.years && myAssets.years.length > 0
      ? myAssets.years
      : Object.keys(picksByYear)
          .map(Number)
          .sort((a, b) => a - b);

  return (
    <BroadcastPanel
      accent={accent}
      title="Edit Block"
      meta={myTeam || undefined}
      bodyClassName="!px-4 !py-4 sm:!px-5"
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <div>
          <BroadcastFieldLabel>Players</BroadcastFieldLabel>
          <div className={broadcastScrollBoxClass} style={broadcastScrollBoxStyle}>
            {myAssets.players.length === 0 ? (
              <div className="text-sm" style={broadcastMutedTextStyle}>
                No players found.
              </div>
            ) : (
              myAssets.players.map((pid) => (
                <BroadcastCheckRow
                  key={pid}
                  checked={!!selPlayers[pid]}
                  onChange={(checked) => setSelPlayers((s) => ({ ...s, [pid]: checked }))}
                >
                  {playerNames[pid]?.position ? `${playerNames[pid].position} - ` : ''}
                  {playerNames[pid]?.name || pid}
                  {playerNames[pid]?.team ? ` (${playerNames[pid].team})` : ''}
                </BroadcastCheckRow>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          {years.length === 0 ? (
            <div>
              <BroadcastFieldLabel>Picks</BroadcastFieldLabel>
              <div className="text-sm" style={broadcastMutedTextStyle}>
                No picks owned.
              </div>
            </div>
          ) : (
            years.map((year) => (
              <div key={year}>
                <BroadcastFieldLabel>Picks ({year})</BroadcastFieldLabel>
                <div className={[broadcastScrollBoxClass, 'max-h-48'].join(' ')} style={broadcastScrollBoxStyle}>
                  {[...(picksByYear[year] || [])]
                    .sort((a, b) => a.round - b.round || pickSlot(a) - pickSlot(b))
                    .map((p) => {
                      const key = `${p.year}-${p.round}-${p.originalTeam}`;
                      return (
                        <BroadcastCheckRow
                          key={key}
                          checked={!!selPicks[key]}
                          onChange={(checked) => setSelPicks((s) => ({ ...s, [key]: checked }))}
                        >
                          {p.year} {pickLabel(p)}
                        </BroadcastCheckRow>
                      );
                    })}
                </div>
              </div>
            ))
          )}
        </div>

        <div>
          <BroadcastFieldLabel>FAAB</BroadcastFieldLabel>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={faabOn}
              onChange={(e) => setFaabOn(e.target.checked)}
              className="rounded accent-white"
            />
            <BroadcastInlineInput
              type="number"
              min={0}
              max={myAssets.faab}
              value={faabAmt}
              onChange={(e) => setFaabAmt(Number(e.target.value))}
              disabled={!faabOn}
              className="!w-24"
              aria-label="FAAB amount"
            />
            <span className="text-xs" style={broadcastMutedTextStyle}>
              Available: ${myAssets.faab}
            </span>
          </div>
        </div>

        <div>
          <BroadcastFieldLabel>Preferred Contact</BroadcastFieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              size="sm"
              fullWidth={false}
              value={contactMethod || ''}
              onChange={(e) =>
                setContactMethod((e.target.value || undefined) as TradeWants['contactMethod'])
              }
              className="!bg-[var(--panel-tint-medium)] !border-[var(--panel-hairline)] !text-[var(--panel-text)] !shadow-none"
            >
              <option value="">No preference</option>
              <option value="text">Text</option>
              <option value="discord">Discord</option>
              <option value="snap">Snap</option>
              <option value="sleeper">Sleeper</option>
            </Select>
            {contactMethod === 'text' ? (
              <BroadcastInlineInput
                type="tel"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="!w-auto min-w-[10rem]"
              />
            ) : null}
            {contactMethod === 'snap' ? (
              <BroadcastInlineInput
                type="text"
                placeholder="Snap username"
                value={snap}
                onChange={(e) => setSnap(e.target.value)}
                className="!w-auto min-w-[10rem]"
              />
            ) : null}
          </div>
        </div>

        <div>
          <BroadcastFieldLabel>What are you looking for?</BroadcastFieldLabel>
          <Textarea
            rows={3}
            value={wantsText}
            onChange={(e) => setWantsText(e.target.value)}
            placeholder="e.g., WR depth, 2026 picks"
            className="!bg-[var(--panel-tint-medium)] !border-[var(--panel-hairline)] !text-[var(--panel-text)] !shadow-none placeholder:!text-[var(--panel-faint)]"
          />
          <div className="mt-2 flex flex-wrap gap-3">
            {WANT_POSITIONS.map((p) => (
              <BroadcastCheckRow
                key={p}
                checked={!!wantsPos[p]}
                onChange={(checked) => setWantsPos((s) => ({ ...s, [p]: checked }))}
              >
                {p}
              </BroadcastCheckRow>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <BroadcastSubmitButton accent={accent} disabled={saving}>
            {saving ? 'Saving…' : 'Save Trade Block'}
          </BroadcastSubmitButton>
        </div>
      </form>
    </BroadcastPanel>
  );
}

export function TradeBlockEditPanelPlaceholder({
  message,
  accentTeam,
}: {
  message: string;
  accentTeam?: string | null;
}) {
  return (
    <BroadcastPanel accent={teamAccent(accentTeam)} title="Edit Block">
      <p className="text-sm" style={broadcastMutedTextStyle}>
        {message}
      </p>
    </BroadcastPanel>
  );
}
