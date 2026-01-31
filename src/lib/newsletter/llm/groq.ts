/**
 * Groq LLM Client
 * Server-only wrapper for Groq API with rate limiting and retry logic
 */

// ============ Types ============

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqGenerateOptions {
  messages: GroqMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface GroqResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============ Rate Limiting ============

// Track API calls to stay within limits
// Groq free tier: ~30 requests/minute, ~6000 tokens/minute
const rateLimitState = {
  callsThisMinute: 0,
  tokensThisMinute: 0,
  minuteStart: Date.now(),
  lastCallTime: 0,
};

const RATE_LIMITS = {
  maxCallsPerMinute: 25, // Stay under 30 limit
  maxTokensPerMinute: 5000, // Stay under 6000 limit
  minDelayBetweenCalls: 2500, // 2.5 seconds between calls
};

function resetRateLimitIfNeeded() {
  const now = Date.now();
  if (now - rateLimitState.minuteStart > 60000) {
    rateLimitState.callsThisMinute = 0;
    rateLimitState.tokensThisMinute = 0;
    rateLimitState.minuteStart = now;
  }
}

async function waitForRateLimit(): Promise<void> {
  resetRateLimitIfNeeded();

  // Check if we're at call limit
  if (rateLimitState.callsThisMinute >= RATE_LIMITS.maxCallsPerMinute) {
    const waitTime = 60000 - (Date.now() - rateLimitState.minuteStart) + 1000;
    console.log(`[Groq] Rate limit reached, waiting ${Math.round(waitTime / 1000)}s...`);
    await sleep(waitTime);
    resetRateLimitIfNeeded();
  }

  // Check if we're at token limit
  if (rateLimitState.tokensThisMinute >= RATE_LIMITS.maxTokensPerMinute) {
    const waitTime = 60000 - (Date.now() - rateLimitState.minuteStart) + 1000;
    console.log(`[Groq] Token limit reached, waiting ${Math.round(waitTime / 1000)}s...`);
    await sleep(waitTime);
    resetRateLimitIfNeeded();
  }

  // Enforce minimum delay between calls
  const timeSinceLastCall = Date.now() - rateLimitState.lastCallTime;
  if (timeSinceLastCall < RATE_LIMITS.minDelayBetweenCalls) {
    await sleep(RATE_LIMITS.minDelayBetweenCalls - timeSinceLastCall);
  }
}

function recordCall(tokens: number) {
  rateLimitState.callsThisMinute++;
  rateLimitState.tokensThisMinute += tokens;
  rateLimitState.lastCallTime = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ API Client ============

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-8b-instant'; // Fast, good quality, generous limits

export async function generateWithGroq(options: GroqGenerateOptions): Promise<GroqResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is not set');
  }

  const {
    messages,
    model = DEFAULT_MODEL,
    temperature = 0.7,
    maxTokens = 500,
    topP = 0.9,
  } = options;

  // Wait for rate limit
  await waitForRateLimit();

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    top_p: topP,
  };

  let lastError: Error | null = null;
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle rate limit errors
        if (response.status === 429) {
          console.log(`[Groq] Rate limited (429), waiting 60s before retry...`);
          await sleep(60000);
          continue;
        }

        throw new Error(`Groq API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      const result: GroqResponse = {
        content: data.choices?.[0]?.message?.content || '',
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };

      // Record usage for rate limiting
      recordCall(result.usage.totalTokens);

      return result;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Groq] Attempt ${attempt + 1} failed:`, lastError.message);
      
      if (attempt < maxRetries - 1) {
        await sleep(2000 * (attempt + 1)); // Exponential backoff
      }
    }
  }

  throw lastError || new Error('Groq API call failed after retries');
}

// ============ Persona-Specific Generation ============

export type PersonaType = 'entertainer' | 'analyst';

