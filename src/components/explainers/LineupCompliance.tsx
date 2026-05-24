'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';

const SECTIONS = ['Projected to Play', '12-Hour Deadline', 'QB Exception', 'Tanking Rules'];
const TAB_ICONS = ['✅', '⏱️', '🏈', '📊'];

const GRN = '#22c55e';
const RED = '#ef4444';
const AMB = '#f59e0b';
const BLU = '#60a5fa';
const BG  = '#0b1120';
const CARD = '#111827';
const BDR  = '#1f2937';
const TXT  = '#e2e8f0';
const MUT  = '#6b7280';

const pSt: CSSProperties = { color: '#94a3b8', lineHeight: '1.75', marginBottom: '20px', fontSize: '14px' };

export default function LineupCompliance() {
  const [active, setActive] = useState(0);

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: BG, color: TXT, borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg, #0b1120, #0f1e35, #0b1120)', borderBottom: '3px solid ' + GRN, padding: '24px 24px 18px', position: 'relative', overflow: 'hidden' }}>
        {[20, 40, 60, 80].map(p => (
          <div key={p} style={{ position: 'absolute', top: 0, bottom: 0, left: p + '%', width: '1px', background: 'rgba(34,197,94,0.05)' }} />
        ))}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '4px', color: GRN, textTransform: 'uppercase', marginBottom: '6px' }}>East v. West Dynasty League</div>
          <h2 style={{ margin: 0, fontSize: 'clamp(22px,5vw,36px)', fontWeight: '900', color: '#fff' }}>Lineup Compliance</h2>
          <div style={{ marginTop: '6px', fontSize: '13px', color: MUT, letterSpacing: '2px', textTransform: 'uppercase' }}>& Tanking Rules</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', overflowX: 'auto', background: '#0d1527', borderBottom: '1px solid ' + BDR, padding: '0 6px' }}>
        {SECTIONS.map((s, i) => (
          <button key={i} onClick={() => setActive(i)} style={{ background: active === i ? GRN : 'transparent', color: active === i ? '#000' : MUT, border: 'none', padding: '12px 14px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '12px', fontWeight: active === i ? '900' : '400', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {TAB_ICONS[i]} {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '24px 20px 40px' }}>

        {active === 0 && (
          <div>
            <SectionHead title="Projected to Play" sub="The eligibility standard for every starter" />
            <p style={pSt}>Every player in your Starting Lineup must be <em style={{ color: GRN }}>Projected to Play</em> at the compliance deadline. This is defined entirely by Sleeper.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
              <ChkCard label="Projected to Play" color={GRN} items={['Sleeper projection is 0.1 points or higher', 'Player is NOT on a Bye week', 'Projection is not blank or 0.0']} />
              <ChkCard label="NOT Projected to Play" color={RED} items={['Sleeper projection is blank or shows 0.0', 'Player is on a Bye week', 'Player is Ruled Out (see next tab)']} />
            </div>
            <Note color={AMB} icon="⚠️" text="The 0.1 threshold is the floor. Any Sleeper projection at or above 0.1 — even a very low one — counts as Projected to Play." />
            <Note color={BLU} icon="📋" text="Compliance is evaluated player-by-player. One ineligible starter is a violation regardless of who else is in your lineup." />
          </div>
        )}

        {active === 1 && (
          <div>
            <SectionHead title="The 12-Hour Deadline" sub="When you are protected — and when you are not" />
            <p style={pSt}>The <strong style={{ color: AMB }}>Ruled-Out Deadline</strong> is 12 hours before a player&apos;s scheduled kickoff. Whether a player was ruled out before or after this window determines everything.</p>
            <DeadlineTimeline />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '24px 0' }}>
              <Scenario color={RED} icon="🚫" title="Ruled Out BEFORE the deadline — Violation" desc="If Sleeper shows the player was ruled out more than 12 hours before kickoff, you had time to act. Starting them is an Illegal Lineup." example="Kickoff Sunday 1:00 PM ET (12:00 PM CT / 10:00 AM PT). Player ruled out Saturday 10:00 AM ET (9:00 AM CT / 7:00 AM PT) — 27 hrs before kickoff. You must swap." />
              <Scenario color={GRN} icon="✅" title="Ruled Out AFTER the deadline — Protected" desc="If the player is ruled out within 12 hours of kickoff, you are not in violation even if they do not play. Timing is what matters." example="Kickoff Sunday 1:00 PM ET (12:00 PM CT / 10:00 AM PT). Player ruled out Sunday 10:00 AM ET (9:00 AM CT / 7:00 AM PT) — 3 hrs before kickoff. No violation." />
            </div>
            <Note color={BLU} icon="📋" text={"The official record is Sleeper's Out Update Time on the player's page. If unavailable, Commissioners use the best timestamped source (NFL reports, ESPN, etc.). Their call is final."} />
          </div>
        )}

        {active === 2 && (
          <div>
            <SectionHead title="Limited QB Exception" sub="The scarcity rule — all 4 conditions required" />
            <p style={pSt}>In rare cases you may legally start a QB not Projected to Play — but only with a genuine QB shortage. <strong style={{ color: RED }}>All four conditions must be true</strong> at the Ruled-Out Deadline.</p>
            <QBFlow />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '24px 0' }}>
              {[
                { n: 'A', t: 'You have no QB on your Active Roster who is Projected to Play.' },
                { n: 'B', t: 'No QB who is Projected to Play is available to add on Sleeper at that time.' },
                { n: 'C', t: 'The QB you are starting is NOT Ruled Out at the Ruled-Out Deadline.' },
                { n: 'D', t: 'The QB you are starting is NOT on a Bye Week.' },
              ].map(c => (
                <div key={c.n} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', background: CARD, border: '1px solid ' + BDR, borderLeft: '4px solid ' + GRN, borderRadius: '8px', padding: '14px 16px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: GRN + '22', border: '2px solid ' + GRN, color: GRN, fontWeight: '900', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.n}</div>
                  <span style={{ color: TXT, fontSize: '14px', lineHeight: '1.6', paddingTop: '3px' }}>{c.t}</span>
                </div>
              ))}
            </div>
            <Note color={RED} icon="🚫" text="No Strategic Use: if you have any QB projected to play on your roster, or any QB is available to add on Sleeper, the exception is off the table entirely." />
            <Note color={BLU} icon="⚖️" text="Commissioners have final say on whether conditions A and B are met. Their determination is binding." />
          </div>
        )}

        {active === 3 && (
          <div>
            <SectionHead title="Tanking Rules" sub="What is allowed — and where the line is" />
            <p style={pSt}>Tanking as a team-building strategy is <strong style={{ color: GRN }}>explicitly permitted</strong>. Losing on purpose to improve draft position is a legal strategy. Lineup compliance rules still apply at all times.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '28px' }}>
              <ChkCard label="Allowed" color={GRN} items={['Starting your worst eligible players', 'Benching your best players intentionally', 'Losing games on purpose strategically', 'Trading talent away for draft picks']} />
              <ChkCard label="Never Allowed" color={RED} items={['Starting players not Projected to Play', 'Starting ruled-out players past the deadline', 'Starting players on a Bye week', 'Leaving lineup empty or incomplete']} />
            </div>
            <div style={{ background: CARD, border: '1px solid ' + AMB + '44', borderLeft: '4px solid ' + AMB, borderRadius: '10px', padding: '18px 20px', marginBottom: '20px' }}>
              <div style={{ color: AMB, fontWeight: '900', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>The Line</div>
              <p style={{ margin: 0, color: TXT, lineHeight: '1.7', fontSize: '14px' }}>You can choose to start weak players — but every starter must still be eligible. The rule is not about who you start. It is about whether every starter meets the Projected to Play standard.</p>
            </div>
            <LastPlace />
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
          <button onClick={() => setActive(active + 1)} style={{ background: GRN, color: '#000', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase' }}>
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
      <p style={{ margin: '4px 0 0', color: GRN, fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{sub}</p>
      <div style={{ height: '2px', background: GRN, marginTop: '10px', width: '80px', opacity: 0.6 }} />
    </div>
  );
}

function ChkCard({ label, color, items }: { label: string; color: string; items: string[] }) {
  return (
    <div style={{ background: CARD, borderRadius: '10px', border: '1px solid ' + BDR, borderTop: '3px solid ' + color, padding: '16px' }}>
      <div style={{ color: color, fontWeight: '900', fontSize: '13px', marginBottom: '14px' }}>{label}</div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px', color: '#cbd5e1', fontSize: '13px', lineHeight: '1.5' }}>
          <span style={{ color: color, flexShrink: 0 }}>•</span>
          {item}
        </div>
      ))}
    </div>
  );
}

function Note({ icon, color, text }: { icon: string; color: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: color + '18', border: '1px solid ' + color + '44', borderRadius: '8px', padding: '12px 14px', marginTop: '12px' }}>
      <span style={{ fontSize: '15px', flexShrink: 0 }}>{icon}</span>
      <span style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6' }}>{text}</span>
    </div>
  );
}

