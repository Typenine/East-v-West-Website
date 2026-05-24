'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';

const SECTIONS = ['Playoff Bracket', 'Toilet Bowl', 'Draft Order', 'Quick Reference'];

const GLD = '#f59e0b';
const SIL = '#94a3b8';
const BRZ = '#cd7c3a';
const RED = '#ef4444';
const GRN = '#22c55e';
const BLU = '#60a5fa';
const PRP = '#a78bfa';
const BG   = '#09090f';
const CARD = '#10121a';
const BDR  = '#1e2030';
const TXT  = '#e2e8f0';
const MUT  = '#6b7280';

const pSt: CSSProperties = { color: '#94a3b8', lineHeight: '1.75', marginBottom: '16px', fontSize: '14px' };

export default function PlayoffStructure() {
  const [active, setActive] = useState(0);
  const [draftSub, setDraftSub] = useState(0);

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: BG, color: TXT, borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg, #09090f, #0f1020, #09090f)', borderBottom: '3px solid ' + GLD, padding: '24px 24px 18px', position: 'relative', overflow: 'hidden' }}>
        {[20, 40, 60, 80].map(p => (
          <div key={p} style={{ position: 'absolute', top: 0, bottom: 0, left: p + '%', width: '1px', background: 'rgba(245,158,11,0.04)' }} />
        ))}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '4px', color: GLD, textTransform: 'uppercase', marginBottom: '6px' }}>East v. West Dynasty League</div>
          <h2 style={{ margin: 0, fontSize: 'clamp(20px,5vw,34px)', fontWeight: '900', color: '#fff' }}>Playoffs · Draft Order · Payouts</h2>
          <div style={{ marginTop: '6px', fontSize: '12px', color: MUT, letterSpacing: '2px', textTransform: 'uppercase' }}>Complete Season Outcomes Reference</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', overflowX: 'auto', background: '#06060c', borderBottom: '1px solid ' + BDR, padding: '0 4px' }}>
        {SECTIONS.map((s, i) => (
          <button key={i} onClick={() => setActive(i)} style={{ background: active === i ? GLD : 'transparent', color: active === i ? '#000' : MUT, border: 'none', padding: '12px 16px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '11px', fontWeight: active === i ? '900' : '400', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px 40px' }}>

        {active === 0 && (
          <div>
            <SHead title="Playoff Bracket" sub="7 teams, single elimination, Seed 1 bye, Weeks 15-17" />
            <p style={pSt}>The top 7 teams by Regular Season record qualify. Seed 1 earns a bye. Each exit point determines both payout and draft pick.</p>
            <WkBar week="Week 15" label="Round 1" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div style={{ background: BLU + '12', border: '2px solid ' + BLU + '44', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '110px', textAlign: 'center' }}>
                <div style={{ color: BLU, fontWeight: '900', fontSize: '16px' }}>Seed 1</div>
                <div style={{ background: GLD + '20', border: '1px solid ' + GLD + '55', color: GLD, fontSize: '11px', fontWeight: '900', padding: '3px 10px', borderRadius: '12px', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>First-Round Bye</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Mtchup a="Seed 2" b="Seed 7" note="Loser gets Pick 6, 7, or 8" nc={SIL} />
                <Mtchup a="Seed 3" b="Seed 6" note="Loser gets Pick 6, 7, or 8" nc={SIL} />
                <Mtchup a="Seed 4" b="Seed 5" note="Loser gets Pick 6, 7, or 8" nc={SIL} />
              </div>
            </div>
            <ExBanner color={SIL} text="3 Round 1 losers get Picks 6, 7, 8 ordered by worst Regular Season record" />
            <WkBar week="Week 16" label="Semifinals" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <Mtchup a="Seed 1" b="Lowest remaining seed" note="Loser goes to 3rd Place Game" nc={PRP} />
              <Mtchup a="Higher remaining" b="Lower remaining" note="Loser goes to 3rd Place Game" nc={PRP} />
            </div>
            <ExBanner color={PRP} text="2 Semifinal losers play each other in the 3rd Place Game (Week 17)" />
            <WkBar week="Week 17" label="Championship + 3rd Place Game" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <ResCard icon="(4th)" label="3rd Place Loser" color={BRZ} payout="$0" pick="Pick 9" />
                <ResCard icon="(3rd)" label="3rd Place Winner" color={BRZ} payout="$105" pick="Pick 10" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <ResCard icon="(2nd)" label="Runner-Up" color={SIL} payout="$180" pick="Pick 11" />
                <ResCard icon="(1st)" label="League Champion" color={GLD} payout="$365" pick="Pick 12" />
              </div>
            </div>
            <NoteB color={BLU} text="Seeding tiebreakers: Overall Record, then Points For, then Points Against, then Commissioners' discretion." />
          </div>
        )}

        {active === 1 && (
          <div>
            <SHead title="Toilet Bowl" sub="5 non-playoff teams, loser advancement, Weeks 15-17" />
            <p style={pSt}>The five teams that miss the playoffs enter a separate bracket on Sleeper. It uses loser advancement — losing each round moves you closer to last place.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              <div style={{ background: RED + '10', border: '2px solid ' + RED + '33', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: RED, fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Lose a game</div>
                <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.6' }}>You advance further into the bracket — toward Last Place. Keep losing and you reach the Toilet Bowl Final.</div>
              </div>
              <div style={{ background: GRN + '10', border: '2px solid ' + GRN + '33', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: GRN, fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Win a game</div>
                <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.6' }}>You exit the last-place race. You play in the consolation 10th Place matchup instead. Win that game and you earn the $20 Toilet Bowl prize.</div>
              </div>
            </div>
            <div style={{ background: CARD, border: '1px solid ' + GLD + '33', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
              <div style={{ color: GLD, fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Path to 10th Place ($20)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ background: GRN + '18', border: '1px solid ' + GRN + '44', color: GRN, fontSize: '12px', fontWeight: '700', padding: '4px 10px', borderRadius: '6px' }}>Win Week 15</span>
                <span style={{ color: MUT }}>→</span>
                <span style={{ color: TXT, fontSize: '12px' }}>Exit the loser bracket — play in the 10th Place game</span>
                <span style={{ color: MUT }}>→</span>
                <span style={{ background: GLD + '18', border: '1px solid ' + GLD + '44', color: GLD, fontSize: '12px', fontWeight: '700', padding: '4px 10px', borderRadius: '6px' }}>Win 10th Place game</span>
                <span style={{ color: MUT }}>→</span>
                <span style={{ color: GRN, fontWeight: '900', fontSize: '12px' }}>$20 prize</span>
              </div>
            </div>
            <TBracket />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px' }}>
              <div style={{ background: GRN + '12', border: '2px solid ' + GRN + '44', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                <div style={{ color: GRN, fontWeight: '900', fontSize: '13px' }}>Toilet Bowl Winner</div>
                <div style={{ color: MUT, fontSize: '11px', margin: '4px 0 10px' }}>Wins 10th Place matchup</div>
                <div style={{ fontSize: '26px', fontWeight: '900', color: GRN }}>$20</div>
              </div>
              <div style={{ background: RED + '10', border: '2px solid ' + RED + '33', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                <div style={{ color: RED, fontWeight: '900', fontSize: '13px' }}>Last Place — King</div>
                <div style={{ color: MUT, fontSize: '11px', margin: '4px 0 10px' }}>Loses Toilet Bowl Final</div>
                <div style={{ fontSize: '14px', fontWeight: '900', color: RED }}>Trophy Obligation</div>
                <div style={{ color: MUT, fontSize: '11px', marginTop: '4px' }}>Must ship trophy to Champion</div>
              </div>
            </div>
            <div style={{ background: '#1a0808', border: '1px solid ' + RED + '33', borderRadius: '10px', padding: '16px 18px', marginTop: '14px' }}>
              <div style={{ color: RED, fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Last Place Punishment</div>
              <p style={{ color: TXT, fontSize: '13px', lineHeight: '1.7', margin: '0 0 10px' }}>The Last Place team must write and present a Power Ranking on an obscene or humorous topic chosen by the Commissioners.</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['PowerPoint format', 'Min. 10 minutes long', 'Presented at the draft', 'Remote OK with valid excuse'].map((t, i) => (
                  <span key={i} style={{ background: RED + '15', border: '1px solid ' + RED + '33', color: RED, fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {active === 2 && (
          <div>
            <SHead title="Draft Order" sub="How all 12 picks are assigned" />
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {['Full Order', 'Tier Rules', 'Tiebreakers'].map((t, i) => (
                <button key={i} onClick={() => setDraftSub(i)} style={{ background: draftSub === i ? SIL : CARD, color: draftSub === i ? '#000' : MUT, border: '1px solid ' + (draftSub === i ? SIL : BDR), padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '11px', fontWeight: draftSub === i ? '900' : '400', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {t}
                </button>
              ))}
            </div>
            {draftSub === 0 && (
              <div>
                <p style={pSt}>Draft order flows from worst-performing to best. Non-playoff teams pick first, playoff teams follow by order of elimination.</p>
                <div style={{ background: BLU + '12', border: '1px solid ' + BLU + '33', borderRadius: '6px', padding: '6px 12px', marginBottom: '12px', fontSize: '12px', color: BLU }}>RS = Regular Season record</div>
                <FOTable />
              </div>
            )}
            {draftSub === 1 && (
              <div>
                <p style={pSt}>Each tier has a specific ordering rule. Within non-playoff and Round 1 groups, Regular Season record determines who picks earlier.</p>
                {[
                  { picks: '1-5',  label: 'Non-Playoff Teams',     color: SIL, teams: '5 teams that missed playoffs',         rule: 'Ordered worst to best Regular Season record. Worst RS finish picks 1st overall.', tie: true },
                  { picks: '6-8',  label: 'Round 1 Eliminations',  color: BLU, teams: '3 teams eliminated in Week 15',         rule: 'Ordered by Regular Season record within this group — not by when they lost or their seed. Worst RS record picks earliest.', tie: true },
                  { picks: '9',    label: '3rd Place Game Loser',   color: PRP, teams: 'Loser of the Week 17 3rd place game',   rule: 'Assigned by game result. Exactly one team fills this slot.', tie: false },
                  { picks: '10',   label: '3rd Place Game Winner',  color: BRZ, teams: 'Winner of the Week 17 3rd place game',  rule: 'Assigned by game result. Exactly one team fills this slot.', tie: false },
                  { picks: '11',   label: 'Championship Runner-Up', color: SIL, teams: 'Loser of the Championship Game',        rule: 'Runner-Up receives the second-to-last pick of every round.', tie: false },
                  { picks: '12',   label: 'League Champion',        color: GLD, teams: 'Winner of the Championship Game',       rule: 'Champion picks last in every round of the Entry Draft.', tie: false },
                ].map((tier, i) => (
                  <div key={i} style={{ background: CARD, border: '1px solid ' + BDR, borderLeft: '4px solid ' + tier.color, borderRadius: '8px', padding: '14px 16px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ color: tier.color, fontWeight: '900', fontSize: '14px' }}>{'Picks ' + tier.picks}</span>
                      <span style={{ background: tier.color + '20', color: tier.color, fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid ' + tier.color + '33' }}>{tier.label}</span>
                    </div>
                    <div style={{ color: MUT, fontSize: '12px', marginBottom: '6px' }}>{tier.teams}</div>
                    <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.6', marginBottom: tier.tie ? '8px' : 0 }}>{tier.rule}</div>
                    {tier.tie && (
                      <div style={{ background: GLD + '12', border: '1px solid ' + GLD + '33', borderRadius: '5px', padding: '6px 10px', fontSize: '11px', color: GLD }}>Tiebreaker note: RS standings tiebreakers apply within this group (see Tiebreakers sub-tab).</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {draftSub === 2 && (
              <div>
                <p style={pSt}>Within the non-playoff group (picks 1-5) and Round 1 losers group (picks 6-8), teams are ordered by Regular Season standings. These tiebreakers apply in order.</p>
                <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '20px' }}>
                  {[
                    { n: '1', label: 'Overall Record',  detail: 'Team with the worse win-loss record picks earlier. Resolves most ties.',   color: SIL },
                    { n: '2', label: 'Points For',      detail: 'If records match, the team with fewer total Points For picks earlier.',      color: BLU },
                    { n: '3', label: 'Points Against',  detail: 'If still tied, the team with fewer Points Against picks earlier.',           color: PRP },
                    { n: '4', label: 'Coin Toss',       detail: 'If all three are still equal, Commissioners decide by coin toss or custom seeding.', color: GLD },
                  ].map((t, i, arr) => (
                    <div key={i} style={{ display: 'flex', gap: '0' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '50px', flexShrink: 0 }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: t.color + '20', border: '2px solid ' + t.color, color: t.color, fontWeight: '900', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.n}</div>
                        {i < arr.length - 1 && <div style={{ width: '2px', flex: 1, background: BDR, margin: '4px 0' }} />}
                      </div>
                      <div style={{ paddingLeft: '12px', paddingBottom: i < arr.length - 1 ? '22px' : 0, paddingTop: '5px' }}>
                        <div style={{ color: t.color, fontWeight: '900', fontSize: '14px', marginBottom: '3px' }}>{t.label}</div>
                        <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.6' }}>{t.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <NoteB color={GLD} text="Tiebreakers only apply within a tier. A non-playoff team can never pick later than pick 5, and a Round 1 loser can never pick earlier than pick 6." />
              </div>
            )}
          </div>
        )}

        {active === 3 && (
          <div>
            <SHead title="Quick Reference" sub="Every finish, payout, and draft pick in one table" />
            <MstrTable />
            <div style={{ marginTop: '18px' }}>
              <div style={{ color: SIL, fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Separately Awarded Prizes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { label: 'Best Regular Season Record', detail: 'Best record at end of Regular Season',                value: '$150' },
                  { label: 'Weekly High Score',          detail: 'Highest team score each of 14 Regular Season weeks',  value: '$20/week ($280 total)' },
                  { label: 'MVP',                        detail: 'Player scoring most points in Regular Season',        value: '$50' },
                  { label: 'ROY',                        detail: 'Rookie scoring most points in Regular Season',       value: '$50' },
                  { label: 'Best Power Ranking',         detail: 'League vote for best power ranking that year',       value: '$20' },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', background: CARD, border: '1px solid ' + BDR, borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ color: GLD, fontWeight: '700', fontSize: '13px' }}>{r.label}</div>
                      <div style={{ color: MUT, fontSize: '11px', marginTop: '2px' }}>{r.detail}</div>
                    </div>
                    <div style={{ padding: '10px 14px', color: GRN, fontWeight: '900', fontSize: '14px', display: 'flex', alignItems: 'center', borderLeft: '1px solid ' + BDR, whiteSpace: 'nowrap' }}>{r.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: CARD, border: '1px solid ' + GLD + '33', borderRadius: '8px', padding: '12px 14px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: GLD, fontWeight: '900', fontSize: '14px' }}>Total Season Payout</span>
                <span style={{ color: GLD, fontWeight: '900', fontSize: '22px' }}>$1,200</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '0 20px 24px' }}>
        {active > 0 && (
          <button onClick={() => setActive(active - 1)} style={{ background: CARD, color: TXT, border: '1px solid ' + BDR, padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase' }}>Back</button>
        )}
        {active < SECTIONS.length - 1 && (
          <button onClick={() => setActive(active + 1)} style={{ background: GLD, color: '#000', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase' }}>Next</button>
        )}
      </div>
    </div>
  );
}

function SHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#fff' }}>{title}</h2>
      <p style={{ margin: '4px 0 0', color: GLD, fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{sub}</p>
      <div style={{ height: '2px', background: GLD, marginTop: '10px', width: '80px', opacity: 0.4 }} />
    </div>
  );
}

function WkBar({ week, label }: { week: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0 10px' }}>
      <div style={{ height: '1px', flex: 1, background: BDR }} />
      <div style={{ textAlign: 'center' }}>
        <span style={{ background: GLD + '20', border: '1px solid ' + GLD + '44', color: GLD, fontSize: '10px', fontWeight: '900', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>{week}</span>
        <div style={{ color: MUT, fontSize: '10px', marginTop: '2px', letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</div>
      </div>
      <div style={{ height: '1px', flex: 1, background: BDR }} />
    </div>
  );
}

function Mtchup({ a, b, note, nc }: { a: string; b: string; note: string; nc: string }) {
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid ' + BDR, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: TXT, flexShrink: 0 }} />
        <span style={{ color: TXT, fontSize: '12px', fontWeight: '700' }}>{a}</span>
      </div>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid ' + BDR, display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: MUT, flexShrink: 0 }} />
        <span style={{ color: MUT, fontSize: '12px' }}>{b}</span>
      </div>
      <div style={{ padding: '5px 12px', fontSize: '10px', color: nc, fontWeight: 'bold' }}>{note}</div>
    </div>
  );
}

function ExBanner({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ background: color + '10', border: '1px solid ' + color + '33', borderRadius: '6px', padding: '7px 12px', fontSize: '11px', color: color, fontStyle: 'italic', marginBottom: '6px' }}>
      {'→ ' + text}
    </div>
  );
}

function ResCard({ icon, label, color, payout, pick }: { icon: string; label: string; color: string; payout: string; pick: string }) {
  return (
    <div style={{ background: CARD, border: '2px solid ' + color + '44', borderRadius: '10px', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ color: MUT, fontSize: '12px' }}>{icon}</span>
        <span style={{ color: color, fontWeight: '900', fontSize: '13px' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ flex: 1, background: color + '15', border: '1px solid ' + color + '33', borderRadius: '5px', padding: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: MUT, textTransform: 'uppercase', letterSpacing: '1px' }}>Payout</div>
          <div style={{ fontSize: '16px', fontWeight: '900', color: color }}>{payout}</div>
        </div>
        <div style={{ flex: 1, background: BG, border: '1px solid ' + BDR, borderRadius: '5px', padding: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: MUT, textTransform: 'uppercase', letterSpacing: '1px' }}>Draft</div>
          <div style={{ fontSize: '13px', fontWeight: '900', color: SIL }}>{pick}</div>
        </div>
      </div>
    </div>
  );
}

function NoteB({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: color + '15', border: '1px solid ' + color + '44', borderRadius: '8px', padding: '12px 14px', marginTop: '12px' }}>
      <span style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6' }}>{text}</span>
    </div>
  );
}

function TBracket() {
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '12px', padding: '18px 16px' }}>
      <div style={{ fontSize: '11px', color: MUT, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>Loser advancement: losing each round moves you toward last place</div>
      <div style={{ fontSize: '10px', color: RED, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '900', marginBottom: '8px' }}>Week 15 — Round 1</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        <TBGame a="Team 8" b="Team 12" />
        <TBGame a="Team 9" b="Team 11" />
        <div style={{ background: BG, border: '1px dashed ' + BDR, borderRadius: '8px', padding: '10px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ color: MUT, fontSize: '11px', fontWeight: '700' }}>Team 10</div>
          <div style={{ color: GLD, fontSize: '10px', marginTop: '4px' }}>Bye — advances</div>
        </div>
      </div>
      <div style={{ background: GRN + '10', border: '1px solid ' + GRN + '22', borderRadius: '5px', padding: '5px 10px', fontSize: '10px', color: GRN, marginBottom: '8px' }}>2 winners exit the last-place race and play for 10th place</div>
      <div style={{ textAlign: 'center', color: RED, fontSize: '13px', margin: '6px 0', fontStyle: 'italic' }}>2 losers + bye team advance toward last place</div>
      <div style={{ fontSize: '10px', color: RED, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '900', marginBottom: '8px' }}>Week 16 — Semifinal</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        <TBGame a="Loser of Game 1" b="Team 10" />
        <TBGame a="Loser of Game 2" b="Bye" />
        <div style={{ background: BG, border: '1px dashed ' + BDR, borderRadius: '8px', padding: '10px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ color: MUT, fontSize: '10px', lineHeight: '1.5' }}>Sleeper manages exact bracket matchups</div>
        </div>
      </div>
      <div style={{ background: GRN + '10', border: '1px solid ' + GRN + '22', borderRadius: '5px', padding: '5px 10px', fontSize: '10px', color: GRN, marginBottom: '8px' }}>2 more teams exit the last-place race</div>
      <div style={{ textAlign: 'center', color: RED, fontSize: '13px', margin: '6px 0', fontStyle: 'italic' }}>final 2 losers advance to the Toilet Bowl Final</div>
      <div style={{ fontSize: '10px', color: RED, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '900', marginBottom: '8px' }}>Week 17 — Toilet Bowl Final</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ background: '#0a1a0a', border: '2px solid ' + GRN + '44', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
          <div style={{ color: GRN, fontWeight: '900', fontSize: '13px' }}>Toilet Bowl Winner</div>
          <div style={{ color: MUT, fontSize: '11px', marginBottom: '8px' }}>10th Place matchup winner</div>
          <div style={{ color: GRN, fontWeight: '900', fontSize: '22px' }}>$20</div>
        </div>
        <div style={{ background: '#1a0808', border: '2px solid ' + RED + '44', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
          <div style={{ color: RED, fontWeight: '900', fontSize: '13px' }}>Last Place — King</div>
          <div style={{ color: MUT, fontSize: '11px', marginBottom: '8px' }}>Toilet Bowl Final loser</div>
          <div style={{ color: RED, fontWeight: '900', fontSize: '13px' }}>Trophy Obligation</div>
        </div>
      </div>
    </div>
  );
}

function TBGame({ a, b }: { a: string; b: string }) {
  return (
    <div style={{ background: BG, border: '1px solid ' + BDR, borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '7px 10px', borderBottom: '1px solid ' + BDR, fontSize: '11px', color: TXT, fontWeight: '700' }}>{a}</div>
      <div style={{ padding: '7px 10px', borderBottom: '1px solid ' + BDR, fontSize: '11px', color: MUT }}>{b}</div>
      <div style={{ padding: '4px 10px', fontSize: '9px', color: GRN }}>Winner → plays for 10th place</div>
      <div style={{ padding: '4px 10px', fontSize: '9px', color: RED }}>Loser → advances toward last place</div>
    </div>
  );
}

function FOTable() {
  const slots = [
    { pick: 1,  label: 'Worst non-playoff team (RS)',  color: SIL, tier: 'Non-Playoff' },
    { pick: 2,  label: '2nd worst non-playoff (RS)',   color: SIL, tier: 'Non-Playoff' },
    { pick: 3,  label: '3rd worst non-playoff (RS)',   color: SIL, tier: 'Non-Playoff' },
    { pick: 4,  label: '4th worst non-playoff (RS)',   color: SIL, tier: 'Non-Playoff' },
    { pick: 5,  label: 'Best non-playoff team (RS)',   color: SIL, tier: 'Non-Playoff' },
    { pick: 6,  label: 'Worst Round 1 loser (RS)',     color: BLU, tier: 'Rd 1 Out' },
    { pick: 7,  label: 'Mid Round 1 loser (RS)',       color: BLU, tier: 'Rd 1 Out' },
    { pick: 8,  label: 'Best Round 1 loser (RS)',      color: BLU, tier: 'Rd 1 Out' },
    { pick: 9,  label: '3rd Place Game loser',         color: PRP, tier: '3rd Place' },
    { pick: 10, label: '3rd Place Game winner',        color: BRZ, tier: '3rd Place' },
    { pick: 11, label: 'Championship Runner-Up',       color: SIL, tier: 'Finals' },
    { pick: 12, label: 'League Champion',              color: GLD, tier: 'Champion' },
  ];
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 100px', background: '#06060c', borderBottom: '2px solid ' + BDR }}>
        {['Pick', 'Team', 'Tier'].map((h, i) => (
          <div key={i} style={{ padding: '10px 12px', fontSize: '11px', color: GLD, fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
        ))}
      </div>
      {slots.map((s, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 100px', borderBottom: i < slots.length - 1 ? '1px solid ' + BDR : 'none', background: i % 2 === 0 ? 'transparent' : '#0c0e18' }}>
          <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center' }}>
            <span style={{ background: s.color + '22', border: '1px solid ' + s.color + '55', color: s.color, fontWeight: '900', fontSize: '12px', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.pick}</span>
          </div>
          <div style={{ padding: '10px 12px', color: TXT, fontSize: '13px', display: 'flex', alignItems: 'center' }}>{s.label}</div>
          <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center' }}>
            <span style={{ background: s.color + '18', color: s.color, fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>{s.tier}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MstrTable() {
  const rows = [
    { finish: 'League Champion',           payout: '$365', pick: '12',   color: GLD },
    { finish: 'Runner-Up',                 payout: '$180', pick: '11',   color: SIL },
    { finish: '3rd Place Winner',          payout: '$105', pick: '10',   color: BRZ },
    { finish: '3rd Place Loser',           payout: '$0',   pick: '9',    color: PRP },
    { finish: 'Round 1 Loser (x3)',        payout: '$0',   pick: '6-8',  color: BLU },
    { finish: 'Toilet Bowl Winner (10th)', payout: '$20',  pick: '1-5*', color: GRN },
    { finish: 'Non-Playoff (5 teams)',     payout: '$0',   pick: '1-5*', color: MUT },
  ];
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px', background: '#06060c', borderBottom: '2px solid ' + GLD + '33' }}>
        {['Finish', 'Payout', 'Draft Pick'].map((h, i) => (
          <div key={i} style={{ padding: '10px 14px', fontSize: '11px', color: GLD, fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px', borderBottom: i < rows.length - 1 ? '1px solid ' + BDR : 'none', background: i % 2 === 0 ? 'transparent' : '#0c0e18' }}>
          <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: r.color === MUT ? TXT : r.color, fontSize: '13px', fontWeight: r.color === MUT ? '400' : '700' }}>{r.finish}</span>
          </div>
          <div style={{ padding: '11px 14px', color: r.payout === '$0' ? MUT : GRN, fontSize: '14px', fontWeight: '900', display: 'flex', alignItems: 'center' }}>{r.payout}</div>
          <div style={{ padding: '11px 14px', color: SIL, fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center' }}>{r.pick}</div>
        </div>
      ))}
      <div style={{ padding: '9px 14px', background: BG, borderTop: '1px solid ' + BDR, fontSize: '11px', color: MUT }}>* Picks 1-5 assigned by worst-to-best Regular Season record among all 5 non-playoff teams, regardless of Toilet Bowl results.</div>
    </div>
  );
}
