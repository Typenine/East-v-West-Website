'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';

const sections = ['Basics', 'Adding Players', 'Activation', 'Offseason Reset', 'Penalties'];
const TAB_ICONS = ['📋', '✅', '🚪', '🔄', '⚠️'];

const GLD = '#c9a84c';
const RED = '#e05c5c';
const GRN = '#4aaa4a';
const PRP = '#8a4a9a';
const BLU = '#4a7aaa';
const BG  = '#0f0f0f';
const CARD = '#1a1a1a';
const BDR  = '#2a2a2a';
const TXT  = '#f0e6cc';
const MUT  = '#888888';

const descStyle: CSSProperties = { color: '#bbb', lineHeight: '1.7', marginBottom: '20px', fontSize: '15px' };

const navBtnStyle = (bg: string, color: string): CSSProperties => ({
  background: bg, color, border: '1px solid #c9a84c',
  padding: '10px 20px', borderRadius: '6px',
  cursor: 'pointer', fontFamily: "'Georgia', serif",
  fontSize: '13px', fontWeight: 'bold',
});

export default function TaxiSquad() {
  const [active, setActive] = useState(0);

  return (
    <div style={{ fontFamily: "'Georgia', serif", background: BG, color: TXT, borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a0505 0%, #2a0a0a 50%, #1a0505 100%)', borderBottom: '3px solid #c9a84c', padding: '24px 24px 18px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(201,168,76,0.03) 40px, rgba(201,168,76,0.03) 41px)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={{ fontSize: '11px', letterSpacing: '4px', color: '#c9a84c', textTransform: 'uppercase' }}>East v. West Dynasty League</span>
          <h2 style={{ margin: '8px 0 0', fontSize: 'clamp(24px, 6vw, 38px)', fontWeight: 'bold', color: '#ffffff', letterSpacing: '1px' }}>
            🚕 Taxi Squad
          </h2>
          <p style={{ margin: '8px 0 0', color: '#c9a84c', fontSize: '13px', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Rules Reference Guide
          </p>
        </div>
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', overflowX: 'auto', background: '#161616', borderBottom: '1px solid #2a2a2a', padding: '0 8px', gap: '2px' }}>
        {sections.map((s, i) => (
          <button key={i} onClick={() => setActive(i)} style={{ background: active === i ? '#c9a84c' : 'transparent', color: active === i ? '#0f0f0f' : '#888', border: 'none', padding: '13px 16px', cursor: 'pointer', fontFamily: "'Georgia', serif", fontSize: '13px', fontWeight: active === i ? 'bold' : 'normal', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {TAB_ICONS[i]} {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 20px 40px' }}>

        {active === 0 && (
          <div>
            <SectionHeader title="The Basics" subtitle="What is the Taxi Squad?" />
            <p style={descStyle}>The Taxi Squad is a separate roster bucket — a "developmental squad" for younger or unproven players. It does <em>not</em> count toward your 17-player Main Roster limit.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
              <StatCard number="4" label="Max players on Taxi at any time" color="#c9a84c" icon="📋" />
              <StatCard number="1" label="Max QBs on Taxi at any time" color="#e05c5c" icon="🏈" />
            </div>
            <RosterMap />
            <InfoBox type="note" text="IR and Taxi players have their own separate slot limits and do NOT count toward your 17-player Main Roster cap." />
          </div>
        )}

        {active === 1 && (
          <div>
            <SectionHeader title="Adding Players to Taxi" subtitle="Who's eligible and when?" />
            <p style={descStyle}>Players may be placed on the Taxi Squad when acquired through any of the following:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
              {[
                { icon: '📋', method: 'Entry Draft', detail: 'Any player drafted in the annual rookie entry draft' },
                { icon: '🤝', method: 'Trade', detail: 'Any player received in a trade from another team' },
                { icon: '📂', method: 'Free Agency', detail: 'Any player picked up as a free agent' },
              ].map((item, i) => (
                <div key={i} style={{ background: CARD, border: '1px solid #2a2a2a', borderLeft: '4px solid #c9a84c', borderRadius: '8px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '28px' }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#ffffff', marginBottom: '2px' }}>{item.method}</div>
                    <div style={{ color: '#aaa', fontSize: '14px' }}>{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <RuleLine rule="Placement must occur before Sunday of that week." />
            <RuleLine rule="You must stay within the 4-player limit and 1-QB limit at all times." />
            <InfoBox type="warning" text="You are responsible for staying in compliance — regardless of what Sleeper shows or allows." />
          </div>
        )}

        {active === 2 && (
          <div>
            <SectionHeader title="Activation: The One-Way Door" subtitle="The most important Taxi Squad rule" />
            <p style={descStyle}>Moving a player from Taxi to <em>any</em> other roster spot — Starting Lineup, Bench, or even IR — is called <strong style={{ color: '#c9a84c' }}>Activation</strong>. Once it happens, that door only swings one way.</p>
            <div style={{ margin: '24px 0' }}>
              <OnewayDoor />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              <RuleCard title="Counts as Activation" items={['Moving to Starting Lineup', 'Moving to Bench', 'Moving to IR']} color="#e05c5c" icon="🚫" />
              <RuleCard title="Does NOT Reactivate" items={['Once active, stays active', 'No moving back to Taxi', 'Rule applies while on your team']} color="#c9a84c" icon="✅" />
            </div>
            <InfoBox type="exception" text="Two exceptions exist: (1) If the player leaves your roster entirely and you later reacquire them, you may place them back on Taxi. (2) The Offseason Reset for Year 1/2 players — see the next tab." />
          </div>
        )}

        {active === 3 && (
          <div>
            <SectionHeader title="Offseason Reset" subtitle="The Year 1 & 2 Exception" />
            <p style={descStyle}>The offseason reset is a limited exception that lets you return a <em>previously activated</em> player back to the Taxi Squad — but only for young players, only in the offseason.</p>
            <div style={{ margin: '24px 0' }}>
              <OffseasonTimeline />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              <RuleLine rule='A "Year 1 player" is a rookie. A "Year 2 player" is in their second NFL season.' />
              <RuleLine rule="During each offseason, you may place a Year 1 or Year 2 player back on Taxi even if they were previously activated." />
              <RuleLine rule="Eligibility ends at the kickoff of NFL Week 1 of what would be their 3rd season. After that kickoff, they are treated as a Year 3 player and the reset is gone." />
              <RuleLine rule="You can use the reset on the same player in multiple offseasons — as long as they are still in Year 1 or Year 2 at the time of each placement." />
            </div>
            <InfoBox type="warning" text="After using the offseason reset, normal rules apply again. If you activate them again after the reset, they cannot go back on Taxi (unless you use another offseason reset before their 3rd season, or they leave your roster entirely)." />
          </div>
        )}

        {active === 4 && (
          <div>
            <SectionHeader title="Penalty Tiers" subtitle="Violations escalate — fast" />
            <p style={descStyle}>Taxi Squad violations are counted per player and escalate through three tiers. Violations include: exceeding the 4-player limit, exceeding the 1-QB limit, keeping an ineligible player on Taxi, or any other rule violation.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '24px 0' }}>
              <PenaltyTier tier={1} label="1st Violation" penalty="Lose half your current FAAB balance (rounded up)" detail="If you have less than $50 FAAB remaining, you lose ALL of it — and the violation automatically escalates to Tier 2." color="#f0c040" />
              <div style={{ display: 'flex', justifyContent: 'center', fontSize: '20px', color: '#555' }}>↓ escalates if underpaid</div>
              <PenaltyTier tier={2} label="2nd Violation" penalty="$20 fine" detail="A flat $20 monetary fine assessed against your account." color="#e08030" />
              <div style={{ display: 'flex', justifyContent: 'center', fontSize: '20px', color: '#555' }}>↓ escalates</div>
              <PenaltyTier tier={3} label="3rd Violation" penalty="Forfeit your earliest-owned 1st round pick" detail="The next first-round pick you own (in the upcoming or nearest future rookie draft) is taken. If you don't own one, it moves to the earliest subsequent one you own." color="#e05c5c" />
            </div>
            <InfoBox type="warning" text="Continuing violations: if you don't fix the problem after being notified, it keeps counting as new violations — escalating the tier each time. Fix it fast." />
            <InfoBox type="note" text="Same-player rule: if one player is the source of the violation, the escalating tier count tracks to that specific player until you're back in compliance." />
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '8px 20px 24px' }}>
        {active > 0 && (
          <button onClick={() => setActive(active - 1)} style={navBtnStyle('#1a1a1a', '#c9a84c')}>
            ← {sections[active - 1]}
          </button>
        )}
        {active < sections.length - 1 && (
          <button onClick={() => setActive(active + 1)} style={navBtnStyle('#c9a84c', '#0f0f0f')}>
            {sections[active + 1]} →
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h2 style={{ margin: 0, fontSize: '26px', color: '#ffffff', fontWeight: 'bold' }}>{title}</h2>
      <p style={{ margin: '4px 0 0', color: '#c9a84c', fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase' }}>{subtitle}</p>
      <div style={{ height: '2px', background: 'linear-gradient(to right, #c9a84c, transparent)', marginTop: '12px', width: '120px' }} />
    </div>
  );
}

function StatCard({ number, label, color, icon }: { number: string; label: string; color: string; icon: string }) {
  return (
    <div style={{ background: CARD, border: '2px solid ' + color, borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
      <div style={{ fontSize: '24px', marginBottom: '4px' }}>{icon}</div>
      <div style={{ fontSize: '52px', fontWeight: 'bold', color, lineHeight: '1' }}>{number}</div>
      <div style={{ fontSize: '13px', color: '#aaa', marginTop: '8px', lineHeight: '1.4' }}>{label}</div>
    </div>
  );
}

function RosterMap() {
  const slots = [
    { label: 'Starting Lineup', count: '10 spots', note: 'QB, 2RB, 2WR, TE, Flex, SuperFlex, K, D/ST', color: '#4a9a6a', counted: true },
    { label: 'Bench', count: '7 spots', note: '', color: '#4a7a9a', counted: true },
    { label: 'Injured Reserve (IR)', count: '4 spots', note: '', color: '#9a7a4a', counted: false },
    { label: 'Taxi Squad', count: '4 spots (max 1 QB)', note: '', color: '#8a4a9a', counted: false },
  ];
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}>Full Roster Breakdown</div>
      {slots.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: CARD, borderRadius: '8px', padding: '12px 16px', marginBottom: '6px', border: '1px solid ' + s.color + '33', borderLeft: '4px solid ' + s.color }}>
          <div>
            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{s.label}</span>
            {s.note && <span style={{ color: '#777', fontSize: '12px', marginLeft: '8px' }}>{s.note}</span>}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ color: s.color, fontSize: '13px', fontWeight: 'bold' }}>{s.count}</span>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: s.counted ? '#1a3a1a' : '#2a1a2a', color: s.counted ? '#4aaa4a' : '#aa4aaa', border: '1px solid ' + (s.counted ? '#2a5a2a' : '#4a2a4a') }}>
              {s.counted ? 'Counts toward 17-limit' : 'Does NOT count toward 17-limit'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function OnewayDoor() {
  return (
    <div style={{ background: CARD, border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', flexWrap: 'wrap' }}>
        <div style={{ background: '#8a4a9a33', border: '2px solid #8a4a9a', borderRadius: '10px', padding: '16px 24px', minWidth: '120px' }}>
          <div style={{ fontSize: '28px' }}>🚕</div>
          <div style={{ color: '#c9a84c', fontWeight: 'bold', fontSize: '14px' }}>TAXI SQUAD</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 12px' }}>
          <div style={{ fontSize: '24px', color: '#4aaa4a' }}>→</div>
          <div style={{ fontSize: '10px', color: '#4aaa4a', whiteSpace: 'nowrap' }}>ALLOWED</div>
          <div style={{ height: '20px' }} />
          <div style={{ fontSize: '24px', color: '#e05c5c' }}>←</div>
          <div style={{ fontSize: '10px', color: '#e05c5c', whiteSpace: 'nowrap' }}>BLOCKED</div>
        </div>
        <div style={{ background: '#2a3a5a', border: '2px solid #4a7aaa', borderRadius: '10px', padding: '16px 24px', minWidth: '120px' }}>
          <div style={{ fontSize: '28px' }}>📋</div>
          <div style={{ color: '#c9a84c', fontWeight: 'bold', fontSize: '14px' }}>ACTIVE ROSTER</div>
          <div style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>Lineup / Bench / IR</div>
        </div>
      </div>
      <p style={{ color: '#e05c5c', margin: '16px 0 0', fontSize: '14px', fontStyle: 'italic' }}>
        Once activated, a player cannot return to the Taxi Squad while on your team.
      </p>
    </div>
  );
}

function OffseasonTimeline() {
  const years = [
    { label: 'Year 1', sub: 'Rookie season', color: '#4a9a6a', reset: true },
    { label: 'Year 2', sub: '2nd NFL season', color: '#4a9a6a', reset: true },
    { label: 'Year 3+', sub: '3rd season onward', color: '#e05c5c', reset: false },
  ];
  return (
    <div style={{ background: CARD, border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px' }}>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px', letterSpacing: '1px', textTransform: 'uppercase' }}>Player Eligibility for Offseason Reset</div>
      <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
        {years.map((y, i) => (
          <div key={i} style={{ flex: 1, background: y.reset ? '#0a2a0a' : '#2a0a0a', border: '2px solid ' + y.color, borderRight: i < 2 ? 'none' : '2px solid ' + y.color, borderRadius: i === 0 ? '8px 0 0 8px' : i === 2 ? '0 8px 8px 0' : '0', padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: y.color }}>{y.label}</div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>{y.sub}</div>
            <div style={{ fontSize: '20px' }}>{y.reset ? '✅' : '🚫'}</div>
            <div style={{ fontSize: '11px', color: y.reset ? '#4aaa4a' : '#e05c5c', marginTop: '6px', lineHeight: '1.4' }}>
              {y.reset ? 'Offseason reset available' : 'No reset — normal rules only'}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '16px', background: '#1e1e1e', border: '1px dashed #3a3a3a', borderRadius: '8px', padding: '12px 16px', fontSize: '12px', color: '#aaa', textAlign: 'center' }}>
        ⏰ Eligibility expires at the <strong style={{ color: '#c9a84c' }}>kickoff of NFL Week 1</strong> of the player's 3rd season
      </div>
    </div>
  );
}

function PenaltyTier({ tier, label, penalty, detail, color }: { tier: number; label: string; penalty: string; detail: string; color: string }) {
  const icons: Record<number, string> = { 1: '💸', 2: '💵', 3: '🎯' };
  return (
    <div style={{ background: CARD, border: '2px solid ' + color, borderRadius: '10px', padding: '20px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      <div style={{ background: color + '22', border: '2px solid ' + color, borderRadius: '50%', width: '44px', height: '44px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
        {icons[tier]}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ color, fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</span>
          <span style={{ background: color + '22', color, fontSize: '11px', padding: '2px 8px', borderRadius: '4px', border: '1px solid ' + color + '55' }}>Tier {tier}</span>
        </div>
        <div style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold', marginBottom: '6px' }}>{penalty}</div>
        <div style={{ color: '#999', fontSize: '13px', lineHeight: '1.5' }}>{detail}</div>
      </div>
    </div>
  );
}

function RuleCard({ title, items, color, icon }: { title: string; items: string[]; color: string; icon: string }) {
  return (
    <div style={{ background: CARD, border: '1px solid ' + color + '44', borderTop: '3px solid ' + color, borderRadius: '8px', padding: '16px' }}>
      <div style={{ color, fontWeight: 'bold', marginBottom: '12px', fontSize: '14px' }}>{icon} {title}</div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', color: '#ccc', fontSize: '13px', lineHeight: '1.4' }}>
          <span style={{ color, flexShrink: 0, marginTop: '1px' }}>•</span>
          {item}
        </div>
      ))}
    </div>
  );
}

function RuleLine({ rule }: { rule: string }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #1e1e1e', color: '#ccc', fontSize: '14px', lineHeight: '1.5' }}>
      <span style={{ color: '#c9a84c', flexShrink: 0, fontSize: '16px' }}>›</span>
      {rule}
    </div>
  );
}

function InfoBox({ type, text }: { type: 'note' | 'warning' | 'exception'; text: string }) {
  const styles = {
    note:      { bg: '#1a2a1a', border: '#2a5a2a', icon: '📋', color: '#6aaa6a' },
    warning:   { bg: '#2a1a0a', border: '#5a3a0a', icon: '⚠️', color: '#c9a84c' },
    exception: { bg: '#1a1a2a', border: '#2a2a5a', icon: '💡', color: '#6a6aaa' },
  };
  const s = styles[type];
  return (
    <div style={{ background: s.bg, border: '1px solid ' + s.border, borderRadius: '8px', padding: '14px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start', marginTop: '16px' }}>
      <span style={{ fontSize: '16px', flexShrink: 0 }}>{s.icon}</span>
      <span style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.6' }}>{text}</span>
    </div>
  );
}
