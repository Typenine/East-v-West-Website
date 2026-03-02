// Authoritative Rules content sourced from the East v. West Rulebook v3 Google Doc
// Ratified by unanimous vote on February 12, 2026
// The content is structured as simple HTML strings for easy rendering.

export type RulesHtmlSection = {
  id: string;
  title: string;
  html: string;
};

export const rulesHtmlSections: RulesHtmlSection[] = [
  {
    id: 'league-overview',
    title: '1. League Overview',
    html: `
      <p><strong>1.1</strong> - This rulebook was ratified by unanimous vote of the League on February 12, 2026, and is effective immediately.</p>
      <p><strong>1.2</strong> - Format: SuperFlex Dynasty League.</p>
      <p><strong>1.3</strong> - Scoring: 0.5 PPR.</p>
      <p><strong>1.4</strong> - Platform: Sleeper. Sleeper's settings, scoring, and transaction statuses control league operation unless the rulebook explicitly states otherwise. In the event of any conflict between Sleeper's platform functionality and this rulebook, this rulebook shall govern.</p>
    `,
  },
  {
    id: 'definitions-terms',
    title: '2. Definitions & Terms',
    html: `
      <p><strong>League structure</strong></p>
      <ul>
        <li>"League": The East v. West SuperFlex Dynasty League operated on Sleeper.</li>
        <li>"League Year": The period beginning on Super Bowl Sunday and ending after NFL Week 17.</li>
        <li>"Regular Season": Weeks used for standings before playoffs, this means Weeks 1–14.</li>
        <li>"Offseason" means the period beginning at the end of the League Year and ending at the kickoff of NFL Week 1 of the next season.</li>
        <li>"Championship Round" means the week of the league championship matchup on Sleeper (i.e., the final week of the league's playoff bracket in which the League Champion is determined).</li>
        <li>"Postseason / Playoffs": The single-elimination bracket beginning NFL Week 15.</li>
        <li>"SuperFlex": A starting lineup spot that can be filled by QB/RB/WR/TE.</li>
        <li>"0.5 PPR (Half-PPR)": Scoring format where each reception is worth 0.5 points.</li>
        <li>"Rival": The team assigned as an opponent for Rivalry Week under Section 4.6(d).</li>
        <li>"Rivalry Week": means each Regular Season week designated under Section 4.6(c).</li>
      </ul>
      <p><strong>Governance / Voting</strong></p>
      <ul>
        <li>"Commissioners" means the league administrators responsible for administering the league, interpreting and enforcing this rulebook, resolving disputes, and carrying out league actions required to operate and manage the league.</li>
        <li>"Majority Vote" means a vote of seven (7) teams.</li>
        <li>"Supermajority Vote" means a vote of nine (9) teams.</li>
        <li>"In-Season Rule Change" means a rule change considered for implementation during the active East vs. West season.</li>
      </ul>
      <p><strong>Roster terms</strong></p>
      <ul>
        <li>"Main Roster" means all players assigned to a team in Sleeper occupying the Starting Lineup and Bench slots.</li>
        <li>"Active Roster": All players assigned to a team in Sleeper occupying the Main Roster and IR slots. (Active Roster = Main Roster + IR. It does not include Taxi Squad.)</li>
        <li>"Total Roster": All players assigned to a team in Sleeper across Active Roster and Taxi Squad slots. (Total Roster = Main Roster + IR + Taxi.)</li>
        <li>"Main Roster Limit": means the maximum number of players permitted in the Starting Lineup and Bench slots, as governed by Sleeper. IR and Taxi Squad slots do not count toward the Main Roster Limit.</li>
        <li>"Injured Reserve (IR)": A designated roster bucket with its own slot count, governed by Sleeper's IR eligibility.</li>
        <li>"Taxi Squad (Taxi)": means the league's Taxi roster spots, used to roster up to four (4) players, with a maximum of one (1) quarterback on Taxi at any time.</li>
        <li>"Taxi Activation" and "Taxi Activated": means moving a player from Taxi to any non-Taxi roster location (Starting Lineup, Bench, or IR).</li>
        <li>"Rookie" means a player designated as a rookie on Sleeper.</li>
      </ul>
      <p><strong>Player / Game Status Terms</strong></p>
      <ul>
        <li>"Kickoff" means the scheduled start time of the player's NFL game.</li>
        <li>"Game Time" means the time of Kickoff.</li>
        <li>"Sleeper Status" means the player's game or injury designation as displayed on Sleeper.</li>
        <li>"Ruled Out" means the player is designated on Sleeper as "Out" or an equivalent non-playing status used by Sleeper.</li>
        <li>"Ruled-Out Deadline" means the time that is twelve (12) hours before a player's Kickoff for that week's game.</li>
        <li>"Projected Score" means the player's projected fantasy points as displayed by Sleeper for that week.</li>
        <li>"End of Week" means the conclusion of the final NFL game scheduled for that week (i.e., after the week's last game ends, typically Monday Night Football).</li>
        <li>"Projected to Play" means that, for the applicable scoring week, Sleeper shows the player as having a Projected Score of at least 0.1 (i.e., not blank/"—" and not 0.0) and the player is not on a Bye at the time the projection is checked.</li>
        <li>"Sleeper News Update" means a news item shown on the player's Sleeper page/player card that includes a source/citation.</li>
        <li>"Out Update Time" means the time shown on Sleeper for the first Sleeper News Update indicating the player is Ruled Out for that game.</li>
        <li>"Lineup Lock" means the time when Sleeper prevents a manager from changing a lineup decision for a given player, which occurs at that player's Kickoff (or as otherwise enforced by Sleeper).</li>
        <li>"Bye Week" means the scoring week in which the player's NFL team has no scheduled game.</li>
      </ul>
      <p><strong>Compliance / Legality</strong></p>
      <ul>
        <li>"In Compliance" means meeting all applicable requirements of this rulebook, including roster limits and lineup requirements, regardless of whether the platform allows a team to temporarily exceed or bypass those requirements.</li>
        <li>"Illegal Lineup" means a Starting Lineup that violates the lineup requirements in this rulebook.</li>
      </ul>
      <p><strong>Player acquisition</strong></p>
      <ul>
        <li>"Waivers" means the player acquisition process using waiver claims.</li>
        <li>"FAAB (Free Agent Acquisition Budget)" means the seasonal waiver bidding budget.</li>
        <li>"Bid" means the FAAB amount attached to a waiver claim.</li>
        <li>"Minimum Bid" means the lowest permitted bid amount.</li>
        <li>"Free Agent" means an unrostered player available to be added outside waivers, as permitted by the platform at the time of the add.</li>
      </ul>
      <p><strong>Trades / picks</strong></p>
      <ul>
        <li>"Trade Review" means the league's approval process for trades.</li>
        <li>"Trade Deadline" means the cutoff after which trades are not permitted.</li>
        <li>"Future Pick" means a draft pick from a later draft year.</li>
        <li>"Current Year Pick" means a draft pick in the Entry Draft that occurs within the current League Year.</li>
        <li>"Next Year Pick" means a draft pick in the Entry Draft that occurs in the League Year immediately following the current League Year.</li>
      </ul>
      <p><strong>Draft / Playoffs</strong></p>
      <ul>
        <li>"Entry Draft" means the annual draft consisting of four (4) rounds and including rookies and all defenses.</li>
        <li>"Inaugural Draft" means the original auction draft in 2023.</li>
        <li>"Draft Pick" means a selection slot in the league's rookie entry draft.</li>
        <li>"Draft Order" means the order teams select in the Entry Draft as determined by league rules and reflected on Sleeper.</li>
        <li>"Seed" means a team's placement entering the playoff bracket.</li>
        <li>"Single Elimination" means a playoff format where a loss eliminates a team from the bracket.</li>
        <li>"Toilet Bowl" means the postseason bracket used for the league's toilet bowl outcome(s).</li>
        <li>"Toilet Bowl Trophy Obligation Team" means the team that loses the Toilet Bowl Final and is responsible for shipping the league trophy to the new champion.</li>
        <li>"Toilet Bowl Final" means the final Toilet Bowl matchup used by the league to determine the trophy-shipping obligation.</li>
      </ul>
      <p><strong>Money / Awards</strong></p>
      <ul>
        <li>"League Dues" means the annual required payment.</li>
        <li>"Half Dues" means fifty percent (50%) of League Dues for the applicable league year.</li>
        <li>"Remaining Balance" means the unpaid portion of League Dues for the applicable league year.</li>
        <li>"Dues Credit" means any amount applied toward a team's League Dues for a league year, whether paid directly or applied from another source (including Winnings).</li>
        <li>"Overpayment" means any amount paid or credited to a team's League Dues that exceeds what that team owes for the applicable league year.</li>
        <li>"Prize Payouts" means the league's listed payouts for season awards and placements.</li>
        <li>"Winnings" means any cash amount earned by a team under the league's Prize Payouts.</li>
        <li>"MVP" means the single player scoring the most points during the regular season.</li>
        <li>"ROY" means the rookie player scoring the most points during the regular season.</li>
        <li>"Best Power Ranking Award" means the league-voted award for best power ranking.</li>
        <li>"Weekly High Score" means the highest single-week team score during the Regular Season for that week, as reflected on Sleeper.</li>
      </ul>
    `,
  },
  {
    id: 'governance-authority',
    title: '3. Governance & Authority',
    html: `
      <p><strong>3.1 - Commissioners</strong></p>
      <ul>
        <li>3.1(a) The League is administered by two Commissioners. The identity of the Commissioners shall be: Jason Richards and Patrick McNulty.</li>
        <li>3.1(b) Commissioners have final authority to administer, interpret, and enforce this rulebook and to manage league operations.</li>
        <li>3.1(c) Commissioners will act in good faith and in the best interests of the league.</li>
      </ul>
      <p><strong>3.2 - Rule Interpretations and Clarifications</strong></p>
      <ul>
        <li>3.2(a) The Commissioners may issue binding interpretations to resolve ambiguity, fill gaps, omissions, and decide disputes and punishments.</li>
        <li>3.2(b) Interpretations are intended to reflect the rulebook's intent, consistent league practice, and competitive integrity.</li>
        <li>3.2(c) An interpretation issued to resolve a matter is binding for that matter and may be documented as a clarification for future seasons.</li>
      </ul>
      <p><strong>3.3 - In-Season Changes and Emergency Decisions</strong></p>
      <ul>
        <li>3.3(a) Rule changes are not implemented in-season unless both Commissioners determine it is warranted.</li>
        <li>3.3(b) Commissioners may take immediate action to address platform outages, administrative errors, or situations that threaten league integrity, with follow-up communication to the league.</li>
      </ul>
      <p><strong>3.4 - Enforcement and Remedies</strong></p>
      <ul>
        <li>3.4(a) If a specific punishment or remedy is expressly stated elsewhere in this rulebook, that stated punishment/remedy controls. If the rulebook does not specify a punishment/remedy for a violation, the Commissioners will determine the appropriate punishment/remedy in their reasonable discretion.</li>
        <li>3.4(a)(1) The Commissioners may consider severity, intent, repeat behavior, competitive impact, and league integrity when determining an appropriate punishment/remedy.</li>
      </ul>
      <p><strong>3.5 - Vote Thresholds and What Counts</strong></p>
      <ul>
        <li>3.5(a) A Majority Vote requires seven (7) affirmative votes.</li>
        <li>3.5(b) A Supermajority Vote requires nine (9) affirmative votes.</li>
        <li>3.5(c) A vote "passes" only if it receives the required number of affirmative votes. Any vote not cast, abstention, or "no" vote does not count toward the threshold.</li>
        <li>3.5(d) A franchise with multiple owners is entitled to one (1) vote in any League vote ("one team, one vote"). Co-owners must cast one single, unified vote on behalf of the franchise. Any attempt to cast multiple votes on behalf of the same franchise is invalid.</li>
        <li>3.5(d)(1) For draft trip location votes only, each co-owner may cast one (1) individual vote.</li>
      </ul>
      <p><strong>3.6 - Majority vs Supermajority Categories</strong></p>
      <ul>
        <li>3.6(a) Supermajority Vote required for:
          <ul>
            <li>Any change to league format (roster structure, lineup structure, number of teams, playoff size, regular season length).</li>
            <li>Any change to scoring settings.</li>
            <li>Any change to dues, payouts, or prize structure.</li>
            <li>Any other decision the Commissioners designate as a "Significant Decision."</li>
          </ul>
        </li>
        <li>3.6(b) Majority Vote is permitted for routine league matters that do not change rules or core league structure, including (examples): draft-trip logistics, scheduling/logistics decisions, award voting, and other administrative league matters.</li>
        <li>3.6(c) If there is a reasonable dispute as to whether a matter is a routine league matter or a significant decision, the Commissioners will classify the matter in their discretion. The classification controls the voting threshold and procedure for that matter.</li>
      </ul>
      <p><strong>3.7 - No Waiver</strong></p>
      <ul>
        <li>3.7(a) Failure to enforce a rule in one instance does not waive the rule and does not create precedent. However, consistent non-enforcement or selective enforcement of a rule over multiple instances may be considered by the league when evaluating whether the rule reflects current league practice and intent.</li>
      </ul>
    `,
  },
  {
    id: 'season-calendar',
    title: '4. Season Calendar & Key Deadlines',
    html: `
      <p><strong>4.1 - League Year</strong></p>
      <ul>
        <li>4.1(a) The League Year begins on Super Bowl Sunday.</li>
        <li>4.1(b) The League Year ends after NFL Week 17 concludes.</li>
        <li>4.1(c) The Offseason runs from the end of the League Year through kickoff of NFL Week 1 of the next season.</li>
      </ul>
      <p><strong>4.2 - Dues Deadlines</strong></p>
      <ul>
        <li>4.2(a) Half Dues are due at the start of the League Year (Super Bowl Sunday).</li>
        <li>4.2(b) The Remaining Balance is due by June 1, unless a different deadline applies under Section 10.2(c) or 10.2(d).</li>
      </ul>
      <p><strong>4.3 - Roster Compliance Deadline</strong></p>
      <ul>
        <li>4.3(a) All teams must be In Compliance with roster limits in order to participate in Free Agency and Waivers. A team may not add a player, submit a waiver claim, or submit a FAAB bid unless the team is In Compliance at the time the transaction is submitted on Sleeper. Teams must be In Compliance no later than the time Free Agency and Waivers bidding reopens under Section 4.5(b), consistent with Section 5.6(a).</li>
      </ul>
      <p><strong>4.4 - Trade Window</strong></p>
      <ul>
        <li>4.4(a) Trading opens on Super Bowl Sunday.</li>
        <li>4.4(b) The Trade Deadline is the End of Week 12, consistent with Section 7.1.</li>
      </ul>
      <p><strong>4.5 - Free Agency and Waivers Timeline</strong></p>
      <ul>
        <li>4.5(a) Free agency and waivers close after the Championship Round, consistent with Section 6.3(a).</li>
        <li>4.5(b) Free agency and waivers bidding reopens on the first Monday after the conclusion of all NFL preseason Week 1 games.</li>
        <li>4.5(b)(1) The first waiver processing after reopening occurs at 12:01 a.m. Pacific Time on Thursday of that week.</li>
      </ul>
      <p><strong>4.6 - Regular Season and Playoffs</strong></p>
      <ul>
        <li>4.6(a) The Regular Season is NFL Weeks 1–14.</li>
        <li>4.6(b) The playoffs begin NFL Week 15.</li>
        <li>4.6(c) Rivalry Week. The League will designate two (2) weeks of the Regular Season as "Rivalry Week." During Rivalry Week, each team will play its assigned Rival.</li>
        <li>4.6(d) Rival Determination: Rivalry Strength Budget System.
          <ul>
            <li>4.6(d)(1) Submission Requirement. Each team must submit a Rivalry Strength ranking for every other team each season, using the method and form designated by the Commissioners.</li>
            <li>4.6(d)(2) Scores; Budget. Each team must assign each of the other eleven (11) teams a unique whole-number score from 1–100 ("Rivalry Strength Scores"). No number may be used more than once. The total of all Rivalry Strength Scores must equal 550. Each other team must receive at least one (1) point.</li>
            <li>4.6(d)(3) Blood Feuds. If two teams assign each other a score of 100, that matchup is automatically locked as a "Blood Feud." Blood Feuds cannot be overridden. Once locked, those teams are removed from further pairing.</li>
            <li>4.6(d)(4) Pairing Method. For every remaining pair of teams A and B, the "Combined Rivalry Strength" equals (A's score for B) + (B's score for A). All remaining possible pairings are ranked from highest to lowest Combined Rivalry Strength. Starting at the highest Combined Rivalry Strength, teams are paired off and removed from further pairing until every team has exactly one Rival.</li>
          </ul>
        </li>
      </ul>
      <p><strong>4.7 - Draft Location Selection</strong></p>
      <ul>
        <li>4.7(a) The draft location vote will occur at least seventeen (17) months before the applicable Draft Trip, consistent with Section 14.4.</li>
      </ul>
    `,
  },
  {
    id: 'rosters-lineups',
    title: '5. Rosters & Lineups',
    html: `
      <p><strong>5.1 - Roster Limits</strong></p>
      <ul>
        <li>5.1(a) Main Roster Limit: 17 players. The Main Roster Limit applies only to players in a team's Starting Lineup and Bench slots. Players on IR and Taxi are governed by their separate slot limits and do not count toward the Main Roster Limit.</li>
      </ul>
      <p><strong>5.2 - Starting Lineup:</strong></p>
      <ul>
        <li>5.2(a) 1 Quarterback (QB)</li>
        <li>5.2(b) 2 Running Backs (RB)</li>
        <li>5.2(c) 2 Wide Receivers (WR)</li>
        <li>5.2(d) 1 Tight End (TE)</li>
        <li>5.2(e) 1 Flex (RB/WR/TE)</li>
        <li>5.2(f) 1 SuperFlex (QB/RB/WR/TE)</li>
        <li>5.2(g) 1 Kicker (K)</li>
        <li>5.2(h) 1 Defense/Special Teams (D/ST)</li>
      </ul>
      <p><strong>5.3 - Bench:</strong> 7 players</p>
      <p><strong>5.4 - Injured Reserve (IR):</strong> 4 spots</p>
      <p><strong>5.5 - Taxi Squad:</strong></p>
      <ul>
        <li>5.5(a) Capacity. Each team may roster up to four (4) players on the Taxi Squad at any time. A team may roster no more than one (1) quarterback on the Taxi Squad at any time.</li>
        <li>5.5(b) Permitted Additions. Players may be placed on the Taxi Squad when acquired via Entry Draft, trade, or free agency, subject to Section 5.5(a) and provided that such placement occurs before Sunday of that week.</li>
        <li>5.5(c) Once a player is Taxi Activated, that player may not be placed back on the Taxi Squad while the player remains rostered by that team.</li>
        <li>5.5(d) A player who leaves the team's roster entirely may be placed on the Taxi Squad again only if the team later reacquires the player (by trade, free agency, or Entry Draft) and the placement otherwise complies with this Section 5.5 and Sleeper.</li>
        <li>5.5(e) Offseason Reset for First- and Second-Year Players. During each offseason, a team may place a first-year or second-year player on the Taxi Squad even if that player was previously Taxi Activated by that team, provided the team complies with Section 5.5(a) and Sleeper.
          <ul>
            <li>5.5(e)(1) For purposes of Section 5.5(e) only, a player remains eligible for the offseason reset until the kickoff of Week 1 of the NFL regular season of what would be the player's third NFL season. At that kickoff, the player is treated as a Third-Year Player for purposes of Section 5.5(e).</li>
            <li>5.5(e)(2) After a player is placed on Taxi pursuant to the offseason reset, any subsequent Taxi Activation of that player is governed by the normal Taxi Squad rules, including Section 5.5(c). A player may be placed on Taxi again pursuant to this Section 5.5(e) only if (i) the placement occurs during a later offseason and (ii) the player remains eligible under Section 5.5(e)(1) at that time.</li>
          </ul>
        </li>
        <li>5.5(f) Compliance. Managers are responsible for remaining In Compliance with all Taxi Squad requirements, regardless of what Sleeper allows or displays.</li>
      </ul>
      <p><strong>5.5(g) - Violations and Penalties</strong></p>
      <ul>
        <li>5.5(g)(1) Violations. Taxi Squad violations include, without limitation:
          <ul>
            <li>(i) exceeding the four (4) player limit;</li>
            <li>(ii) exceeding the one (1) QB limit;</li>
            <li>(iii) placing a player on Taxi, or allowing a player to remain on Taxi, in violation of Section 5.5(c), including where a player is ineligible for Taxi or has become ineligible and is not removed; or</li>
            <li>(iv) any other Taxi Squad use that violates this rulebook. A Taxi Squad violation exists for as long as the team remains out of compliance, regardless of whether the violation resulted from the initial placement or the player remaining on Taxi thereafter.</li>
          </ul>
        </li>
        <li>5.5(g)(2) Penalty Tiers. Taxi Squad violations are subject to the following tiered penalties, by violation count:
          <ul>
            <li>(i) First Violation (Tier 1): Loss of FAAB. The violating team forfeits one-half (1/2) of its current FAAB balance at the time the penalty is assessed (rounded up to the nearest whole FAAB). If the violating team has less than fifty (50) FAAB at the time the penalty is assessed, the team forfeits all remaining FAAB, and the penalty immediately escalates to Tier 2 for that same violation (i.e., the team also incurs the $20 fine).</li>
            <li>(ii) Second Violation (Tier 2): $20 fine.</li>
            <li>(iii) Third Violation (Tier 3): Loss of a Draft Pick. The violating team forfeits its next first-round draft pick, meaning the earliest first-round pick the team owns (in the upcoming rookie draft; if not owned, then the earliest subsequent first-round pick the team owns). The forfeited pick is removed from the team's draft assets.</li>
          </ul>
        </li>
        <li>5.5(g)(3) Inability to Satisfy a Tier. If a team cannot satisfy the penalty imposed at a given tier at the time the penalty is assessed (e.g., the team has insufficient FAAB to pay a Tier 1 penalty), the penalty automatically escalates to the next tier. If the team cannot satisfy Tier 2, the penalty escalates to Tier 3.</li>
        <li>5.5(g)(4) Required Correction; Continuing Violations. Upon notice (or discovery by the Commissioners) of a Taxi Squad violation, the team must promptly take whatever actions are required to return to In Compliance. If the team does not return to In Compliance promptly, the violation is treated as a continuing violation, and the team incurs additional violations for as long as it remains out of compliance, with the penalty tier escalating accordingly.
          <ul>
            <li>5.5(g)(4)(A) Same-Player Escalation. If a Taxi Squad violation involves a specific player being improperly placed on Taxi (or improperly remaining on Taxi), the violation count and escalating penalty tiers apply to that same player until the team returns to In Compliance.</li>
          </ul>
        </li>
      </ul>
      <p><strong>5.6 - Roster Compliance:</strong></p>
      <ul>
        <li>5.6(a) All teams must be within all roster limits (including Starting Lineup, Bench, IR, and Taxi Squad limits, and any applicable sub-limits such as the Taxi Squad QB limit) by the time Free Agency and Waivers bidding reopens under Section 4.5(b), consistent with Section 4.3(a).</li>
        <li>5.6(b) While the Sleeper platform is used for roster management, the obligation for roster compliance lies with the team owner. It is the responsibility of each manager to ensure their team is compliant with the league's roster rules, including bench, IR, taxi squad, and active roster limits, regardless of what is displayed on Sleeper.</li>
        <li>5.6(c) All players in the Starting Lineup must be Projected to Play as determined by Sleeper's projection system. A team is not in violation of this rule if a player becomes Ruled Out within twelve (12) hours of that player's Kickoff.
          <ul>
            <li>5.6(c)(1) Compliance under Section 5.6(c) is evaluated on a player-by-player basis at the Ruled-Out Deadline (twelve (12) hours before that player's Kickoff).</li>
            <li>5.6(c)(2) For purposes of Section 5.6(c), whether a player was Ruled Out before or after the Ruled-Out Deadline will be determined using Sleeper Status and the Out Update Time on the player's Sleeper page.</li>
            <li>5.6(c)(3) If Sleeper does not display an Out Update Time for the relevant designation, or if the Out Update Time cannot be reasonably determined, the Commissioners will decide using the best available Sleeper information and any reasonably reliable timestamped source (including but not limited to official NFL injury reports, ESPN, or other major sports media outlets); if the timing remains unclear after consulting such sources, the determination will be made in the Commissioners' discretion, and such determination shall be final and binding.</li>
            <li>5.6(c)(4) Limited Quarterback Exception (Scarcity). A team is not in violation of Section 5.6(c) for starting a quarterback who is not Projected to Play solely because the quarterback's Projected Score is below 0.1 points, only if all of the following are true at the Ruled-Out Deadline for that quarterback's Kickoff:
              <ul>
                <li>5.6(c)(4)(A) The team has no quarterback on its Active Roster who is Projected to Play; and</li>
                <li>5.6(c)(4)(B) No quarterback who is Projected to Play is available to be added on Sleeper at that time (including because all such quarterbacks are rostered or otherwise unavailable under Sleeper rules); and</li>
                <li>5.6(c)(4)(C) The started quarterback is not Ruled Out at the Ruled-Out Deadline; and</li>
                <li>5.6(c)(4)(D) The started quarterback is not on a Bye Week.</li>
              </ul>
            </li>
            <li>5.6(c)(5) No Strategic Use. The Limited Quarterback Exception may not be used if the team has any quarterback on its Active Roster who is Projected to Play, or if a quarterback who is Projected to Play is available to be added on Sleeper at the relevant time.</li>
            <li>5.6(c)(6) Determination. The Commissioners will determine quarterback availability and whether the conditions in Sections 5.6(c)(4)–(5) are met using Sleeper information and, if necessary, other reasonably reliable sources. The Commissioners' determination shall be final and binding, absent clear and irrefutable error.</li>
          </ul>
        </li>
      </ul>
    `,
  },
  {
    id: 'free-agency-waivers',
    title: '6. Free Agency & Waivers',
    html: `
      <p><strong>6.1</strong> - Waiver Budget (FAAB). Each team receives $100 in FAAB per season. FAAB does not carry over between seasons.</p>
      <p><strong>6.2</strong> - Minimum Bid. The Minimum Bid is $1.</p>
      <p><strong>6.3 - Free Agency Timeline.</strong></p>
      <ul>
        <li>6.3(a) Free agency and waivers close after the Championship Round.</li>
        <li>6.3(b) Free agency and waivers bidding reopens on the first Monday after the conclusion of all NFL preseason Week 1 games.</li>
        <li>6.3(c) The first waiver processing after reopening will occur at 12:01 a.m. Pacific Time (or Pacific Daylight Time, as applicable) on Thursday of that week.</li>
      </ul>
      <p><strong>6.4</strong> - During the Regular Season, waiver processing runs per the league's Sleeper waiver settings unless the rulebook says otherwise.</p>
    `,
  },
  {
    id: 'trades',
    title: '7. Trades',
    html: `
      <p><strong>7.1 - Trade Deadline:</strong> Trades must be proposed and accepted on Sleeper before the Trade Deadline.</p>
      <ul>
        <li>7.1(a) The Trade Deadline occurs at the End of Week 12.</li>
        <li>7.1(b) A trade accepted on Sleeper before the Trade Deadline remains eligible for Commissioner review and processing under the league's trade review rules if allowed on Sleeper.</li>
      </ul>
      <p><strong>7.2 - Trade Review</strong></p>
      <ul>
        <li>7.2(a) Trades must be accepted on Sleeper and are subject to Commissioner approval.</li>
        <li>7.2(b) Any manager may raise a concern regarding a trade by notifying the Commissioners within twenty-four (24) hours of the trade being accepted on Sleeper.</li>
        <li>7.2(c) If a concern is raised, the Commissioners may solicit input from the league and may extend the review period as needed.</li>
        <li>7.2(d) The Commissioners retain final decision-making authority on whether to approve, reject, or impose a remedy regarding a trade.</li>
      </ul>
      <p><strong>7.3 - Future Pick Trading</strong></p>
      <ul>
        <li>7.3(a) Teams may trade Draft Picks only for:
          <ul>
            <li>(i) Current Year Picks,</li>
            <li>(ii) Next Year Picks, and</li>
            <li>(iii) Draft Picks in the League Year two (2) years after the current League Year, subject to the payment requirements below.</li>
          </ul>
        </li>
        <li>7.3(b) To trade a Next Year Pick, the team trading away the pick must provide Dues Credit equal to Half Dues for that Next League Year if Half Dues are unpaid.</li>
        <li>7.3(c) To trade a Draft Pick in the League Year two (2) years after the current League Year, the team trading away the pick must provide Dues Credit equal to League Dues in full for that League Year.</li>
        <li>7.3(d) Payment/credit required by this Section 7.3 must be satisfied before the trade is eligible for approval under Trade Review.</li>
      </ul>
      <p><strong>7.4 - Outside Consideration Prohibited</strong></p>
      <ul>
        <li>7.4(a) Outside Consideration Prohibited. No trade may be conditioned on or include any "outside consideration," meaning anything of value outside the Sleeper league, including but not limited to cash, payment app transfers, gifts, services, travel expenses, meals/drinks, merchandise, favors, or agreements to split winnings. All trade terms must be limited to Sleeper-rostered players, FAAB, and draft picks. Any trade involving outside consideration is voidable and may be reversed, and the Commissioners may impose penalties under Section 12.</li>
        <li>7.4(a)(1) League Dues / Dues Credit Trade Consideration. Payment of another team's League Dues or Dues Credit (in whole or in part) may not be offered, requested, or used as consideration for a trade, whether paid directly to the other team or paid to the League on that team's behalf. Any agreement involving League Dues or Dues Credit as trade consideration is prohibited and subject to reversal and penalties under this rulebook.</li>
      </ul>
    `,
  },
  {
    id: 'draft',
    title: '8. Draft',
    html: `
      <p><strong>8.1 - Annual Entry Draft</strong></p>
      <ul>
        <li>8.1(a) The annual entry draft will consist of 4 rounds.</li>
        <li>8.1(b) The annual entry draft includes rookies and all defenses.</li>
        <li>8.1(c) The entry draft occurs annually sometime after the NFL Draft.</li>
      </ul>
      <p><strong>8.2 - Draft Order</strong></p>
      <ul>
        <li>8.2(a) Draft order is determined by Regular Season standings and playoff elimination rounds, as set forth below.
          <ul>
            <li>8.2(a)(1) Teams that do not qualify for the Playoffs select first, ordered by Regular Season standings from worst to best (worst Regular Season finish receives the earliest pick).</li>
            <li>8.2(a)(2) Teams eliminated from the playoffs are slotted into draft order in the order they are eliminated (teams eliminated earlier select earlier).</li>
            <li>8.2(a)(3) Within any group of teams eliminated in the first and second playoff rounds, draft order is determined by Regular Season standings from worst to best (worst Regular Season finish receives the earlier pick within that group).</li>
            <li>8.2(a)(4) Loser of the 3rd place matchup drafts 9th overall, and the winner drafts 10th. The Runner-Up of the Championship Game receives the second-to-last pick of each round, and the League Champion receives the last pick of each round.</li>
          </ul>
        </li>
      </ul>
    `,
  },
  {
    id: 'standings-playoffs',
    title: '9. Standings, Tiebreakers, & Playoffs',
    html: `
      <p><strong>9.1 - Standings and Seeding Tiebreakers</strong></p>
      <ul>
        <li>9.1(a) For Regular Season standings, playoff qualification, and playoff seeding, ties are broken in the following order:
          <ul>
            <li>(i) Overall Record, then</li>
            <li>(ii) Points For, then</li>
            <li>(iii) Higher Points Against.</li>
          </ul>
        </li>
        <li>9.1(b) If a tie remains after applying Section 9.1(a), the tiebreaker will be determined by a coin toss or by Commissioner-determined custom seeding.</li>
      </ul>
      <p><strong>9.2 - Playoffs</strong></p>
      <ul>
        <li>9.2(a) Playoff Teams: Seven (7).</li>
        <li>9.2(b) Start Week: NFL Week 15.</li>
        <li>9.2(c) Format: Single elimination.</li>
      </ul>
      <p><strong>9.3 - Playoff Qualification and Seeding</strong></p>
      <ul>
        <li>9.3(a) At the conclusion of the Regular Season, the top seven (7) teams in the Regular Season standings qualify for the playoffs.</li>
        <li>9.3(b) Playoff seeds are assigned based on Regular Season standings finish: Seed #1 is the highest-finishing team and Seed #7 is the lowest-finishing qualifying team.</li>
        <li>9.3(c) Regular Season standings for purposes of Sections 9.3(a)–(b) are determined under Section 9.1 (including applicable tiebreakers).</li>
        <li>9.3(d) In a seven (7) team playoff, Seed #1 receives a first-round bye, and the remaining teams advance according to the Sleeper playoff bracket settings.</li>
      </ul>
      <p><strong>9.4 - Toilet Bowl</strong></p>
      <ul>
        <li>9.4(a) Non-playoff teams participate in the Toilet Bowl bracket on Sleeper.</li>
        <li>9.4(b) The Toilet Bowl advances by loser advancement. The Toilet Bowl Final is the final matchup in the loser-advances bracket. The team that loses the Toilet Bowl Final is the league's Toilet Bowl last-place team and is designated by Sleeper as King (Last Place).</li>
        <li>9.4(c) The Toilet Bowl Winner is the winner of the Sleeper matchup labeled 10th Place. The Toilet Bowl Winner receives $20.</li>
        <li>9.4(d) The Toilet Bowl Trophy Obligation Team is the team that loses the Toilet Bowl Final (King (Last Place)). That team must ship the league trophy to the new League Champion.</li>
      </ul>
    `,
  },
  {
    id: 'money-dues-prizes',
    title: '10. Money: Dues, Payouts, Prizes, Awards',
    html: `
      <p><strong>10.1</strong> - Total Due Each Season: $120</p>
      <p><strong>10.2 - Payment Schedule:</strong></p>
      <ul>
        <li>10.2(a) Half Dues are due at the start of the League Year (Super Bowl Sunday).</li>
        <li>10.2(b) The Remaining Balance is due by June 1 of the applicable League Year.</li>
        <li>10.2(c) If, for a given League Year, a team has already provided Dues Credit equal to at least Half Dues prior to that League Year (including as a condition of trading a Draft Pick for that League Year), then the Remaining Balance for that League Year is due at the start of that League Year (Super Bowl Sunday), instead of June 1.</li>
        <li>10.2(d) If an Overpayment is applied as Dues Credit to a future League Year, then the Remaining Balance for that future League Year is due at the start of that League Year (Super Bowl Sunday), instead of June 1.</li>
      </ul>
      <p><strong>10.3 - Prize Payouts:</strong></p>
      <ul>
        <li>1st Place (League Champion): $365</li>
        <li>2nd Place: $180</li>
        <li>3rd Place: $105</li>
        <li>Best Regular Season Record: $150</li>
        <li>Toilet Bowl Winner: $20</li>
        <li>Weekly High Score (14 weeks): $280 ($20/week)</li>
        <li>MVP (Most Points by Single Player): $50</li>
        <li>ROY (Most Points by Rookie Player): $50</li>
        <li>Total Payout: $1200</li>
      </ul>
      <p>10.3(b) MVP & ROY are based on most points scored in the regular season (Weeks 1–14).</p>
      <p><strong>10.4 - Best Power Ranking Award</strong></p>
      <ul>
        <li>10.4(a) The league will award a Best Power Ranking Award each League Year.</li>
        <li>10.4(b) The Best Power Ranking Award includes a $20 prize.</li>
        <li>10.4(c) A power ranking counts toward the Best Power Ranking Award for the League Year in which it is published. A power ranking published during the Offseason counts toward the next League Year.</li>
        <li>10.4(d) The Best Power Ranking Award is determined by league vote. If more than five (5) power rankings are eligible for consideration for a League Year, the Commissioners will select five (5) finalists for the league vote.</li>
      </ul>
    `,
  },
  {
    id: 'competitive-integrity',
    title: '11. Competitive Integrity & Conduct',
    html: `
      <p><strong>11.1</strong> - Managers must submit a Starting Lineup that is In Compliance each week.</p>
      <p><strong>11.2</strong> - Tanking as a team-building strategy is permitted; however, managers must remain In Compliance with all lineup requirements at all times.</p>
    `,
  },
  {
    id: 'enforcement-penalties',
    title: '12. Enforcement & Penalties',
    html: `
      <p><strong>12.1 - Commissioner Enforcement Authority</strong></p>
      <ul>
        <li>12.1(a) The Commissioners have authority to enforce this rulebook and to impose remedies and penalties necessary to restore compliance and preserve league integrity.</li>
        <li>12.1(b) If a specific punishment or remedy is expressly stated elsewhere in the rulebook, that stated punishment/remedy controls. If the rulebook does not specify a punishment/remedy for a violation, the Commissioners will determine the appropriate punishment/remedy in their discretion, consistent with Section 3.4.</li>
      </ul>
      <p><strong>12.2 - Notice and Correction</strong></p>
      <ul>
        <li>12.2(a) If a team is not In Compliance, the Commissioners may notify the team and require corrective action.</li>
        <li>12.2(b) Unless immediate correction is required to preserve league operation or competitive integrity, the team must correct the violation promptly within the timeframe designated by the Commissioners.</li>
        <li>12.2(c) If a violation is not corrected promptly, the Commissioners may take action to restore compliance, including reversing transactions where appropriate and applying penalties.</li>
      </ul>
      <p><strong>12.3 - Remedies and Penalty Tools</strong></p>
      <ul>
        <li>12.3(a) Remedies and penalties may include, without limitation:
          <ul>
            <li>(i) warnings;</li>
            <li>(ii) loss of FAAB;</li>
            <li>(iii) monetary fines;</li>
            <li>(iv) reversal of transactions where appropriate;</li>
            <li>(v) loss of Draft Pick(s);</li>
            <li>(vi) temporary restrictions on trading or other league activity; and</li>
            <li>(vii) any other remedy necessary to restore compliance or preserve competitive integrity.</li>
          </ul>
        </li>
      </ul>
      <p><strong>12.4 - Repeat Violations</strong></p>
      <ul>
        <li>12.4(a) The Commissioners may increase penalties for repeat violations or patterns of noncompliance.</li>
        <li>12.4(b) Where a section of the rulebook contains a tiered penalty schedule (for example, Taxi Squad penalties), that schedule controls.</li>
      </ul>
      <p><strong>12.5 - Last Place Punishment</strong></p>
      <ul>
        <li>12.5(a) The team that finishes in last place at the end of the Regular Season will be required to write and present a Power Ranking on an obscene or humorous topic (to be determined by the Commissioners). This Power Ranking will be presented in person at the following year's draft, unless the team member has a reasonable excuse for non-attendance (including but not limited to medical emergencies, family emergencies, or work obligations that cannot be rescheduled), in which case the presentation may be delivered remotely via video conference or pre-recorded video.</li>
        <li>12.5(b) For purposes of Section 12.5, "last place" means the team with the lowest Regular Season standings finish on Sleeper at the conclusion of the Regular Season.</li>
      </ul>
      <p><strong>12.6 - Presentation Requirements</strong></p>
      <ul>
        <li>12.6(a) The Power Ranking must be in PowerPoint format and must be a minimum of ten (10) minutes in length.</li>
      </ul>
    `,
  },
  {
    id: 'amendments-rule-changes',
    title: '13. Amendments & Rule Changes',
    html: `
      <p><strong>13.1 - Rule Proposals</strong></p>
      <ul>
        <li>13.1(a) Any team may propose a new rule or rule change by submitting a complete rule suggestion through the league website using the designated rule proposal form.</li>
        <li>13.1(b) A rule proposal must be submitted in the required format and include all required fields on the league website to be considered valid.</li>
        <li>13.1(c) A rule proposal is not required to be brought to a league vote unless it receives at least three (3) team endorsements on the league website.</li>
        <li>13.1(c)(1) An endorsement made by the team that proposed the rule will not count towards the three required endorsements.</li>
        <li>13.1(d) Endorsements must be made through the league website's endorsement feature. Endorsements made outside the website do not count toward this threshold.</li>
      </ul>
      <p><strong>13.2 - Bringing a Proposal to a Vote</strong></p>
      <ul>
        <li>13.2(a) Once a proposal receives three (3) valid endorsements, the Commissioners will determine whether the proposal is eligible for a vote.</li>
        <li>13.2(b) If eligible, the Commissioners will open a league vote using a method designated by the Commissioners at an appropriate time.</li>
        <li>13.2(c) The Commissioners may reject proposals that are impossible to administer, or inconsistent with the league's platform limitations.</li>
        <li>13.2(d) Unless otherwise specified in the proposal, any rule proposal that passes becomes effective at the start of the next League Year.</li>
        <li>13.2(e) Competing Amendments to the Same Rule. If two or more proposed rule changes would amend the same Rule and cannot reasonably be adopted together ("Competing Amendments"), the following applies:
          <ul>
            <li>13.2(e)(1) Endorsements. Endorsements are proposal-specific. A proposal must independently satisfy the endorsement requirements to appear on the ballot. An owner may endorse more than one Competing Amendment.</li>
            <li>13.2(e)(2) Voting Threshold. Each Competing Amendment is voted on separately and must independently satisfy the applicable approval threshold (including any supermajority requirement) to be adopted. Owners may vote in favor of more than one Competing Amendment.</li>
            <li>13.2(e)(3) Adoption When Multiple Pass. If more than one Competing Amendment receives the required supermajority, only the Competing Amendment with the highest number of affirmative votes is adopted. All other Competing Amendments fail and have no effect.</li>
            <li>13.2(e)(4) Tie. If two or more Competing Amendments that receive the required supermajority are tied for the highest number of affirmative votes, the League will conduct a runoff vote limited to the tied proposals. The winning proposal must still satisfy a majority requirement.</li>
          </ul>
        </li>
      </ul>
    `,
  },
  {
    id: 'draft-trip',
    title: '14. Draft Trip',
    html: `
      <p><strong>14.1</strong> - The annual Entry Draft will be an in-person event, hosted in rotating locations.</p>
      <p><strong>14.2 - Timing:</strong></p>
      <ul>
        <li>14.2(a) The draft and draft trip will take place on the weekend of Juneteenth each year. If this date is not feasible due to scheduling conflicts or other reasonable circumstances, an alternative weekend may be selected by Majority Vote of the league.</li>
      </ul>
      <p><strong>14.3 - Location Alternates Each Year:</strong></p>
      <ul>
        <li>14.3(a) One year in the East, the next in the West.</li>
        <li>14.3(b) The Mississippi River serves as the dividing line between East and West.</li>
      </ul>
      <p><strong>14.4 - Draft Location Selection</strong></p>
      <ul>
        <li>14.4(a) The draft location for a given League Year's Draft Trip will be selected by league vote at least seventeen (17) months before that Draft Trip. Teams may nominate locations for consideration. Each nominated location must comply with the East/West rotation requirement set forth in Section 14.3.</li>
        <li>14.4(b) The Commissioners will set the voting window and method.</li>
        <li>14.4(c) Unless otherwise specified by the Commissioners, draft location selection is decided by Majority Vote.</li>
      </ul>
      <p><strong>14.5 - Champions' Dinner</strong></p>
      <ul>
        <li>14.5(a) The Friday Champions' Dinner menu/restaurant selection will be chosen by the reigning League Champion.</li>
      </ul>
      <p><strong>14.6 - Trophy Presentation:</strong></p>
      <ul>
        <li>14.6(a) The league trophy and championship rings will be presented to the winner at the draft trip.</li>
      </ul>
    `,
  },
  {
    id: 'scoring',
    title: '15. Scoring',
    html: `
      <p><strong>15.1 - Passing:</strong></p>
      <ul>
        <li>15.1(a) Passing Yards: 1 point per 25 yards (0.04 per yard)</li>
        <li>15.1(b) Passing Touchdowns: 5 points</li>
        <li>15.1(c) 2-Point Conversions (Passing): 2 points</li>
        <li>15.1(d) Interceptions Thrown: -2 points</li>
      </ul>
      <p><strong>15.2 - Rushing:</strong></p>
      <ul>
        <li>15.2(a) Rushing Yards: 1 point per 10 yards (0.10 per yard)</li>
        <li>15.2(b) Rushing Touchdowns: 6 points</li>
        <li>15.2(c) 2-Point Conversions (Rushing): 2 points</li>
      </ul>
      <p><strong>15.3 - Receiving:</strong></p>
      <ul>
        <li>15.3(a) Receptions: 0.5 points per catch (Half-PPR)</li>
        <li>15.3(b) Receiving Yards: 1 point per 10 yards (0.10 per yard)</li>
        <li>15.3(c) Receiving Touchdowns: 6 points</li>
        <li>15.3(d) 2-Point Conversions (Receiving): 2 points</li>
      </ul>
      <p><strong>15.4 - Kicking:</strong></p>
      <ul>
        <li>15.4(a) Field Goals Made (0–49 yards): 3 points</li>
        <li>15.4(b) Field Goals Made (50+ yards): 3 points</li>
        <li>15.4(c) Bonus: +0.1 points per FG yard over 30 yards</li>
        <li>15.4(d) PAT Made: 1 point</li>
        <li>15.4(e) FG Missed (0–49 yards): -1 point</li>
        <li>15.4(f) PAT Missed: -1 point</li>
      </ul>
      <p><strong>15.5 - Defense:</strong></p>
      <ul>
        <li>15.5(a) Defensive Touchdown: 6 points</li>
        <li>15.5(b) Points Allowed:
          <ul>
            <li>15.5(b)(1) 0 Points: 5</li>
            <li>15.5(b)(2) 1–6 Points: 4</li>
            <li>15.5(b)(3) 7–13 Points: 3</li>
            <li>15.5(b)(4) 14–20 Points: 1</li>
            <li>15.5(b)(5) 28–34 Points: -1</li>
            <li>15.5(b)(6) 35+ Points: -4</li>
          </ul>
        </li>
        <li>15.5(c) Yards Allowed:
          <ul>
            <li>15.5(c)(1) &lt;100 Yards: 5</li>
            <li>15.5(c)(2) 100–199 Yards: 3</li>
            <li>15.5(c)(3) 200–299 Yards: 2</li>
            <li>15.5(c)(4) 350–399 Yards: -1</li>
            <li>15.5(c)(5) 400–449 Yards: -3</li>
            <li>15.5(c)(6) 450–499 Yards: -5</li>
            <li>15.5(c)(7) 500–549 Yards: -6</li>
            <li>15.5(c)(8) 550+ Yards: -7</li>
          </ul>
        </li>
        <li>15.5(d) Sacks: 1 point</li>
        <li>15.5(e) Interceptions: 2 points</li>
        <li>15.5(f) Fumble Recoveries: 2 points</li>
        <li>15.5(g) Safeties: 2 points</li>
        <li>15.5(h) Forced Fumbles: 1 point</li>
        <li>15.5(i) Blocked Kicks: 2 points</li>
      </ul>
      <p><strong>15.6 - Special Teams:</strong></p>
      <ul>
        <li>15.6(a) Special Teams Touchdown: 6 points</li>
        <li>15.6(b) Special Teams Forced Fumble: 1 point</li>
        <li>15.6(c) Special Teams Fumble Recovery: 1 point</li>
        <li>15.6(d) Individual ST Player Forced Fumble: 1 point</li>
        <li>15.6(e) Individual ST Player Fumble Recovery: 1 point</li>
      </ul>
      <p><strong>15.7 - Misc:</strong></p>
      <ul>
        <li>15.7(a) Fumble Lost: -2 points</li>
        <li>15.7(b) Fumble Recovery Touchdown: 6 points</li>
      </ul>
    `,
  },
];