function Scenario({ color, icon, title, desc, example }: { color: string; icon: string; title: string; desc: string; example: string }) {
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderLeft: '4px solid ' + color, borderRadius: '8px', padding: '16px 18px' }}>
      <div style={{ color: color, fontWeight: '900', fontSize: '14px', marginBottom: '6px' }}>{icon} {title}</div>
      <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.6', marginBottom: '10px' }}>{desc}</div>
      <div style={{ background: color + '15', border: '1px solid ' + color + '33', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', color: MUT, fontStyle: 'italic' }}>
        {'Example: ' + example}
      </div>
    </div>
  );
}

function DeadlineTimeline() {
  const rows = [
    { time: '1:00 AM ET · 12:00 AM CT · 10:00 PM PT (Fri)', label: 'Ruled-Out Deadline', sub: 'Saturday — 12 hrs before a 1:00 PM ET Sunday kickoff', color: AMB, icon: '⏰', hi: true },
    { time: 'Sat 1 AM – Sun 1 AM ET (12 AM – 11 PM CT · 10 PM – 9 PM PT)', label: 'Safe Zone', sub: 'Ruled out in this window means you are protected', color: GRN, icon: '✅', hi: false },
    { time: '1:00 PM ET · 12:00 PM CT · 10:00 AM PT', label: 'Kickoff', sub: 'Sunday — lineup locks, game begins', color: BLU, icon: '🏈', hi: false },
  ];
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '12px', padding: '24px 20px', marginBottom: '8px' }}>
      <div style={{ fontSize: '11px', color: MUT, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '20px' }}>Example: Sunday 1:00 PM ET kickoff</div>
      <div style={{ position: 'relative', paddingLeft: '16px' }}>
        <div style={{ position: 'absolute', left: '27px', top: '10px', bottom: '10px', width: '2px', background: BDR }} />
        {rows.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: i < rows.length - 1 ? '28px' : 0 }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, background: e.hi ? e.color + '22' : '#1a2035', border: '2px solid ' + e.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', position: 'relative', zIndex: 1 }}>
              {e.icon}
            </div>
            <div style={{ paddingTop: '4px' }}>
              <div style={{ display: 'inline-block', background: e.hi ? e.color + '22' : 'transparent', border: e.hi ? '1px solid ' + e.color : 'none', borderRadius: '4px', padding: e.hi ? '2px 8px' : '0', color: e.color, fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                {e.label}
              </div>
              <div style={{ color: TXT, fontSize: '14px', fontWeight: '600' }}>{e.time}</div>
              <div style={{ color: MUT, fontSize: '12px', marginTop: '2px' }}>{e.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '20px', display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '28px' }}>
        <div style={{ flex: 1, background: RED + '22', border: '1px solid ' + RED + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: RED, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Violation Zone</div>
        <div style={{ flex: 1, background: GRN + '18', border: '1px solid ' + GRN + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: GRN, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Protected Zone</div>
      </div>
    </div>
  );
}

function QBFlow() {
  const conds = [
    'No QB on your Active Roster is Projected to Play',
    'No QB Projected to Play is available to add on Sleeper',
    'The QB you are starting is NOT Ruled Out at the deadline',
    'The QB you are starting is NOT on a Bye Week',
  ];
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '12px', padding: '20px', marginBottom: '8px' }}>
      <div style={{ fontSize: '11px', color: MUT, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px', textAlign: 'center' }}>All 4 conditions must pass</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {conds.map((q, i) => (
          <div key={i} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ background: '#0f1e35', border: '1px solid ' + BLU + '44', borderRadius: '8px', padding: '12px 16px', width: '100%', textAlign: 'center', color: TXT, fontSize: '13px', fontWeight: '600' }}>
              {'Condition ' + String.fromCharCode(65 + i) + ': ' + q}
            </div>
            <div style={{ display: 'flex', width: '100%', gap: '8px', margin: '6px 0' }}>
              <div style={{ flex: 1, background: GRN + '18', border: '1px solid ' + GRN + '33', borderRadius: '6px', padding: '6px', textAlign: 'center', fontSize: '11px', color: GRN, fontWeight: 'bold' }}>YES → Continue</div>
              <div style={{ flex: 1, background: RED + '18', border: '1px solid ' + RED + '33', borderRadius: '6px', padding: '6px', textAlign: 'center', fontSize: '11px', color: RED, fontWeight: 'bold' }}>NO → Exception fails</div>
            </div>
            {i < 3 && <div style={{ color: MUT, fontSize: '16px', marginBottom: '4px' }}>↓</div>}
          </div>
        ))}
        <div style={{ background: GRN + '22', border: '2px solid ' + GRN, borderRadius: '8px', padding: '12px 20px', marginTop: '8px', textAlign: 'center', color: GRN, fontWeight: '900', fontSize: '14px' }}>
          All 4 pass → Exception applies. Legal lineup.
        </div>
      </div>
    </div>
  );
}

function LastPlace() {
  const rows = [
    { icon: '📊', text: 'Write a Power Ranking on an obscene or humorous topic chosen by the Commissioners' },
    { icon: '🏆', text: 'Present it in person at the following year\'s draft. Remote delivery allowed for medical, family, or unavoidable work conflicts.' },
    { icon: '📋', text: 'Must be in PowerPoint format' },
    { icon: '⏱️', text: 'Must be a minimum of 10 minutes in length' },
  ];
  return (
    <div style={{ background: '#1a0e0e', border: '2px solid ' + RED + '44', borderRadius: '12px', padding: '20px' }}>
      <div style={{ color: RED, fontWeight: '900', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Last Place Punishment</div>
      <p style={{ color: MUT, fontSize: '13px', margin: '0 0 16px', lineHeight: '1.6' }}>The team with the lowest Regular Season finish must:</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', background: '#220e0e', borderRadius: '6px', padding: '10px 14px', border: '1px solid ' + RED + '22' }}>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
            <span style={{ color: TXT, fontSize: '13px', lineHeight: '1.5' }}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