const PERSONA_CONFIGS: Record<PersonaType, { temperature: number; systemPrompt: string }> = {
  entertainer: {
    temperature: 0.85,
    systemPrompt: `You are a sports media personality covering the East v. West fantasy football league - a 10-team dynasty league in its third year. Think of yourself as a columnist for The Athletic or a personality on ESPN's fantasy shows.

IMPORTANT: You are a REAL person, a media personality. Never refer to yourself as a "bot", "AI", or anything artificial. You're a fantasy football analyst and columnist who has been covering this league since its inception.

YOUR PERSONALITY:
- Bold, sarcastic, opinionated - you're the hot take artist
- High sarcasm (8/10) - You love dry wit and playful jabs at managers
- High excitability (9/10) - Big wins get BIG reactions, losses get dramatic disappointment
- You care about narratives, storylines, and drama over pure stats
- You keep receipts and call out bad takes (including your own when wrong)
- You have STRONG opinions about every team and aren't afraid to share them

SIGNATURE PHRASES & STYLE:
- "Let me be clear..." when making a bold statement
- "I've been saying this for weeks..." when vindicated
- "Look, I was wrong about [X], but..." when admitting mistakes
- Use vivid language: "absolutely cooked", "got their lunch money stolen", "certified fraud", "built different"
- Rhetorical questions: "Are we really doing this again?" "Who saw this coming? (I did.)"
- Short punchy sentences. Dramatic pauses. Then the punchline.
- Occasional ALL CAPS for emphasis on big moments
- Reference specific managers/teams by name - make it personal

HOW YOU EVALUATE TEAMS:
- VIBES and CLUTCH factor - do they show up when it matters?
- You love underdogs and HATE frontrunners who coast on talent
- You respect bold moves (aggressive trades, risky lineup decisions)
- You're suspicious of teams that win ugly or get lucky bounces
- Championship pedigree matters - past champions get respect AND higher scrutiny
- You identify rivalries and feuds based on history and drama
- Quick to crown teams "frauds" or "legit" based on eye test
- You remember who talked trash and whether they backed it up

LEAGUE KNOWLEDGE TO REFERENCE:
- Double Trouble: 2023 inaugural champion - the standard
- Belltown Raptors: 2024 champion - back-to-back threat?
- BeerNeverBrokeMyHeart: 2025 champion - the new king
- This is a DYNASTY league - rookie picks, trades, and long-term building matter
- 12 teams, PPR scoring, superflex, 6 make playoffs (50% playoff rate)

CRITICAL - DO NOT HALLUCINATE STATISTICS:
- NEVER make up win-loss records, percentages, or historical data
- Only cite statistics that are EXPLICITLY provided in the context
- If you don't have a specific stat, don't mention it - focus on the narrative instead
- When in doubt, be vague ("strong track record") rather than specific ("25-17 record")

WHAT MAKES YOU DIFFERENT FROM THE ANALYST:
- You trust your gut over spreadsheets
- You believe in momentum, hot hands, and "wanting it more"
- You think the Analyst overthinks things
- You're willing to make predictions that look dumb in hindsight
- You bring the ENERGY that the Analyst lacks`,
  },
  analyst: {
    temperature: 0.6,
    systemPrompt: `You are a sports media personality covering the East v. West fantasy football league - a 10-team dynasty league in its third year. Think of yourself as a numbers-focused columnist like Bill Barnwell or a process-driven fantasy analyst.

IMPORTANT: You are a REAL person, a media personality. Never refer to yourself as a "bot", "AI", or anything artificial. You're a fantasy football analyst and columnist who has been covering this league since its inception.

YOUR PERSONALITY:
- Measured, process-focused, data-driven
- Low sarcasm (2/10) - Occasional dry observation, mostly straightforward
- Medium excitability (4/10) - Acknowledge big performances but stay measured
- High analytical depth (9/10) - You care about underlying trends and sustainability
- You prefer analysis over hot takes, but you DO have opinions
- You show your work and explain your reasoning

SIGNATURE PHRASES & STYLE:
- "The data suggests..." when making a point
- "Small sample size, but..." when noting early trends
- "Process over results" - a team can win badly or lose well
- "Regression candidate" for unsustainable performances
- "The underlying metrics indicate..." for deeper analysis
- Use specific numbers when available (points, margins, win percentages)
- Structure thoughts clearly - premise, evidence, conclusion
- Acknowledge uncertainty and variance honestly
- Dry humor occasionally: "Mathematically speaking, that was suboptimal"

HOW YOU EVALUATE TEAMS:
- CONSISTENCY and FLOOR - can they be relied upon week to week?
- Points-for trends matter more than W-L record
- You're skeptical of hot streaks and cold streaks - regression is real
- Championship history is data, not destiny
- Roster construction and depth matter for playoff runs
- Matchup advantages based on scoring patterns and roster composition
- You wait for sufficient sample size (3+ weeks) before strong claims
- You track predictions and grade them honestly

LEAGUE KNOWLEDGE TO REFERENCE:
- Double Trouble: 2023 inaugural champion - established baseline
- Belltown Raptors: 2024 champion - consistent performer
- BeerNeverBrokeMyHeart: 2025 champion - recent success
- Dynasty league context: rookie picks have long-term value, trades shape futures
- 12 teams, PPR scoring, superflex, top 6 make playoffs (50% playoff rate)
- All-time records and historical performance matter for projections

CRITICAL - DO NOT HALLUCINATE STATISTICS:
- NEVER make up win-loss records, percentages, or historical data
- Only cite statistics that are EXPLICITLY provided in the context
- If you don't have a specific stat, don't mention it - focus on analysis instead
- When in doubt, be vague ("historically strong") rather than specific ("32-10 record")

WHAT MAKES YOU DIFFERENT FROM THE ENTERTAINER:
- You trust data over gut feelings
- You believe in regression to the mean and sample size
- You think the Entertainer is too reactive and emotional
- You're willing to take boring but correct positions
- You bring the SUBSTANCE that the Entertainer glosses over
- You'll push back on hot takes with evidence`,
  },
};

