'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';

const SECTIONS = ['Which Picks', 'Dues Requirements', 'Deadline & Review', 'Prohibited'];
const TAB_ICONS = ['📋', '💰', '⏰', '🚫'];

const GLD = '#c9a84c';
const RED = '#ef4444';
const GRN = '#22c55e';
const BLU = '#60a5fa';
const PRP = '#a78bfa';
const BG  = '#0d0d0d';
const CARD = '#161616';
const BDR  = '#2a2a2a';
const TXT  = '#e2e8f0';
const MUT  = '#6b7280';

const pSt: CSSProperties = { color: '#94a3b8', lineHeight: '1.75', marginBottom: '20px', fontSize: '14px' };

export default function TradePicks() {
  const [active, setActive] = useState(0);

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: BG, color: TXT, borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a0a00, #120d00, #1a0a00)', borderBottom: '3px solid ' + GLD, padding: '24px 24px 18px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(201,168,76,0.03) 40px, rgba(201,168,76,0.03) 41px)' }} />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '4px', color: GLD, textTransform: 'uppercase', marginBottom: '6px' }}>East v. West Dynasty League</div>
          <h2 style={{ margin: 0, fontSize: 'clamp(22px,5vw,34px)', fontWeight: '900', color: '#fff' }}>Trading Draft Picks</h2>
          <div style={{ marginTop: '6px', fontSize: '12px', color: MUT, letterSpacing: '2px', textTransform: 'uppercase' }}>Rules Reference Guide</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', overflowX: 'auto', background: '#0a0a0a', borderBottom: '1px solid ' + BDR, padding: '0 6px' }}>
        {SECTIONS.map((s, i) => (
          <button key={i} onClick={() => setActive(i)} style={{ background: active === i ? GLD : 'transparent', color: active === i ? '#000' : MUT, border: 'none', padding: '12px 14px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '12px', fontWeight: active === i ? '900' : '400', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {TAB_ICONS[i]} {s}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '24px 20px 40px' }}>
        {active === 0 && (
          <div>
            <SectionHead title="Which Picks Can Be Traded" sub="Only picks within a 3-year window are tradeable" />
            <p style={pSt}>You may only trade draft picks from three specific League Years. Picks more than two years out cannot be traded at all.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              <div style={{ background: GRN + '10', border: '2px solid ' + GRN + '33', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: GRN, fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Before the Entry Draft</div>
                <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.6', marginBottom: '8px' }}>Current year picks still exist and can be traded. You have access to the full +0, +1, and +2 window.</div>
                <div style={{ background: BG, border: '1px solid ' + GRN + '22', borderRadius: '6px', padding: '8px 10px', marginBottom: '8px', fontSize: '12px', color: MUT, fontStyle: 'italic' }}>
                  {"Example: It's March 2026. The 2026 Entry Draft hasn't happened yet. You can trade 2026 picks (+0), 2027 picks (+1), or 2028 picks (+2)."}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['+0 Current', '+1 Next Year', '+2 Two Out'].map((t, i) => (
                    <span key={i} style={{ background: GRN + '18', border: '1px solid ' + GRN + '44', color: GRN, fontSize: '10px', fontWeight: 'bold', padding: '2px 7px', borderRadius: '4px' }}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{ background: GLD + '10', border: '2px solid ' + GLD + '33', borderRadius: '10px', padding: '14px' }}>
                <div style={{ color: GLD, fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>After the Entry Draft</div>
                <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.6', marginBottom: '8px' }}>Current year picks have been used — they no longer exist. The earliest pick you can trade is a Next Year (+1) pick.</div>
                <div style={{ background: BG, border: '1px solid ' + GLD + '22', borderRadius: '6px', padding: '8px 10px', marginBottom: '8px', fontSize: '12px', color: MUT, fontStyle: 'italic' }}>
                  {"Example: It's October 2026. The 2026 Entry Draft already happened. 2026 picks are gone. You can still trade 2027 picks (+1) or 2028 picks (+2)."}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ background: RED + '15', border: '1px solid ' + RED + '33', color: RED, fontSize: '10px', fontWeight: 'bold', padding: '2px 7px', borderRadius: '4px' }}>+0 Gone</span>
                  {['+1 Next Year', '+2 Two Out'].map((t, i) => (
                    <span key={i} style={{ background: GLD + '18', border: '1px solid ' + GLD + '44', color: GLD, fontSize: '10px', fontWeight: 'bold', padding: '2px 7px', borderRadius: '4px' }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '12px', color: MUT }}>
              The East v. West Entry Draft takes place in June or July each year (after the NFL Draft). During the regular season and offseason, current year picks will already have been used.
            </div>
            <PickWindow />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
              <PickRow label="Current Year Picks" tag="+0" color={GRN} icon="✓" desc="Picks in the Entry Draft occurring within the current League Year. Only tradeable before the Entry Draft takes place — once the draft has happened, these picks no longer exist." req="No dues requirement — but only available pre-draft" reqColor={GRN} />
              <PickRow label="Next Year Picks" tag="+1" color={GLD} icon="✓" desc="Picks in the Entry Draft of the League Year immediately following the current one. Always tradeable regardless of where you are in the season." req="Half Dues ($60) must be paid or credited if not already paid" reqColor={GLD} />
              <PickRow label="Two Years Out" tag="+2" color={PRP} icon="✓" desc="Picks in the Entry Draft two League Years from now. Always tradeable regardless of where you are in the season." req="Full League Dues ($120) must be paid or credited in full" reqColor={PRP} />
              <PickRow label="Three or More Years Out" tag="+3" color={RED} icon="✗" desc="Picks this far out cannot be traded under any circumstances. The rulebook does not permit it." req="Not permitted — period" reqColor={RED} />
            </div>
          </div>
        )}

        {active === 1 && (
          <div>
            <SectionHead title="Dues Requirements for Future Picks" sub="What you must pay to trade picks from future seasons" />
            <p style={pSt}>Trading picks from future League Years comes with a dues obligation. The team <strong style={{ color: GLD }}>trading away</strong> the future pick is responsible for satisfying the dues requirement — not the team receiving it.</p>
            <DuesTable />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '24px' }}>
              <RuleBlock color={GLD} icon="📋" title="Next Year Pick (+1) — Half Dues Rule">
                To trade away a Next Year Pick, you must provide Dues Credit equal to Half Dues ($60) for that League Year — but only if Half Dues have not already been paid. If you already paid Half Dues for next year, no additional credit is required.
              </RuleBlock>
              <RuleBlock color={PRP} icon="📋" title="Two Years Out (+2) — Full Dues Rule">
                To trade away a pick two League Years out, you must provide Dues Credit equal to the full League Dues ($120) for that year. This applies regardless of whether any dues have been paid yet.
              </RuleBlock>
              <RuleBlock color={RED} icon="⚠️" title="Payment Must Come First">
                The required payment or Dues Credit must be satisfied before the trade is eligible for Commissioner approval. A trade involving a future pick cannot be approved until the dues obligation is met.
              </RuleBlock>
            </div>
            <NoteBox color={BLU} icon="💡" text="Dues Credit can come from Winnings applied toward dues, or direct payment. It does not have to be paid in cash at the moment of the trade — it just has to be satisfied before the trade clears." />
          </div>
        )}

        {active === 2 && (
          <div>
            <SectionHead title="Trade Deadline & Review" sub="When trades close and how review works" />
            <div style={{ background: CARD, border: '2px solid ' + GLD + '66', borderRadius: '12px', padding: '24px', marginBottom: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: MUT, letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>Trade Deadline</div>
              <div style={{ fontSize: '36px', fontWeight: '900', color: GLD }}>End of Week 12</div>
              <div style={{ color: MUT, fontSize: '13px', marginTop: '8px' }}>After the final NFL Week 12 game concludes, no new trades may be proposed or accepted.</div>
              <div style={{ marginTop: '16px', padding: '12px', background: BG, borderRadius: '8px', fontSize: '13px', color: TXT }}>
                Trading opens on <strong style={{ color: GLD }}>Super Bowl Sunday</strong> and runs through <strong style={{ color: GLD }}>End of Week 12</strong>
              </div>
            </div>
            <div style={{ fontSize: '13px', color: GLD, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '900', marginBottom: '14px' }}>How Trade Review Works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {[
                { n: '1', color: BLU, title: 'Trade accepted on Sleeper', body: 'Both managers agree and the trade is accepted on Sleeper. This starts the review clock.' },
                { n: '2', color: GLD, title: '24-hour review window opens', body: 'Any manager in the league may raise a concern by notifying the Commissioners within 24 hours of the trade being accepted on Sleeper.' },
                { n: '3', color: PRP, title: 'Commissioner review (if concern raised)', body: 'If a concern is raised, Commissioners may solicit input from the league and extend the review period as needed.' },
                { n: '4', color: GRN, title: 'Final decision', body: 'Commissioners have final authority to approve, reject, or impose a remedy on any trade. Their decision is binding.' },
              ].map((step, i, arr) => (
                <div key={i} style={{ display: 'flex', gap: '0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '48px', flexShrink: 0 }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: step.color + '22', border: '2px solid ' + step.color, color: step.color, fontWeight: '900', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{step.n}</div>
                    {i < arr.length - 1 && <div style={{ width: '2px', flex: 1, background: BDR, margin: '4px 0' }} />}
                  </div>
                  <div style={{ paddingLeft: '14px', paddingBottom: i < arr.length - 1 ? '24px' : 0, paddingTop: '6px' }}>
                    <div style={{ color: step.color, fontWeight: '900', fontSize: '13px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{step.title}</div>
                    <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.6' }}>{step.body}</div>
                  </div>
                </div>
              ))}
            </div>
            <NoteBox color={GLD} icon="📋" text="A trade accepted before the deadline remains eligible for Commissioner review and processing even after the deadline, as long as it was accepted on Sleeper in time." />
          </div>
        )}

        {active === 3 && (
          <div>
            <SectionHead title="What Is Prohibited" sub="Outside consideration and dues as trade terms" />
            <p style={pSt}>All trade terms must be limited to <strong style={{ color: GLD }}>Sleeper-rostered players, FAAB, and draft picks</strong>. Anything else is outside consideration and is prohibited.</p>
            <div style={{ background: '#1a0a0a', border: '2px solid ' + RED + '55', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ color: RED, fontWeight: '900', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Outside Consideration — Prohibited</div>
              <p style={{ color: MUT, fontSize: '13px', margin: '0 0 14px', lineHeight: '1.6' }}>A trade may not be conditioned on or include any of the following:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {['Cash or money transfers', 'Gifts or merchandise', 'Services or favors', 'Travel expenses', 'Meals or drinks', 'Agreements to split winnings', 'Any value outside Sleeper', 'League Dues or Dues Credit'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#220a0a', borderRadius: '6px', padding: '8px 10px', border: '1px solid ' + RED + '22' }}>
                    <span style={{ color: RED, flexShrink: 0, fontSize: '12px' }}>✗</span>
                    <span style={{ color: TXT, fontSize: '12px' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: '#0a0a1a', border: '2px solid ' + PRP + '55', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ color: PRP, fontWeight: '900', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>League Dues as Trade Consideration — Special Rule</div>
              <p style={{ color: TXT, fontSize: '13px', lineHeight: '1.7', margin: '0 0 10px' }}>
                Paying another team's League Dues — or applying Dues Credit on their behalf — may not be offered, requested, or used as part of a trade deal. This applies whether the payment goes directly to the other team or to the league on their behalf.
              </p>
              <NoteBox color={PRP} icon="⚠️" text="Note: the dues requirement for future picks (Section 7.3) is different. That is a condition placed on the team trading AWAY the pick — it is an obligation, not consideration being offered to the other side." />
            </div>
            <div style={{ background: CARD, border: '1px solid ' + RED + '44', borderRadius: '10px', padding: '16px 18px' }}>
              <div style={{ color: RED, fontWeight: '900', fontSize: '13px', marginBottom: '8px' }}>Consequences</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  'The trade is voidable and may be reversed by the Commissioners',
                  'Commissioners may impose penalties under Section 12',
                  'Any agreement involving outside consideration is unenforceable',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: TXT, fontSize: '13px', lineHeight: '1.5' }}>
                    <span style={{ color: RED, flexShrink: 0 }}>›</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '0 20px 24px' }}>
        {active > 0 && (
          <button onClick={() => setActive(active - 1)} style={{ background: CARD, color: TXT, border: '1px solid ' + BDR, padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase' }}>
            ← {SECTIONS[active - 1]}
          </button>
        )}
        {active < SECTIONS.length - 1 && (
          <button onClick={() => setActive(active + 1)} style={{ background: GLD, color: '#000', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase' }}>
            {SECTIONS[active + 1]} →
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: '22px' }}>
      <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#fff' }}>{title}</h2>
      <p style={{ margin: '4px 0 0', color: GLD, fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{sub}</p>
      <div style={{ height: '2px', background: GLD, marginTop: '10px', width: '80px', opacity: 0.5 }} />
    </div>
  );
}

function PickWindow() {
  const years = [
    { label: 'Current Year', tag: '+0', color: GRN, note: '✓ Tradeable', sub: 'No dues required' },
    { label: 'Next Year', tag: '+1', color: GLD, note: '✓ Tradeable', sub: 'Half Dues ($60) required' },
    { label: 'Two Years Out', tag: '+2', color: PRP, note: '✓ Tradeable', sub: 'Full Dues ($120) required' },
    { label: 'Three+ Years Out', tag: '+3', color: RED, note: '🚫 Not permitted', sub: 'Cannot be traded' },
  ];
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '12px', padding: '20px', marginBottom: '8px' }}>
      <div style={{ fontSize: '11px', color: MUT, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>Tradeable Pick Window</div>
      <div style={{ display: 'flex', gap: '0' }}>
        {years.map((y, i) => (
          <div key={i} style={{ flex: 1, background: y.color + '12', border: '1px solid ' + y.color + '44', borderRight: i < years.length - 1 ? 'none' : '1px solid ' + y.color + '44', borderRadius: i === 0 ? '8px 0 0 8px' : i === years.length - 1 ? '0 8px 8px 0' : '0', padding: '14px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '900', color: y.color }}>{y.tag}</div>
            <div style={{ fontSize: '11px', color: TXT, fontWeight: '700', margin: '4px 0 2px', lineHeight: '1.3' }}>{y.label}</div>
            <div style={{ fontSize: '10px', color: y.color, fontWeight: 'bold', margin: '6px 0 2px' }}>{y.note}</div>
            <div style={{ fontSize: '10px', color: MUT, lineHeight: '1.3' }}>{y.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PickRow({ label, tag, color, icon, desc, req, reqColor }: { label: string; tag: string; color: string; icon: string; desc: string; req: string; reqColor: string }) {
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderLeft: '4px solid ' + color, borderRadius: '8px', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <span style={{ color: color, fontWeight: '900', fontSize: '14px' }}>{label}</span>
        <span style={{ background: color + '22', color: color, fontSize: '11px', padding: '2px 8px', borderRadius: '4px', border: '1px solid ' + color + '44', fontWeight: 'bold' }}>{tag}</span>
      </div>
      <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.6', marginBottom: '10px' }}>{desc}</div>
      <div style={{ background: reqColor + '15', border: '1px solid ' + reqColor + '33', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: reqColor, fontWeight: 'bold' }}>
        {'Requirement: ' + req}
      </div>
    </div>
  );
}

function DuesTable() {
  const rows = [
    { pick: 'Current Year (+0)', dues: 'None', amount: '✓', color: GRN },
    { pick: 'Next Year (+1)', dues: 'Half Dues (if unpaid)', amount: '$60', color: GLD },
    { pick: 'Two Years Out (+2)', dues: 'Full Dues', amount: '$120', color: PRP },
    { pick: 'Three+ Years Out', dues: 'Not tradeable', amount: 'N/A', color: RED },
  ];
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '12px', overflow: 'hidden', marginBottom: '8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', background: '#0a0a0a', borderBottom: '2px solid ' + GLD + '44' }}>
        {['Pick Year', 'Dues Obligation', 'Amount'].map((h, i) => (
          <div key={i} style={{ padding: '10px 14px', fontSize: '11px', color: GLD, fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
        ))}
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', borderBottom: i < rows.length - 1 ? '1px solid ' + BDR : 'none', background: i % 2 === 0 ? 'transparent' : '#111' }}>
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color, flexShrink: 0 }} />
            <span style={{ color: TXT, fontSize: '13px' }}>{row.pick}</span>
          </div>
          <div style={{ padding: '12px 14px', color: MUT, fontSize: '13px', display: 'flex', alignItems: 'center' }}>{row.dues}</div>
          <div style={{ padding: '12px 14px', color: row.color, fontSize: '14px', fontWeight: '900', display: 'flex', alignItems: 'center' }}>{row.amount}</div>
        </div>
      ))}
      <div style={{ padding: '10px 14px', background: GLD + '11', borderTop: '1px solid ' + GLD + '33', fontSize: '11px', color: MUT }}>
        * The team trading AWAY the future pick is responsible for satisfying the dues obligation.
      </div>
    </div>
  );
}

function RuleBlock({ color, icon, title, children }: { color: string; icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderLeft: '4px solid ' + color, borderRadius: '8px', padding: '16px 18px' }}>
      <div style={{ color: color, fontWeight: '900', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{icon + ' ' + title}</div>
      <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.7' }}>{children}</div>
    </div>
  );
}

function NoteBox({ icon, color, text }: { icon: string; color: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: color + '15', border: '1px solid ' + color + '44', borderRadius: '8px', padding: '12px 14px', marginTop: '12px' }}>
      <span style={{ fontSize: '15px', flexShrink: 0 }}>{icon}</span>
      <span style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6' }}>{text}</span>
    </div>
  );
}
