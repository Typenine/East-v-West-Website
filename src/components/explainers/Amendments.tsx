'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';

const SECTIONS = ['Proposal Process', 'Endorsements', 'Vote Thresholds', 'Competing Amendments'];
const TAB_ICONS = ['📝', '👍', '🗳️', '⚖️'];

const GLD = '#f59e0b';
const GRN = '#22c55e';
const BLU = '#60a5fa';
const RED = '#ef4444';
const PRP = '#a78bfa';
const AMB = '#fb923c';
const BG   = '#09090d';
const CARD = '#11131a';
const BDR  = '#1e2030';
const TXT  = '#e2e8f0';
const MUT  = '#6b7280';

const pSt: CSSProperties = { color: '#94a3b8', lineHeight: '1.75', marginBottom: '16px', fontSize: '14px' };

export default function Amendments() {
  const [active, setActive] = useState(0);

  return (
    <div style={{ fontFamily: 'Georgia, serif', background: BG, color: TXT, borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg, #09090d, #0e1020, #09090d)', borderBottom: '3px solid ' + BLU, padding: '28px 24px 20px', position: 'relative', overflow: 'hidden' }}>
        {[20, 40, 60, 80].map(p => (
          <div key={p} style={{ position: 'absolute', top: 0, bottom: 0, left: p + '%', width: '1px', background: 'rgba(96,165,250,0.05)' }} />
        ))}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '4px', color: BLU, textTransform: 'uppercase', marginBottom: '6px' }}>East v. West Dynasty League</div>
          <h2 style={{ margin: 0, fontSize: 'clamp(22px,5vw,36px)', fontWeight: '900', color: '#fff' }}>Amendments</h2>
          <div style={{ marginTop: '4px', fontSize: 'clamp(18px,4vw,26px)', fontWeight: '900', color: BLU }}>{'& Rule Changes'}</div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: MUT, letterSpacing: '2px', textTransform: 'uppercase' }}>How the rules get changed</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', overflowX: 'auto', background: '#06060a', borderBottom: '1px solid ' + BDR, padding: '0 4px' }}>
        {SECTIONS.map((s, i) => (
          <button key={i} onClick={() => setActive(i)} style={{ background: active === i ? BLU : 'transparent', color: active === i ? '#000' : MUT, border: 'none', padding: '12px 16px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '11px', fontWeight: active === i ? '900' : '400', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {TAB_ICONS[i]} {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px 40px' }}>

        {active === 0 && (
          <div>
            <SHead title="Proposal Process" sub="From idea to rule — step by step" />
            <p style={pSt}>Any team can propose a rule change. The process moves through five stages before anything becomes official.</p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                {
                  n: '1', color: BLU, label: 'Submit the Proposal',
                  body: 'Any team may submit a rule proposal through the league website using the designated rule proposal form. The proposal must be complete — all required fields filled out in the required format.',
                  warn: 'Proposals submitted outside the website form are not valid.',
                },
                {
                  n: '2', color: PRP, label: 'Gather 3 Endorsements',
                  body: "The proposal needs at least 3 endorsements from other teams through the league website's endorsement feature to be brought to a vote. Your own endorsement of your own proposal does not count toward the 3.",
                  warn: 'Endorsements made outside the website (text, group chat, etc.) do not count.',
                },
                {
                  n: '3', color: AMB, label: 'Commissioner Review',
                  body: 'Once 3 valid endorsements are received, the Commissioners determine whether the proposal is eligible for a vote. They may reject proposals that are impossible to administer or inconsistent with platform limitations.',
                  warn: null,
                },
                {
                  n: '4', color: GLD, label: 'League Vote',
                  body: 'If eligible, the Commissioners open a vote using a method they designate. The vote must meet the required threshold — either Majority (7 votes) or Supermajority (9 votes) depending on the type of change.',
                  warn: null,
                },
                {
                  n: '5', color: GRN, label: 'Takes Effect',
                  body: 'Unless the proposal specifies otherwise, a rule that passes takes effect at the start of the next League Year — not immediately. In-season rule changes are not implemented unless both Commissioners determine it is warranted.',
                  warn: 'A passed rule does not apply mid-season unless Commissioners explicitly approve in-season implementation.',
                },
              ].map((step, i, arr) => (
                <div key={i} style={{ display: 'flex', gap: '0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '52px', flexShrink: 0 }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: step.color + '22', border: '2px solid ' + step.color, color: step.color, fontWeight: '900', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{step.n}</div>
                    {i < arr.length - 1 && <div style={{ width: '2px', flex: 1, background: BDR, margin: '4px 0' }} />}
                  </div>
                  <div style={{ paddingLeft: '14px', paddingBottom: i < arr.length - 1 ? '24px' : 0, paddingTop: '6px', flex: 1 }}>
                    <div style={{ color: step.color, fontWeight: '900', fontSize: '15px', marginBottom: '6px' }}>{step.label}</div>
                    <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.7', marginBottom: step.warn ? '8px' : 0 }}>{step.body}</div>
                    {step.warn && (
                      <div style={{ background: RED + '12', border: '1px solid ' + RED + '33', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: RED }}>{'⚠ ' + step.warn}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {active === 1 && (
          <div>
            <SHead title="Endorsements" sub="What counts — and what does not" />
            <p style={pSt}>A proposal needs exactly 3 valid endorsements to be eligible for commissioner review and a vote. Not all endorsements count.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <ChkCard label="Counts as an Endorsement" color={GRN} items={[
                "Made through the league website's endorsement feature",
                'Made by a team other than the proposing team',
                'A single team may endorse more than one proposal — including competing proposals on the same rule',
              ]} />
              <ChkCard label="Does NOT Count" color={RED} items={[
                'Endorsement made by the team that submitted the proposal',
                'Endorsements made outside the website (group chat, text, Sleeper, verbal)',
                'Duplicate endorsements from the same team on the same proposal',
              ]} />
            </div>
            <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '10px', padding: '18px 20px', marginBottom: '14px' }}>
              <div style={{ color: BLU, fontWeight: '900', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>The 3-Endorsement Threshold</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                  <div key={n} style={{ width: '32px', height: '32px', borderRadius: '50%', background: n <= 3 ? BLU + '22' : BG, border: '2px solid ' + (n <= 3 ? BLU : BDR), color: n <= 3 ? BLU : MUT, fontWeight: n <= 3 ? '900' : '400', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
                ))}
              </div>
              <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.6' }}>3 endorsements (from teams other than the proposer) are required for a proposal to be brought to a commissioner review. Below that threshold, the proposal does not need to be considered.</div>
            </div>
            <NoteB color={GLD} text="Once a proposal has 3 valid endorsements, the Commissioners still decide whether it is eligible for a vote — they can reject proposals that are impossible to administer or that conflict with platform limitations." />
          </div>
        )}

        {active === 2 && (
          <div>
            <SHead title="Vote Thresholds" sub="Majority vs. Supermajority" />
            <p style={pSt}>Not all votes have the same threshold. Significant changes to the league require more votes to pass. The Commissioners classify which threshold applies if there is a dispute.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: BLU + '10', border: '2px solid ' + BLU + '44', borderRadius: '12px', padding: '18px' }}>
                <div style={{ color: BLU, fontWeight: '900', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Majority Vote</div>
                <div style={{ fontSize: '44px', fontWeight: '900', color: BLU, lineHeight: 1, marginBottom: '4px' }}>7</div>
                <div style={{ color: MUT, fontSize: '12px', marginBottom: '14px' }}>affirmative votes required (out of 12 teams)</div>
                <div style={{ color: BLU, fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Used for:</div>
                {['Draft trip logistics', 'Scheduling and admin decisions', 'Award voting', "Other routine matters that don't change rules or core structure"].map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '6px', color: TXT, fontSize: '12px', lineHeight: '1.5' }}>
                    <span style={{ color: BLU, flexShrink: 0 }}>›</span>{t}
                  </div>
                ))}
              </div>
              <div style={{ background: RED + '10', border: '2px solid ' + RED + '44', borderRadius: '12px', padding: '18px' }}>
                <div style={{ color: RED, fontWeight: '900', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Supermajority</div>
                <div style={{ fontSize: '44px', fontWeight: '900', color: RED, lineHeight: 1, marginBottom: '4px' }}>9</div>
                <div style={{ color: MUT, fontSize: '12px', marginBottom: '14px' }}>affirmative votes required (out of 12 teams)</div>
                <div style={{ color: RED, fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Required for:</div>
                {['Any change to league format (roster/lineup structure, team count, playoff size, season length)', 'Any change to scoring settings', 'Any change to dues, payouts, or prize structure', 'Any decision Commissioners designate as a Significant Decision'].map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '6px', color: TXT, fontSize: '12px', lineHeight: '1.5' }}>
                    <span style={{ color: RED, flexShrink: 0 }}>›</span>{t}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '10px', padding: '16px 18px', marginBottom: '12px' }}>
              <div style={{ color: GLD, fontWeight: '900', fontSize: '13px', marginBottom: '8px' }}>How Votes Are Counted</div>
              {[
                { label: 'Affirmative votes', detail: 'Count toward the threshold.', color: GRN },
                { label: 'No votes', detail: 'Do not count toward the threshold.', color: RED },
                { label: 'Abstentions', detail: 'Do not count toward the threshold.', color: MUT },
                { label: 'Votes not cast', detail: 'Do not count toward the threshold.', color: MUT },
                { label: 'Co-owned teams', detail: 'One team, one vote. Co-owners must submit a single unified vote. Multiple votes from the same franchise are invalid.', color: GLD },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderBottom: i < 4 ? '1px solid ' + BDR : 'none' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.color, flexShrink: 0, marginTop: '4px' }} />
                  <div>
                    <span style={{ color: r.color, fontWeight: '700', fontSize: '13px' }}>{r.label + ': '}</span>
                    <span style={{ color: TXT, fontSize: '13px' }}>{r.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            <NoteB color={BLU} text="If there is a reasonable dispute about whether a matter requires a Majority or Supermajority vote, the Commissioners classify it. Their classification controls the threshold and procedure." />
          </div>
        )}

        {active === 3 && (
          <div>
            <SHead title="Competing Amendments" sub="When two proposals target the same rule" />
            <p style={pSt}>Competing Amendments are two or more proposals that would change the same rule in ways that cannot both be adopted at once. They follow a special process.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <RuleBlock color={BLU} n="1" label="Endorsements are proposal-specific">
                {'Each proposal must independently reach 3 endorsements to appear on the ballot. An owner may endorse more than one Competing Amendment — even all of them. Endorsing one does not block you from endorsing another.'}
              </RuleBlock>
              <RuleBlock color={PRP} n="2" label="Each proposal is voted on separately">
                {'Competing Amendments are not put head-to-head. Each is voted on independently and must independently satisfy the applicable threshold (usually Supermajority — 9 votes). Owners may vote yes on more than one Competing Amendment.'}
              </RuleBlock>
              <RuleBlock color={GLD} n="3" label="Only the top vote-getter is adopted">
                {'If more than one Competing Amendment passes the required threshold, only the one with the highest number of affirmative votes is adopted. All others fail and have no effect — even if they also passed.'}
              </RuleBlock>
              <RuleBlock color={AMB} n="4" label="Tied winners go to a runoff">
                {'If two or more Competing Amendments both pass the threshold and are tied for the most affirmative votes, the league holds a runoff vote limited to the tied proposals. The winner of the runoff must still satisfy a Majority (7 votes) to be adopted.'}
              </RuleBlock>
            </div>
            <CompetingExample />
            <NoteB color={GLD} text="Commissioners determine whether two proposals are Competing Amendments that cannot reasonably be adopted together. If they can coexist, they are treated as independent proposals under the normal process." />
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', padding: '0 20px 24px' }}>
        {active > 0 && (
          <button onClick={() => setActive(active - 1)} style={{ background: CARD, color: TXT, border: '1px solid ' + BDR, padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase' }}>
            Back
          </button>
        )}
        {active < SECTIONS.length - 1 && (
          <button onClick={() => setActive(active + 1)} style={{ background: BLU, color: '#000', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase' }}>
            Next
          </button>
        )}
      </div>
    </div>
  );
}

function SHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#fff' }}>{title}</h2>
      <p style={{ margin: '4px 0 0', color: BLU, fontSize: '12px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{sub}</p>
      <div style={{ height: '2px', background: BLU, marginTop: '10px', width: '80px', opacity: 0.4 }} />
    </div>
  );
}

function ChkCard({ label, color, items }: { label: string; color: string; items: string[] }) {
  return (
    <div style={{ background: CARD, borderRadius: '10px', border: '1px solid ' + BDR, borderTop: '3px solid ' + color, padding: '16px' }}>
      <div style={{ color, fontWeight: '900', fontSize: '13px', marginBottom: '14px' }}>{label}</div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '10px', color: '#cbd5e1', fontSize: '13px', lineHeight: '1.5' }}>
          <span style={{ color, flexShrink: 0, marginTop: '1px' }}>•</span>
          {item}
        </div>
      ))}
    </div>
  );
}

function RuleBlock({ color, n, label, children }: { color: string; n: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderLeft: '4px solid ' + color, borderRadius: '8px', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: color + '22', border: '2px solid ' + color, color: color, fontWeight: '900', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
        <span style={{ color: color, fontWeight: '900', fontSize: '14px' }}>{label}</span>
      </div>
      <div style={{ color: TXT, fontSize: '13px', lineHeight: '1.7' }}>{children}</div>
    </div>
  );
}

function CompetingExample() {
  return (
    <div style={{ background: CARD, border: '1px solid ' + BDR, borderRadius: '12px', padding: '18px 20px', marginBottom: '14px' }}>
      <div style={{ color: GLD, fontWeight: '900', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px' }}>Example Scenario</div>
      <p style={{ color: MUT, fontSize: '13px', lineHeight: '1.6', margin: '0 0 14px' }}>Two teams both propose changes to the same roster rule. Both proposals get 3+ endorsements and are voted on separately:</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
        <div style={{ background: BLU + '12', border: '1px solid ' + BLU + '33', borderRadius: '8px', padding: '12px' }}>
          <div style={{ color: BLU, fontWeight: '900', fontSize: '12px', marginBottom: '6px' }}>Proposal A</div>
          <div style={{ color: MUT, fontSize: '12px', marginBottom: '8px' }}>Change Main Roster limit from 17 to 18</div>
          <div style={{ color: BLU, fontWeight: '900', fontSize: '18px' }}>10 yes votes</div>
          <div style={{ color: GRN, fontSize: '11px', marginTop: '2px' }}>Passed supermajority (9+)</div>
        </div>
        <div style={{ background: PRP + '12', border: '1px solid ' + PRP + '33', borderRadius: '8px', padding: '12px' }}>
          <div style={{ color: PRP, fontWeight: '900', fontSize: '12px', marginBottom: '6px' }}>Proposal B</div>
          <div style={{ color: MUT, fontSize: '12px', marginBottom: '8px' }}>Change Main Roster limit from 17 to 20</div>
          <div style={{ color: PRP, fontWeight: '900', fontSize: '18px' }}>9 yes votes</div>
          <div style={{ color: GRN, fontSize: '11px', marginTop: '2px' }}>Passed supermajority (9+)</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ flex: 1, height: '1px', background: BDR }} />
        <span style={{ color: MUT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>Result</span>
        <div style={{ flex: 1, height: '1px', background: BDR }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ background: GRN + '12', border: '2px solid ' + GRN + '44', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '4px' }}>✅</div>
          <div style={{ color: GRN, fontWeight: '900', fontSize: '13px' }}>Proposal A Adopted</div>
          <div style={{ color: MUT, fontSize: '11px', marginTop: '4px' }}>Most affirmative votes (10)</div>
        </div>
        <div style={{ background: RED + '10', border: '2px solid ' + RED + '33', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '4px' }}>❌</div>
          <div style={{ color: RED, fontWeight: '900', fontSize: '13px' }}>Proposal B Fails</div>
          <div style={{ color: MUT, fontSize: '11px', marginTop: '4px' }}>Fewer votes (9) — has no effect</div>
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