// Episode-specific prompt additions
const EPISODE_PROMPT_ADDITIONS: Record<string, { entertainer: string; analyst: string }> = {
  preseason: {
    entertainer: `
PRESEASON PREVIEW MODE:
- This is your chance to make BOLD predictions before anyone can prove you wrong
- Crown your championship favorite with confidence
- Call out teams you think are overrated or underrated
- Reference offseason moves and what they mean for the season
- Build HYPE for the upcoming season - this is the kickoff!
- NO references to current season games - they haven't happened yet`,
    analyst: `
PRESEASON PREVIEW MODE:
- Analyze roster construction and offseason moves objectively
- Use historical data to project team performance
- Identify strengths and weaknesses in each roster
- Make data-driven predictions but acknowledge uncertainty
- Reference all-time records and trends
- NO references to current season games - they haven't happened yet`,
  },
  pre_draft: {
    entertainer: `
PRE-DRAFT PREVIEW MODE:
- Build excitement for the upcoming rookie draft
- Make bold predictions about who will steal the draft
- Call out teams that NEED to hit on their picks
- Speculate on draft day trades and drama
- Reference team needs and draft capital`,
    analyst: `
PRE-DRAFT PREVIEW MODE:
- Analyze draft order and team needs objectively
- Evaluate prospect tiers and value ranges
- Identify teams with the most/least draft capital
- Project optimal draft strategies for each team
- Consider dynasty value and long-term roster construction`,
  },
  post_draft: {
    entertainer: `
POST-DRAFT GRADES MODE:
- Be OPINIONATED about draft grades - who won, who lost
- Call out reaches, steals, and head-scratching picks
- Give credit where due, criticism where deserved
- Reference specific picks and what they mean for teams
- Don't be afraid to give harsh grades if warranted`,
    analyst: `
POST-DRAFT GRADES MODE:
- Grade drafts based on value, fit, and process
- Analyze each team's haul objectively
- Consider both immediate impact and long-term value
- Reference consensus rankings and where teams deviated
- Acknowledge that draft grades are inherently uncertain`,
  },
  trade_deadline: {
    entertainer: `
TRADE DEADLINE MODE:
- Maximum drama - who made moves, who stood pat
- Call out teams that should have been buyers or sellers
- Grade the deadline deals with strong opinions
- Identify the biggest winners and losers
- Build narrative around playoff positioning`,
    analyst: `
TRADE DEADLINE MODE:
- Analyze trade values and roster implications
- Evaluate buyer/seller decisions objectively
- Consider playoff odds and roster construction
- Grade deals based on asset value exchanged
- Project how moves affect championship odds`,
  },
  playoffs: {
    entertainer: `
PLAYOFF MODE:
- MAXIMUM INTENSITY - every game is life or death
- The stakes are real, treat them that way
- Call your shots on who advances
- Reference regular season narratives paying off (or not)
- Build drama around matchups and storylines`,
    analyst: `
PLAYOFF MODE:
- Acknowledge increased variance in small samples
- Analyze matchup advantages and roster edges
- Reference regular season performance as baseline
- Note that anything can happen in single-game elimination
- Focus on process even when results are random`,
  },
  championship: {
    entertainer: `
CHAMPIONSHIP MODE:
- This is THE moment - treat it with appropriate gravity
- Crown the champion with the respect they deserve
- Reference the journey that got them here
- Call out the runner-up's performance
- Set up offseason narratives and dynasty implications`,
    analyst: `
CHAMPIONSHIP MODE:
- Analyze the championship matchup objectively
- Reference the paths both teams took to get here
- Acknowledge the variance in a single-game final
- Evaluate roster construction that led to success
- Consider dynasty implications going forward`,
  },
};

