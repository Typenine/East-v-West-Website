// Shared 2027 prospect board data for TeamProspectDraftboard and TeamProspectDraftboardCompact.
// This is an early, pre-2026-season Superflex watchlist. Rankings are intentionally broad
// and should move as college results and 2027 NFL Draft information arrive.

export const BOARD_VERSION = '2027-preseason-v1';
export const BOARD_LABEL = '2027 Early Prospect Board';

export type ProspectTrend = 'up' | 'steady' | 'down';

export type BoardPlayer = {
  id: string;
  tier: number;
  name: string;
  pos: string;
  /** NFL team. TBD until the 2027 NFL Draft. Kept for draft-room compatibility. */
  team: string;
  college: string;
  /** Initial East v. West Superflex board rank, not an NFL Draft pick number. */
  pick: number;
  s: string[];
  draftRange?: string;
  eligibility?: string;
  trend?: ProspectTrend;
  unlikely?: boolean;
  noFit?: boolean;
  target?: boolean;
  userNote?: string;
};

export const INITIAL_PLAYERS: BoardPlayer[] = [
  {
    id: 'jeremiah-smith', tier: 1, name: 'Jeremiah Smith', pos: 'WR', team: 'TBD', college: 'Ohio State', pick: 1,
    draftRange: 'Top 5', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Rare size, speed, ball skills and production. The clear blue-chip receiver in the class.',
      '2025 — PFF graded him among the best Power Four receivers of the past decade through two college seasons.',
      '2026 WATCH — Maintaining elite efficiency and health is more important than chasing a bigger box score.',
    ],
  },
  {
    id: 'arch-manning', tier: 1, name: 'Arch Manning', pos: 'QB', team: 'TBD', college: 'Texas', pick: 2,
    draftRange: 'Top 5', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Prototype NFL frame with real mobility and premium Superflex upside.',
      '2025 — Finished the season much stronger after an uneven start, keeping the top-pick ceiling intact.',
      '2026 WATCH — Needs a full season of consistent high-end quarterback play to justify the name-value price.',
    ],
  },
  {
    id: 'dante-moore', tier: 1, name: 'Dante Moore', pos: 'QB', team: 'TBD', college: 'Oregon', pick: 3,
    draftRange: 'Top 10', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — High-end arm talent and creation ability with a realistic path to QB1 in the NFL class.',
      '2025 — Led the FBS in PFF big-time throws after a major developmental jump at Oregon.',
      '2026 WATCH — Decision-making consistency and another strong year could push him into top-five NFL capital.',
    ],
  },
  {
    id: 'cam-coleman', tier: 1, name: 'Cam Coleman', pos: 'WR', team: 'TBD', college: 'Texas', pick: 4,
    draftRange: 'Round 1', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Big perimeter receiver with true WR1 traits and a strong early-declare profile.',
      '2026 WATCH — New Texas environment should clarify whether he can turn traits into a dominant target share.',
      'DRAFT — Current consensus has him as the best bet to be WR2 behind Jeremiah Smith.',
    ],
  },
  {
    id: 'julian-sayin', tier: 2, name: 'Julian Sayin', pos: 'QB', team: 'TBD', college: 'Ohio State', pick: 5,
    draftRange: 'Round 1', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Accurate, efficient pocket passer with strong processing and elite supporting talent.',
      '2025 — Completed 78.4% of his passes with 31 TD and 6 INT according to CBS preseason draft analysis.',
      '2026 WATCH — Size and limited rushing remain the fantasy ceiling questions despite strong NFL projection.',
    ],
  },
  {
    id: 'darian-mensah', tier: 2, name: 'Darian Mensah', pos: 'QB', team: 'TBD', college: 'Miami', pick: 6,
    draftRange: 'Round 1-2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Productive passer with NFL size who transferred from Duke into a loaded Miami offense.',
      '2025 — Nearly 4,000 passing yards and 34 TD before the Miami transfer.',
      '2026 WATCH — A title-caliber season against ACC competition could move him firmly into Round 1.',
    ],
  },
  {
    id: 'cj-carr', tier: 2, name: 'CJ Carr', pos: 'QB', team: 'TBD', college: 'Notre Dame', pick: 7,
    draftRange: 'Round 1-2', eligibility: '2027 eligible; could return', trend: 'steady',
    s: [
      'PROFILE — Young, polished passer with quick processing and a strong developmental trajectory.',
      '2026 WATCH — Redshirt-sophomore status makes declaration less certain than the older quarterbacks.',
      'DRAFT — Current boards still see early-round upside if he repeats his 2025 success.',
    ],
  },
  {
    id: 'ahmad-hardy', tier: 2, name: 'Ahmad Hardy', pos: 'RB', team: 'TBD', college: 'Missouri', pick: 8,
    draftRange: 'Day 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Explosive SEC runner with excellent contact balance and breakaway production.',
      '2025 — Led the SEC in rushing yards and led college football with 25 runs of 15-plus yards per PFF.',
      '2026 WATCH — Receiving usage is the biggest swing skill for his dynasty ceiling.',
    ],
  },
  {
    id: 'kewan-lacy', tier: 2, name: 'Kewan Lacy', pos: 'RB', team: 'TBD', college: 'Ole Miss', pick: 9,
    draftRange: 'Day 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Well-built feature-back candidate with vision, competitiveness and pass-protection value.',
      '2025 — Led college football in rushing first downs.',
      '2026 WATCH — Cleaner receiving efficiency would strengthen his case as the most complete RB in the class.',
    ],
  },
  {
    id: 'ryan-coleman-williams', tier: 2, name: 'Ryan Coleman-Williams', pos: 'WR', team: 'TBD', college: 'Alabama', pick: 10,
    draftRange: 'Round 1-2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Explosive Alabama primary receiver with early breakout pedigree and vertical ability.',
      '2026 WATCH — Enters the year as Alabama’s featured wideout and a preseason Biletnikoff candidate.',
      'DRAFT — Strong season could put him squarely in the first-round receiver conversation.',
    ],
  },
  {
    id: 'drew-mestemaker', tier: 2, name: 'Drew Mestemaker', pos: 'QB', team: 'TBD', college: 'Oklahoma State', pick: 11,
    draftRange: 'Round 1-2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Former zero-star recruit with size, production and one of the class’s biggest breakout stories.',
      '2025 — Led the nation in passing yards at North Texas before following his coach to Oklahoma State.',
      '2026 WATCH — Power-conference translation is the central question.',
    ],
  },
  {
    id: 'nick-marsh', tier: 3, name: 'Nick Marsh', pos: 'WR', team: 'TBD', college: 'Indiana', pick: 12,
    draftRange: 'Day 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Big outside receiver with X/Z versatility and a strong early production profile.',
      '2025 — 59 receptions, 662 yards and 6 TD at Michigan State before transferring to Indiana.',
      '2026 WATCH — Indiana gives him a major opportunity to turn volume into a true NFL WR1 résumé.',
    ],
  },
  {
    id: 'jadan-baugh', tier: 3, name: 'Jadan Baugh', pos: 'RB', team: 'TBD', college: 'Florida', pick: 13,
    draftRange: 'Day 2', eligibility: '2027 eligible', trend: 'up',
    s: [
      'PROFILE — 230-pound back with NFL feature size and growing draft momentum.',
      '2026 WATCH — A full healthy season with receiving involvement could make him the RB1 challenger.',
      'DRAFT — Recent preseason boards have moved him sharply upward among 2027 running backs.',
    ],
  },
  {
    id: 'jamari-johnson', tier: 3, name: 'Jamari Johnson', pos: 'TE', team: 'TBD', college: 'Oregon', pick: 14,
    draftRange: 'Round 1-2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Complete in-line tight end with receiving upside from Oregon’s productive TE pipeline.',
      '2025 — Graded higher than 2026 first-rounder Kenyon Sadiq in PFF’s evaluation.',
      '2026 WATCH — Expanded receiving volume could make him the clear TE1.',
    ],
  },
  {
    id: 'lanorris-sellers', tier: 3, name: 'LaNorris Sellers', pos: 'QB', team: 'TBD', college: 'South Carolina', pick: 15,
    draftRange: 'Round 1-2', eligibility: '2027 eligible', trend: 'up',
    s: [
      'PROFILE — Massive dual-threat quarterback with the rushing ceiling fantasy managers want.',
      '2026 WATCH — Passing consistency will decide whether he becomes a first-round NFL quarterback or a traits bet.',
      'DRAFT — Recent preseason boards have moved him upward as the class gets re-evaluated.',
    ],
  },
  {
    id: 'isaac-brown', tier: 3, name: 'Isaac Brown', pos: 'RB', team: 'TBD', college: 'Louisville', pick: 16,
    draftRange: 'Day 2', eligibility: '2027 eligible', trend: 'up',
    s: [
      'PROFILE — Electric space back with rare acceleration and change-of-direction ability.',
      '2025 — Averaged 8.8 yards per carry with 11 runs of 20-plus yards according to CBS draft analysis.',
      '2026 WATCH — Size and lead-back workload durability are the questions; explosive-play upside is not.',
    ],
  },
  {
    id: 'charlie-becker', tier: 3, name: 'Charlie Becker', pos: 'WR', team: 'TBD', college: 'Indiana', pick: 17,
    draftRange: 'Round 1-2', eligibility: '2027 eligible', trend: 'up',
    s: [
      'PROFILE — Big-bodied receiver with rapidly rising NFL Draft buzz entering his junior season.',
      '2026 WATCH — Needs to validate the scouting rise with a larger target share in Indiana’s new offense.',
      'DRAFT — Recent boards have pushed him into the top group behind the elite names.',
    ],
  },
  {
    id: 'ryan-wingo', tier: 3, name: 'Ryan Wingo', pos: 'WR', team: 'TBD', college: 'Texas', pick: 18,
    draftRange: 'Day 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Size/speed receiver with a strong recruiting pedigree and vertical playmaking traits.',
      '2026 WATCH — Texas has a crowded skill group, so target earning matters more than raw athletic flashes.',
      'DRAFT — Some summer evaluators have him near the top five at the position.',
    ],
  },
  {
    id: 'bryant-wesco', tier: 3, name: 'Bryant Wesco', pos: 'WR', team: 'TBD', college: 'Clemson', pick: 19,
    draftRange: 'Day 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Long, explosive receiver with early-career production and downfield upside.',
      '2026 WATCH — Needs to separate from Clemson’s other NFL-caliber pass catchers and command volume.',
      'DRAFT — Consistently appears among the top 2027 devy receiver names.',
    ],
  },
  {
    id: 'jayden-maiava', tier: 3, name: 'Jayden Maiava', pos: 'QB', team: 'TBD', college: 'USC', pick: 20,
    draftRange: 'Round 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Experienced Lincoln Riley quarterback with enough mobility to matter in fantasy.',
      '2025 — 3,711 passing yards, 24 TD, 10 INT plus 6 rushing TD; USC lists him as a premier returning quarterback.',
      '2026 WATCH — A cleaner interception profile could pull him into the Round 1 QB discussion.',
    ],
  },
  {
    id: 'mark-fletcher', tier: 3, name: 'Mark Fletcher Jr.', pos: 'RB', team: 'TBD', college: 'Miami', pick: 21,
    draftRange: 'Day 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Big, physical runner with proven production and an NFL-ready workload profile.',
      '2025 — Broke out for more than 1,100 rushing yards and played well during Miami’s playoff run.',
      '2026 WATCH — More explosive runs and receiving work could move him toward the top of the RB class.',
    ],
  },
  {
    id: 'nate-frazier', tier: 4, name: 'Nate Frazier', pos: 'RB', team: 'TBD', college: 'Georgia', pick: 22,
    draftRange: 'Day 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Physical Georgia runner with a respected work rate and NFL frame.',
      '2026 WATCH — Still needs the signature high-volume season that would separate him from the crowded RB tier.',
      'DRAFT — PFF lists him among the leading early backs in the class.',
    ],
  },
  {
    id: 'justice-haynes', tier: 4, name: 'Justice Haynes', pos: 'RB', team: 'TBD', college: 'Georgia Tech', pick: 23,
    draftRange: 'Day 2-3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Former five-star back with burst, pedigree and multiple Power Four stops.',
      '2025 — 857 rushing yards and 10 TD on 121 carries at Michigan before transferring to Georgia Tech.',
      '2026 WATCH — Health and a complete season in a run-heavy offense could revive early-round buzz.',
    ],
  },
  {
    id: 'treydez-green', tier: 4, name: "Trey'Dez Green", pos: 'TE', team: 'TBD', college: 'LSU', pick: 24,
    draftRange: 'Round 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — 6-foot-6 mismatch athlete with basketball background and major red-zone upside.',
      '2026 WATCH — Route volume and blocking development will determine whether he becomes a true fantasy difference-maker.',
      'DRAFT — Widely viewed as one of the top two tight ends entering the season.',
    ],
  },
  {
    id: 'sam-leavitt', tier: 4, name: 'Sam Leavitt', pos: 'QB', team: 'TBD', college: 'LSU', pick: 25,
    draftRange: 'Round 2-3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Athletic quarterback with starting experience and useful fantasy rushing ability.',
      '2026 WATCH — LSU gives him a major stage to rebuild draft momentum and prove higher-end passing traits.',
      'DRAFT — Still appears on preseason quarterback boards despite a wide range of outcomes.',
    ],
  },
  {
    id: 'kj-duff', tier: 4, name: 'KJ Duff', pos: 'WR', team: 'TBD', college: 'Rutgers', pick: 26,
    draftRange: 'Round 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Huge catch radius and contested-catch production in a 6-foot-6 frame.',
      '2025 — Led the FBS with 22 contested catches according to PFF’s early receiver rankings.',
      '2026 WATCH — Route polish and separation against top corners are the next tests.',
    ],
  },
  {
    id: 'tj-moore', tier: 4, name: 'TJ Moore', pos: 'WR', team: 'TBD', college: 'Clemson', pick: 27,
    draftRange: 'Day 2-3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Athletic Clemson receiver with NFL traits and breakout upside.',
      '2026 WATCH — Needs to turn flashes into a consistent target-earning season.',
      'DRAFT — Regularly appears in the second wave of 2027 devy receivers.',
    ],
  },
  {
    id: 'mario-craver', tier: 4, name: 'Mario Craver', pos: 'WR', team: 'TBD', college: 'Texas A&M', pick: 28,
    draftRange: 'Day 2-3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Speed-oriented receiver with vertical and after-catch upside.',
      '2026 WATCH — Texas A&M role and route-volume growth will determine whether he climbs into the first-round fantasy tier.',
      'DRAFT — Current devy consensus keeps him firmly on the 2027 watchlist.',
    ],
  },
  {
    id: 'eugene-wilson', tier: 4, name: 'Eugene Wilson III', pos: 'WR', team: 'TBD', college: 'LSU', pick: 29,
    draftRange: 'Day 2-3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Dynamic slot/space receiver with proven SEC-level talent.',
      '2026 WATCH — New LSU setting needs to produce a healthy, high-volume season after an uneven path.',
      'DRAFT — Athletic profile keeps him relevant even with a wider range of outcomes.',
    ],
  },
  {
    id: 'lj-martin', tier: 4, name: 'LJ Martin', pos: 'RB', team: 'TBD', college: 'BYU', pick: 30,
    draftRange: 'Day 2-3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Big, productive runner with strong contact efficiency and a feature-back frame.',
      '2025 — 1,299 rushing yards and 56 forced missed tackles in PFF’s evaluation.',
      '2026 WATCH — Receiving role and long-speed testing will shape his fantasy ceiling.',
    ],
  },
  {
    id: 'terrance-carter', tier: 4, name: 'Terrance Carter Jr.', pos: 'TE', team: 'TBD', college: 'Texas Tech', pick: 31,
    draftRange: 'Round 2-3', eligibility: '2027 eligible', trend: 'up',
    s: [
      'PROFILE — Move-tight-end playmaker with unusual tackle-breaking production.',
      '2025 — Returned as the class leader at TE in receiving yards and missed tackles forced per PFF.',
      '2026 WATCH — Continued production could push him much higher in fantasy-specific rankings.',
    ],
  },
  {
    id: 'duce-robinson', tier: 4, name: 'Duce Robinson', pos: 'WR', team: 'TBD', college: 'Florida State', pick: 32,
    draftRange: 'Round 2', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Massive outside receiver with legitimate downfield production and multi-sport athletic background.',
      '2025 — 56 catches, 1,081 yards and 6 TD; first-team All-ACC at Florida State.',
      '2026 WATCH — Route versatility and separation are the keys to converting size into NFL target volume.',
    ],
  },
  {
    id: 'cj-bailey', tier: 4, name: 'CJ Bailey', pos: 'QB', team: 'TBD', college: 'NC State', pick: 33,
    draftRange: 'Round 3+', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Tall, experienced passer with enough tools to enter the QB riser conversation.',
      '2026 WATCH — NC State replaced most of its receiving production, making his supporting cast a real evaluation variable.',
      'DRAFT — Current boards place him behind the crowded top QB tier but still within the draftable watch group.',
    ],
  },
  {
    id: 'jayce-brown', tier: 5, name: 'Jayce Brown', pos: 'WR', team: 'TBD', college: 'LSU', pick: 34,
    draftRange: 'Day 2-3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Productive receiver entering a high-visibility LSU offense.',
      '2026 WATCH — Needs to carve out a consistent role in a deep pass-catching room.',
      'DRAFT — Appears in the deeper 2027 devy receiver consensus.',
    ],
  },
  {
    id: 'cooper-barkate', tier: 5, name: 'Cooper Barkate', pos: 'WR', team: 'TBD', college: 'Miami', pick: 35,
    draftRange: 'Day 2-3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Experienced target earner joining one of the nation’s most talented offenses.',
      '2026 WATCH — Miami’s target competition will tell us whether his production translates at a higher level.',
      'DRAFT — A strong season with Darian Mensah would create a fast rise.',
    ],
  },
  {
    id: 'nyck-harbor', tier: 5, name: 'Nyck Harbor', pos: 'WR', team: 'TBD', college: 'South Carolina', pick: 36,
    draftRange: 'Day 2-3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — One of college football’s rarest size/speed athletes.',
      '2026 WATCH — Fantasy value depends on becoming a refined, high-volume receiver rather than just an athletic projection.',
      'DRAFT — Trait ceiling remains enormous even though production has lagged the physical tools.',
    ],
  },
  {
    id: 'darius-taylor', tier: 5, name: 'Darius Taylor', pos: 'RB', team: 'TBD', college: 'Minnesota', pick: 37,
    draftRange: 'Day 3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Productive Big Ten back with useful receiving ability and workload experience.',
      '2026 WATCH — Health, efficiency and athletic testing will determine whether he can climb into Day 2.',
      'DRAFT — Strong depth option in a class without a locked elite RB prospect.',
    ],
  },
  {
    id: 'fluff-bothwell', tier: 5, name: 'Fluff Bothwell', pos: 'RB', team: 'TBD', college: 'Mississippi State', pick: 38,
    draftRange: 'Day 3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Powerful 230-pound runner with an SEC opportunity to make a major jump.',
      '2026 WATCH — A breakout against SEC defenses would quickly move him into the Day 2 fantasy conversation.',
      'DRAFT — Current preseason boards list him in the deeper running-back tier.',
    ],
  },
  {
    id: 'peter-clarke', tier: 5, name: 'Peter Clarke', pos: 'TE', team: 'TBD', college: 'Temple', pick: 39,
    draftRange: 'Day 3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Massive 6-foot-6 receiving tight end with a highly productive 2025 season.',
      '2025 — Posted a 90.5 PFF overall grade, the best among FBS tight ends in PFF’s early class review.',
      '2026 WATCH — Competition level and athletic testing will decide how much of the production translates.',
    ],
  },
  {
    id: 'hollywood-smothers', tier: 5, name: 'Hollywood Smothers', pos: 'RB', team: 'TBD', college: 'Texas', pick: 40,
    draftRange: 'Day 3', eligibility: '2027 eligible', trend: 'steady',
    s: [
      'PROFILE — Explosive runner in a high-end Texas offense with a chance to force his way up the board.',
      '2026 WATCH — Backfield competition is the immediate issue; efficiency and receiving usage can overcome it.',
      'DRAFT — Received top-10 positional consideration from summer evaluators.',
    ],
  },
];

export const BOARD_API_URL = '/api/team-prospect-draftboard';

export function parsePick(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

export function sortByPick<T extends { pick?: number }>(items: T[]) {
  return [...items].sort((a, b) => parsePick(a.pick) - parsePick(b.pick));
}

export const DEFAULT_PLAYERS = sortByPick(INITIAL_PLAYERS.map((p) => ({ ...p })));
