// Authoritative Rules content sourced from the East v. West Rulebook Google Doc
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
      <p><strong>1.1 - Format:</strong> SuperFlex Dynasty League</p>
      <p><strong>1.2 - Scoring:</strong> 0.5 PPR</p>
      <p><strong>1.3 - Platform:</strong> Sleeper</p>
      <p><strong>1.4 - League Year:</strong></p>
      <ul>
        <li>1.4 (a) Begins on Super Bowl Sunday</li>
        <li>1.4 (b) Ends after NFL Week 18</li>
        <li>1.4 (c) Trading resumes on Super Bowl Sunday</li>
      </ul>
    `,
  },
  {
    id: 'roster-lineup',
    title: '2. Roster & Lineup Rules',
    html: `
      <p><strong>2.1 - Total Roster Size:</strong> 17 players</p>
      <p><strong>2.2 - Starting Lineup:</strong></p>
      <ul>
        <li>2.2 (a) 1 Quarterback (QB)</li>
        <li>2.2 (b) 2 Running Backs (RB)</li>
        <li>2.2 (c) 2 Wide Receivers (WR)</li>
        <li>2.2 (d) 1 Tight End (TE)</li>
        <li>2.2 (e) 1 Flex (RB/WR/TE)</li>
        <li>2.2 (f) 1 SuperFlex (QB/RB/WR/TE)</li>
        <li>2.2 (g) 1 Kicker (K)</li>
        <li>2.2 (h) 1 Defense/Special Teams (D/ST)</li>
      </ul>
      <p><strong>2.3 - Bench:</strong> 7 players</p>
      <p><strong>2.4 - Injured Reserve (IR):</strong> 3 spots</p>
      <p><strong>2.5 - Taxi Squad:</strong></p>
      <ul>
        <li>2.5 (a) Maximum 3 players (only 1 QB allowed)</li>
        <li>2.5 (b) Once a player is moved to the active roster, they cannot be placed back on the Taxi Squad</li>
        <li>2.5 (b) (1) Active roster includes the starting lineup, bench, or IR</li>
        <li>2.5 (c) Players can be added to the taxi squad from free agency, trade, or the entry draft</li>
      </ul>
      <p><strong>2.6 - Roster Compliance:</strong></p>
      <ul>
        <li>2.6 (a) All teams must be within roster limits (active, bench, IR, taxi) by the start of the NFL regular season</li>
        <li>2.6 (b) While the Sleeper platform is used for roster management, the obligation for roster compliance lies with the team owner. It is the responsibility of each manager to ensure their team is compliant with the league’s roster rules, including bench, IR, taxi squad, and active roster limits, regardless of what is displayed on Sleeper.</li>
        <li>2.6 (c) All players in the starting lineup must be projected to play. You cannot start someone who has been ruled out 12 hours prior to kickoff</li>
        <li>2.6 (c) (1) They must have a projected score of at least 0.1 pts in Sleeper</li>
        <li>2.6 (c) (2) QBs are an exception to this rule</li>
      </ul>
    `,
  },
  {
    id: 'draft-rookie',
    title: '3. Draft & Rookie Rules',
    html: `
      <p><strong>3.1 - Annual Entry Draft:</strong></p>
      <ul>
        <li>3.1 (a) 4 rounds</li>
        <li>3.1 (b) Includes rookies and all defenses</li>
        <li>3.1 (c) Occurs annually after the NFL Draft</li>
      </ul>
      <p><strong>3.2 - Draft Order:</strong></p>
      <ul>
        <li>3.2 (a) Last place in the regular season receives the 1.01 pick</li>
        <li>3.2 (b) Champion picks 1.12, runner-up picks 1.11, etc.</li>
      </ul>
    `,
  },
  {
    id: 'free-agency-waivers',
    title: '4. Free Agency & Waivers',
    html: `
      <p><strong>4.1 - Waiver Budget (FAAB):</strong> $100 per season</p>
      <p><strong>4.2 - Minimum Bid:</strong> $1</p>
      <p><strong>4.3 - Free Agency Timeline:</strong></p>
      <ul>
        <li>4.3 (a) Closes after the Championship Round</li>
        <li>4.3 (b) Re-opens Monday after NFL preseason week 1 ends. Bids can be placed on that Monday. Bids will process Thursday morning 12:01am PST</li>
      </ul>
    `,
  },
  {
    id: 'trades',
    title: '5. Trades',
    html: `
      <p><strong>5.1 - Trade Deadline:</strong> End of Week 12</p>
      <p><strong>5.2 - Trade Reviews:</strong> Commissioner approval</p>
      <p><strong>5.3 - Future Pick Trading:</strong></p>
      <ul>
        <li>5.3 (a) Only current year and next year picks may be traded</li>
        <li>5.3 (b) To trade future picks (next season), managers must pay half dues for that upcoming season</li>
      </ul>
      <p><strong>5.4 - Trading Opens:</strong> Super Bowl Sunday (start of league year)</p>
    `,
  },
  {
    id: 'playoffs',
    title: '6. Playoffs',
    html: `
      <p><strong>6.1 - Playoff Teams:</strong> 8</p>
      <p><strong>6.2 - Start Week:</strong> NFL Week 15</p>
      <p><strong>6.3 - Format:</strong> Single elimination</p>
      <p><strong>6.4 - Toilet Bowl:</strong></p>
      <ul>
        <li>6.4 (a) Non-playoff teams compete in a Toilet Bowl bracket</li>
        <li>6.4 (b) Winner of the final round (9th/10th place matchup in Sleeper) receives $20</li>
        <li>6.4 (c) Loser of the final round (Toilet Bowl Champion per Sleeper) is responsible for shipping the league trophy to the new champion</li>
      </ul>
    `,
  },
  {
    id: 'conduct',
    title: '7. Conduct & Competitive Integrity',
    html: `
      <p><strong>7.1 - Lineup Requirements:</strong></p>
      <ul>
        <li>7.1 (a) Managers must submit full, legal starting lineups every week</li>
        <li>7.1 (b) Tanking via team-building strategy is allowed</li>
      </ul>
    `,
  },
  {
    id: 'dues-prizes',
    title: '8. League Dues & Prizes',
    html: `
      <p><strong>8.1 - Total Due Each Season:</strong> $120</p>
      <p><strong>8.2 - Payment Schedule:</strong></p>
      <ul>
        <li>8.2 (a) Half due at the start of the league year (Super Bowl Sunday)</li>
        <li>8.2 (b) Remaining half due by June 1st</li>
        <li>8.2 (c) If half of league dues have been paid for due to trading a pick then remaining half is due at the start of the league year</li>
        <li>8.2 (d) If overpayment is applied to next league year remaining balance must be paid at league year start</li>
      </ul>
      <p><strong>8.3 - Prize Payouts:</strong></p>
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
        <li>8.3 (a) MVP & ROY are based on most points scored in the regular season (Weeks 1–14).</li>
      </ul>
    `,
  },
  {
    id: 'draft-trip',
    title: '9. League Draft Trip',
    html: `
      <p><strong>9.1 - The annual Entry Draft</strong> will be an in-person event, hosted in rotating locations.</p>
      <p><strong>9.2 - Timing:</strong></p>
      <ul>
        <li>9.2 (a) The draft and draft trip will take place on the weekend of Juneteenth each year (or as close to it as possible).</li>
      </ul>
      <p><strong>9.3 - Location Alternates Each Year:</strong></p>
      <ul>
        <li>9.3 (a) One year in the East, the next in the West.</li>
        <li>9.3 (b) The Mississippi River serves as the dividing line between East and West.</li>
      </ul>
      <p><strong>9.4 - Location Selection:</strong></p>
      <ul>
        <li>9.4 (a) The following year’s draft location will be voted on during the current year’s draft trip.</li>
      </ul>
      <p><strong>9.5 - Trophy Presentation:</strong></p>
      <ul>
        <li>9.5 (a) The league trophy and championship rings will be presented to the winner at the draft trip.</li>
      </ul>
    `,
  },
  {
    id: 'punishments',
    title: '10. League Punishments',
    html: `
      <p><strong>10.1 - Last Place Punishment:</strong></p>
      <ul>
        <li>10.1 (a) The team that finishes in last place at the end of the regular season will be required to write and present a Power Ranking on an obscene or humorous topic (to be determined by the commissioners). This Power Ranking will be presented in person at the following year’s draft, for the amusement and entertainment of the league.</li>
      </ul>
      <p><strong>10.2 - Presentation Requirements:</strong></p>
      <ul>
        <li>10.2 (a) The power ranking must be in PowerPoint format and must be a minimum of 10 minutes in time.</li>
      </ul>
    `,
  },
  {
    id: 'rule-changes',
    title: '11. Rule Changes',
    html: `
      <p><strong>11.1 - Majority Vote:</strong></p>
      <ul>
        <li>11.1 (a) A vote of 7 teams will be required for a majority decision on league matters.</li>
      </ul>
      <p><strong>11.2 - Supermajority Vote:</strong></p>
      <ul>
        <li>11.2 (a) A vote of 9 teams will be required for a supermajority decision on league matters, such as rule changes or other significant decisions.</li>
      </ul>
      <p><strong>11.3 - In Season Rule Changes:</strong></p>
      <ul>
        <li>11.3 (a) Rule changes will not be considered for in-season implementation unless both commissioners consider it warranted</li>
      </ul>
    `,
  },
  {
    id: 'best-power-ranking',
    title: '12. Best Power Ranking Award',
    html: `
      <p><strong>12.1 - Award:</strong></p>
      <ul>
        <li>12.1 (a) A league award will be introduced for the Best Power Ranking during the season (from draft to draft). The Best Power Ranking will be judged on creativity, humor, and how well the rankings are presented</li>
        <li>12.1 (b) The award will be voted on by the league</li>
      </ul>
    `,
  },
  {
    id: 'scoring',
    title: '13. Scoring',
    html: `
      <p><strong>13.1 - Passing:</strong></p>
      <ul>
        <li>13.1 (a) Passing Yards: 1 point per 25 yards (0.04 per yard)</li>
        <li>13.1 (b) Passing Touchdowns: 5 points</li>
        <li>13.1 (c) 2-Point Conversions (Passing): 2 points</li>
        <li>13.1 (d) Interceptions Thrown: -2 points</li>
      </ul>
      <p><strong>13.2 - Rushing:</strong></p>
      <ul>
        <li>13.2 (a) Rushing Yards: 1 point per 10 yards (0.10 per yard)</li>
        <li>13.2 (b) Rushing Touchdowns: 6 points</li>
        <li>13.2 (c) 2-Point Conversions (Rushing): 2 points</li>
      </ul>
      <p><strong>13.3 - Receiving:</strong></p>
      <ul>
        <li>13.3 (a) Receptions: 0.5 points per catch (Half-PPR)</li>
        <li>13.3 (b) Receiving Yards: 1 point per 10 yards (0.10 per yard)</li>
        <li>13.3 (c) Receiving Touchdowns: 6 points</li>
        <li>13.3 (d) 2-Point Conversions (Receiving): 2 points</li>
      </ul>
      <p><strong>13.4 - Kicking:</strong></p>
      <ul>
        <li>13.4 (a) Field Goals Made (0–49 yards): 3 points</li>
        <li>13.4 (b) Field Goals Made (50+ yards): 3 points</li>
        <li>13.4 (c) Bonus: +0.1 points per FG yard over 30 yards</li>
        <li>13.4 (d) PAT Made: 1 point</li>
        <li>13.4 (e) FG Missed (0–49 yards): -1 point</li>
        <li>13.4 (f) PAT Missed: -1 point</li>
      </ul>
      <p><strong>13.5 - Defense:</strong></p>
      <ul>
        <li>13.5 (a) Defensive Touchdown: 6 points</li>
        <li>13.5 (b) Points Allowed:</li>
        <li>(b)(1) 0 Points: 5</li>
        <li>(b)(2) 1–6 Points: 4</li>
        <li>(b)(3) 7–13 Points: 3</li>
        <li>(b)(4) 14–20 Points: 1</li>
        <li>(b)(5) 28–34 Points: -1</li>
        <li>(b)(6) 35+ Points: -4</li>
        <li>13.5 (c) Yards Allowed:</li>
        <li>(c)(1) &lt;100 Yards: 5</li>
        <li>(c)(2) 100–199 Yards: 3</li>
        <li>(c)(3) 200–299 Yards: 2</li>
        <li>(c)(4) 350–399 Yards: -1</li>
        <li>(c)(5) 400–449 Yards: -3</li>
        <li>(c)(6) 450–499 Yards: -5</li>
        <li>(c)(7) 500–549 Yards: -6</li>
        <li>(c)(8) 550+ Yards: -7</li>
        <li>13.5 (d) Sacks: 1 point</li>
        <li>13.5 (e) Interceptions: 2 points</li>
        <li>13.5 (f) Fumble Recoveries: 2 points</li>
        <li>13.5 (g) Safeties: 2 points</li>
        <li>13.5 (h) Forced Fumbles: 1 point</li>
        <li>13.5 (i) Blocked Kicks: 2 points</li>
      </ul>
      <p><strong>13.6 - Special Teams:</strong></p>
      <ul>
        <li>13.6 (a) Special Teams Touchdown: 6 points</li>
        <li>13.6 (b) Special Teams Forced Fumble: 1 point</li>
        <li>13.6 (c) Special Teams Fumble Recovery: 1 point</li>
        <li>13.6 (d) Individual ST Player Forced Fumble: 1 point</li>
        <li>13.6 (e) Individual ST Player Fumble Recovery: 1 point</li>
      </ul>
      <p><strong>13.7 - Misc:</strong></p>
      <ul>
        <li>13.7 (a) Fumble Lost: -2 points</li>
        <li>13.7 (b) Fumble Recovery Touchdown: 6 points</li>
      </ul>
    `,
  },
];