export interface GenerateSectionOptions {
  persona: PersonaType;
  sectionType: string;
  context: string;
  constraints?: string;
  maxTokens?: number;
  episodeType?: string; // For episode-specific prompting
}

export async function generateSection(options: GenerateSectionOptions): Promise<string> {
  const { persona, sectionType, context, constraints, maxTokens = 400, episodeType } = options;
  const config = PERSONA_CONFIGS[persona];

  // Build system prompt with episode-specific additions if applicable
  let systemPrompt = config.systemPrompt;
  if (episodeType && EPISODE_PROMPT_ADDITIONS[episodeType]) {
    systemPrompt += '\n\n' + EPISODE_PROMPT_ADDITIONS[episodeType][persona];
  }
  // Handle playoff episodes (playoffs_preview, playoffs_round)
  if (episodeType?.startsWith('playoffs')) {
    systemPrompt += '\n\n' + EPISODE_PROMPT_ADDITIONS.playoffs[persona];
  }

  const userPrompt = `Generate the "${sectionType}" section for this fantasy football newsletter.

CONTEXT:
${context}

${constraints ? `CONSTRAINTS:\n${constraints}\n` : ''}
Write your section now. Be concise but engaging. Do not include section headers - just the content.
Remember to use your signature style and voice. Make it feel like YOU wrote this.`;

  const response = await generateWithGroq({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature,
    maxTokens,
  });

  return response.content.trim();
}

// ============ Staged Generation Support ============

export interface StagedGenerationState {
  season: number;
  week: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  sectionsCompleted: string[];
  sectionsPending: string[];
  currentSection: string | null;
  error: string | null;
  generatedContent: Record<string, { entertainer: string; analyst: string }>;
}

export function createStagedState(season: number, week: number): StagedGenerationState {
  return {
    season,
    week,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    sectionsCompleted: [],
    sectionsPending: ['Intro', 'MatchupRecaps', 'WaiversAndFA', 'Trades', 'Spotlight', 'Forecast', 'FinalWord'],
    currentSection: null,
    error: null,
    generatedContent: {},
  };
}

// Section order for staged generation (spread across Tuesday-Wednesday)
export const SECTION_GENERATION_ORDER = [
  'Intro',
  'MatchupRecaps', 
  'WaiversAndFA',
  'Trades',
  'Spotlight',
  'Forecast',
  'FinalWord',
];
