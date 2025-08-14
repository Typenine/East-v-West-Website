'use client';

import { useState } from 'react';
import { Disclosure } from '@headlessui/react';

// Define the rule section type
type RuleSection = {
  id: string;
  title: string;
  content: string | React.ReactNode;
  subsections?: RuleSection[];
};

export default function RulesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  
  // Define the rules content
  const ruleSections: RuleSection[] = [
    {
      id: 'league-overview',
      title: '1. League Overview',
      content: (
        <div className="space-y-2">
          <p><strong>1.1 - Format:</strong> SuperFlex Dynasty League</p>
          <p><strong>1.2 - Scoring:</strong> 0.5 PPR</p>
          <p><strong>1.3 - Platform:</strong> Sleeper</p>
          <p><strong>1.4 - League Year:</strong></p>
          <ul className="list-disc pl-6">
            <li>1.4 (a) Begins on Super Bowl Sunday</li>
            <li>1.4 (b) Ends after NFL Week 18</li>
            <li>1.4 (c) Trading resumes on Super Bowl Sunday</li>
          </ul>
        </div>
      )
    },
    {
      id: 'roster-lineup',
      title: '2. Roster & Lineup Rules',
      content: (
        <div className="space-y-2">
          <p><strong>2.1 - Roster Size:</strong> 30 total roster spots</p>
          <p><strong>2.2 - Starting Lineup:</strong></p>
          <ul className="list-disc pl-6">
            <li>1 QB</li>
            <li>2 RB</li>
            <li>2 WR</li>
            <li>1 TE</li>
            <li>2 FLEX (RB/WR/TE)</li>
            <li>1 SuperFlex (QB/RB/WR/TE)</li>
            <li>1 DEF</li>
          </ul>
          <p><strong>2.3 - Taxi Squad:</strong> 5 spots for rookies only, must be designated before Week 1</p>
          <p><strong>2.4 - IR Spots:</strong> 2 spots for players with official IR designation</p>
        </div>
      )
    },
    {
      id: 'scoring',
      title: '3. Scoring System',
      content: (
        <div className="space-y-2">
          <p><strong>3.1 - Passing:</strong></p>
          <ul className="list-disc pl-6">
            <li>0.04 points per passing yard</li>
            <li>4 points per passing TD</li>
            <li>-2 points per interception</li>
          </ul>
          <p><strong>3.2 - Rushing:</strong></p>
          <ul className="list-disc pl-6">
            <li>0.1 points per rushing yard</li>
            <li>6 points per rushing TD</li>
          </ul>
          <p><strong>3.3 - Receiving:</strong></p>
          <ul className="list-disc pl-6">
            <li>0.5 points per reception</li>
            <li>0.1 points per receiving yard</li>
            <li>6 points per receiving TD</li>
          </ul>
          <p><strong>3.4 - Miscellaneous:</strong></p>
          <ul className="list-disc pl-6">
            <li>-2 points per fumble lost</li>
            <li>2 points per 2-point conversion</li>
          </ul>
          <p><strong>3.5 - Defense:</strong> Standard Sleeper DST scoring</p>
        </div>
      )
    },
    {
      id: 'draft',
      title: '4. Draft Rules',
      content: (
        <div className="space-y-2">
          <p><strong>4.1 - Rookie Draft:</strong></p>
          <ul className="list-disc pl-6">
            <li>4.1 (a) Annual rookie draft held in July</li>
            <li>4.1 (b) 4 rounds, snake format</li>
            <li>4.1 (c) Draft order determined by reverse order of standings for non-playoff teams</li>
            <li>4.1 (d) Playoff teams ordered by reverse of playoff finish</li>
          </ul>
          <p><strong>4.2 - Draft Pick Trading:</strong></p>
          <ul className="list-disc pl-6">
            <li>4.2 (a) Future picks up to 3 years ahead may be traded</li>
            <li>4.2 (b) All traded picks must be tracked by commissioner</li>
          </ul>
        </div>
      )
    },
    {
      id: 'trading',
      title: '5. Trading Rules',
      content: (
        <div className="space-y-2">
          <p><strong>5.1 - Trade Deadline:</strong> End of NFL Week 12</p>
          <p><strong>5.2 - Trade Review:</strong> No commissioner review unless collusion suspected</p>
          <p><strong>5.3 - Trade Processing:</strong> Immediate upon acceptance</p>
          <p><strong>5.4 - Future Considerations:</strong> Not allowed outside of the Sleeper platform</p>
        </div>
      )
    },
    {
      id: 'waivers',
      title: '6. Waivers & Free Agency',
      content: (
        <div className="space-y-2">
          <p><strong>6.1 - Waiver System:</strong> FAAB (Free Agent Acquisition Budget)</p>
          <p><strong>6.2 - FAAB Budget:</strong> $100 for the season</p>
          <p><strong>6.3 - Waiver Processing:</strong> Wednesdays at 12:00 AM ET</p>
          <p><strong>6.4 - Free Agency:</strong> First come, first served after waiver processing</p>
        </div>
      )
    },
    {
      id: 'playoffs',
      title: '7. Playoffs',
      content: (
        <div className="space-y-2">
          <p><strong>7.1 - Playoff Teams:</strong> 6 teams qualify</p>
          <p><strong>7.2 - Playoff Schedule:</strong></p>
          <ul className="list-disc pl-6">
            <li>7.2 (a) Weeks 15-17 of the NFL season</li>
            <li>7.2 (b) Top 2 seeds receive first-round byes</li>
          </ul>
          <p><strong>7.3 - Seeding:</strong></p>
          <ul className="list-disc pl-6">
            <li>7.3 (a) Based on regular season record</li>
            <li>7.3 (b) Tiebreakers: Total points scored, head-to-head, division record (if applicable)</li>
          </ul>
          <p><strong>7.4 - Consolation Bracket:</strong></p>
          <ul className="list-disc pl-6">
            <li>7.4 (a) Non-playoff teams compete in consolation bracket</li>
            <li>7.4 (b) Winner receives first pick in rookie draft (if finished last in standings)</li>
          </ul>
        </div>
      )
    },
    {
      id: 'fees',
      title: '8. League Fees & Payouts',
      content: (
        <div className="space-y-2">
          <p><strong>8.1 - Annual Fee:</strong> $50 per team</p>
          <p><strong>8.2 - Payment Deadline:</strong> Two weeks before the rookie draft</p>
          <p><strong>8.3 - Payouts:</strong></p>
          <ul className="list-disc pl-6">
            <li>8.3 (a) 1st Place: $350</li>
            <li>8.3 (b) 2nd Place: $150</li>
            <li>8.3 (c) 3rd Place: $50</li>
            <li>8.3 (d) Regular Season Points Leader: $50</li>
          </ul>
        </div>
      )
    },
    {
      id: 'tanking',
      title: '9. Anti-Tanking Measures',
      content: (
        <div className="space-y-2">
          <p><strong>9.1 - Lineup Requirements:</strong> All teams must field a complete and competitive lineup each week</p>
          <p><strong>9.2 - Penalties:</strong></p>
          <ul className="list-disc pl-6">
            <li>9.2 (a) First offense: Warning</li>
            <li>9.2 (b) Second offense: Loss of 3rd round pick</li>
            <li>9.2 (c) Third offense: Removal from league without refund</li>
          </ul>
        </div>
      )
    },
    {
      id: 'communication',
      title: '10. League Communication',
      content: (
        <div className="space-y-2">
          <p><strong>10.1 - Official Platform:</strong> Sleeper app chat</p>
          <p><strong>10.2 - Discord:</strong> Secondary communication platform for voice chats during draft</p>
          <p><strong>10.3 - Trade Block:</strong> Use Sleeper trade block feature to indicate available players</p>
        </div>
      )
    },
    {
      id: 'faq',
      title: '11. Frequently Asked Questions',
      content: (
        <div className="space-y-4">
          <Disclosure>
            {({ open }) => (
              <>
                <Disclosure.Button className="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-blue-900 bg-blue-100 rounded-lg hover:bg-blue-200 focus:outline-none focus-visible:ring focus-visible:ring-blue-500 focus-visible:ring-opacity-75">
                  <span>What happens if a team owner leaves the league?</span>
                  <svg
                    className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-blue-500`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Disclosure.Button>
                <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-gray-700">
                  If an owner leaves, we will find a replacement owner. The new owner will inherit the entire team roster and draft picks. There is no dispersal draft unless more than 3 owners leave in the same offseason.
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
          
          <Disclosure>
            {({ open }) => (
              <>
                <Disclosure.Button className="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-blue-900 bg-blue-100 rounded-lg hover:bg-blue-200 focus:outline-none focus-visible:ring focus-visible:ring-blue-500 focus-visible:ring-opacity-75">
                  <span>Can I trade FAAB dollars?</span>
                  <svg
                    className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-blue-500`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Disclosure.Button>
                <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-gray-700">
                  Yes, FAAB dollars can be included in trades. The minimum FAAB that can be traded is $1, and you cannot trade more FAAB than you currently have.
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
          
          <Disclosure>
            {({ open }) => (
              <>
                <Disclosure.Button className="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-blue-900 bg-blue-100 rounded-lg hover:bg-blue-200 focus:outline-none focus-visible:ring focus-visible:ring-blue-500 focus-visible:ring-opacity-75">
                  <span>How are rule changes handled?</span>
                  <svg
                    className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-blue-500`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Disclosure.Button>
                <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-gray-700">
                  Rule changes require a league vote with a 2/3 majority to pass. Voting on rule changes occurs during the offseason only, typically in February after the Super Bowl.
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
          
          <Disclosure>
            {({ open }) => (
              <>
                <Disclosure.Button className="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-blue-900 bg-blue-100 rounded-lg hover:bg-blue-200 focus:outline-none focus-visible:ring focus-visible:ring-blue-500 focus-visible:ring-opacity-75">
                  <span>What happens in the event of a tie?</span>
                  <svg
                    className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-blue-500`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Disclosure.Button>
                <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-gray-700">
                  Regular season games can end in ties. For playoff games, the tiebreaker is the higher seed advances. This rewards regular season performance.
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
          
          <Disclosure>
            {({ open }) => (
              <>
                <Disclosure.Button className="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-blue-900 bg-blue-100 rounded-lg hover:bg-blue-200 focus:outline-none focus-visible:ring focus-visible:ring-blue-500 focus-visible:ring-opacity-75">
                  <span>Can I trade players on IR?</span>
                  <svg
                    className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-blue-500`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </Disclosure.Button>
                <Disclosure.Panel className="px-4 pt-4 pb-2 text-sm text-gray-700">
                  Yes, players on IR can be traded. The receiving team must have an available IR spot or make room on their active roster to accommodate the player.
                </Disclosure.Panel>
              </>
            )}
          </Disclosure>
        </div>
      )
    }
  ];
  
  // Filter rules based on search query
  const filteredSections = searchQuery
    ? ruleSections.filter(section => 
        section.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (typeof section.content === 'string' && section.content.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : ruleSections;
  
  // Handle clicking on a TOC item
  const handleTOCClick = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">League Rules</h1>
      
      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-8">
        {/* Table of Contents */}
        <div className="md:w-1/4">
          <div className="bg-gray-100 p-4 rounded-lg sticky top-4">
            <h2 className="font-bold text-lg mb-4">Table of Contents</h2>
            <nav className="space-y-1">
              {ruleSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleTOCClick(section.id)}
                  className={`block w-full text-left px-3 py-2 text-sm rounded-md ${
                    activeSection === section.id
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>
          </div>
        </div>
        
        {/* Rules Content */}
        <div className="md:w-3/4">
          {filteredSections.length > 0 ? (
            <div className="space-y-8">
              {filteredSections.map((section) => (
                <div key={section.id} id={section.id} className="scroll-mt-4">
                  <Disclosure defaultOpen={true}>
                    {({ open }) => (
                      <>
                        <Disclosure.Button className="flex justify-between w-full px-4 py-3 text-lg font-medium text-left text-gray-900 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus-visible:ring focus-visible:ring-gray-500 focus-visible:ring-opacity-75">
                          <span>{section.title}</span>
                          {open ? (
                            <svg
                              className="w-5 h-5 text-gray-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                fillRule="evenodd"
                                d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-5 h-5 text-gray-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </Disclosure.Button>
                        <Disclosure.Panel className="px-4 pt-4 pb-2 text-gray-700">
                          {section.content}
                        </Disclosure.Panel>
                      </>
                    )}
                  </Disclosure>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No rules found matching your search.</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Clear Search
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
