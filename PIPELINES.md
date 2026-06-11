# Newsletter Generation Pipelines

How a newsletter goes from Sleeper data to published HTML, and where to look
when it doesn't.

## Step-based (staged) generation

Generation is split into one-section-per-request steps so every request stays
under Vercel's 300s function limit.

```
1. POST /api/newsletter        { mode: 'start', season, week, ... }
   → builds the context packet (Sleeper data, derived stats, memory),
     runs the validation gate, creates a staged job row, returns { status: 'started' }

2. Client loop: POST /api/newsletter/generate-step { season, week }
   → advances the job by exactly ONE step
   → returns { done: false, step: 'Intro', completedCount, totalSteps }
   Optional: { step: 'Recap_2' } re-runs a specific step (used by the
   diagnostics page retry button).

3. When all required steps are complete, the final generate-step call
   assembles sections, validates, builds the coverage report, renders HTML,
   and saves the newsletter row.

4. Admin reviews in Edit Mode (/admin/newsletter), optionally runs the
   fact audit, finalizes (re-renders HTML), and publishes.
```

Step names: `Intro`, `Recap_0..N`, `Trade_0..N`, `WaiversAndFA`, `Spotlight`,
`Forecast`, `Blurt`, `FinalWord`, plus episode-specific steps
(`PowerRankings`, `MockDraft`, `DraftGrades`, …). The step list comes from
`getGenerationSteps()` in `src/lib/newsletter/compose-step.ts`, which keys off
the episode type.

### Guards

- **Validation gate** (`validation-gate.ts`) — runs at job start. Checks
  season/week sanity, roster completeness, matchup data, recap scores. Blocks
  generation unless `force=true`.
- **Required-step guard** (`generate-step/route.ts`) — final assembly refuses
  to run while any required step is missing or failed; the response lists the
  offending steps so they can be retried.
- **Per-section render fallback** (`template.ts`) — if a section's data is
  malformed at render time, that section renders a visible placeholder instead
  of failing the whole newsletter.

## LLM cascade

All section text goes through `generateWithCascade()`
(`src/lib/newsletter/llm/cascade.ts`):

```
anthropic (Claude, primary)
  → gemini-2.5-flash
  → gemini-2.0-flash
  → groq
  → cerebras
  → openrouter
```

- Only providers with an API key set are in the cascade.
- Rate-limit/quota errors fall through to the next provider and put the
  failed provider on cooldown (2 min for RPM/TPM, 25 h for daily quota).
- Auth errors (401) abort the cascade — a misconfigured key should be loud.
- Calls are serialized through a single queue with a per-provider minimum gap.
- Anthropic system prompts are sent with `cache_control: ephemeral`
  (prompt caching), so repeated persona prompts within a run are cheap.
- Per-section provider metadata (provider, model, tier, fallback flag) is
  buffered in `groq.ts` (`drainSectionMetaBuffer`) and persisted with each
  step.

## Observability tables

All writes are fire-and-forget (`src/server/db/observability-queries.ts`) —
they can never fail the pipeline.

| Table | One row per | Contents |
|---|---|---|
| `generation_runs` | generation run | status, frozen context packet, validation result, coverage warnings, fact-audit result, step counts |
| `generation_run_sections` | generated section | provider/model/tier, fallback flag, duration, tokens, retries, error |
| `newsletter_snapshots` | finalize/restore | full content JSON + HTML (max 10 per newsletter, oldest pruned) |
| `mcp_call_log` | MCP tool call | tool, sanitized args (secrets redacted), duration, response size, error |

Surfaces:

- **`/admin/diagnostics`** — last 20 runs with per-section detail and retry
  buttons; last 100 MCP calls.
- **Edit Mode "Run Health" panel** — coverage warnings, provider badges per
  section, fact-audit flags.

## Post-generation passes

- **Coverage report** (`coverage-report.ts`, pure code) — which teams were
  mentioned where, omitted teams, repeated 8-gram phrases across sections.
  Warning-only; stored on the run.
- **Fact audit** (`fact-audit.ts`, Gemini Flash) — extracts factual claims
  (scores, records, stats, transactions) and classifies each high/medium/low
  risk for human spot-checking. Triggered manually via
  `POST /api/newsletter/fact-audit` or the editor's Run Health panel.
  Advisory-only; stored on the run (`generation_runs.fact_audit`).

## Edit & rollback

- Section edits go through `POST /api/newsletter/edit` (`save_section`,
  `ai_rewrite`, `finalize`). Edit history is capped at 50 entries.
- Before every finalize, a full snapshot is saved. `list`/`restore` actions on
  the edit route roll back to any of the last 10 snapshots (a `pre_restore`
  snapshot is taken first, so restores are themselves reversible).
