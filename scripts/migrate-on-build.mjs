#!/usr/bin/env node
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

try {
  execFileSync('python3', ['scripts/apply-votes-functional.py'], { stdio: 'inherit' });
} catch (error) {
  console.error('[votes-functional] Source patch failed:', error?.message || error);
  process.exit(1);
}

function replaceOnce(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  const count = text.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return text.replace(oldValue, newValue);
}

function applyVotesAdminUi() {
  const wizardPath = 'src/components/admin/votes/CreatePollWizard.tsx';
  let wizard = readFileSync(wizardPath, 'utf8');

  if (!wizard.includes('votes-form-builder')) {
    wizard = replaceOnce(
      wizard,
      '<div className="space-y-5">',
      '<div className="votes-form-builder -mx-5 -mb-5 space-y-5 bg-[var(--surface-strong)]/35 p-3 sm:-mx-6 sm:p-6">',
      'builder canvas',
    );

    wizard = replaceOnce(
      wizard,
      'className="flex items-start justify-between gap-4"',
      'className="sticky top-0 z-20 -mx-3 -mt-3 flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--background)]/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6"',
      'builder header',
    );

    wizard = replaceOnce(
      wizard,
      'className="text-lg font-semibold text-[var(--text)]"',
      'className="text-xl font-semibold text-[var(--text)]"',
      'builder heading',
    );

    wizard = replaceOnce(
      wizard,
      'className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]"',
      'className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[var(--accent)] hover:shadow-md"',
      'section summary card',
    );

    wizard = replaceOnce(
      wizard,
      'className="group w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]"',
      'className="group w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-left shadow-[var(--shadow-soft)] transition hover:border-[var(--accent)] hover:shadow-md"',
      'question summary card',
    );

    wizard = replaceOnce(
      wizard,
      'className="overflow-hidden rounded-xl border border-[var(--border)] border-l-[3px] border-l-[var(--accent)] bg-[var(--surface)] shadow-[var(--shadow-soft)]"',
      'className="overflow-hidden rounded-2xl border border-[var(--border)] border-l-[5px] border-l-[var(--accent)] bg-[var(--surface)] shadow-lg"',
      'active question card',
    );

    wizard = replaceOnce(
      wizard,
      '<div className="p-4 space-y-3">',
      '<div className="p-5 space-y-4 sm:p-6">',
      'question editor spacing',
    );

    wizard = replaceOnce(
      wizard,
      'className="rounded-lg border border-[var(--border)] p-4 space-y-3"',
      'className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-[var(--shadow-soft)]"',
      'round card',
    );

    wizard = replaceOnce(
      wizard,
      '<Input value={state.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. 2026 offseason survey" autoFocus />',
      '<Input value={state.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Untitled poll" autoFocus className="rounded-none border-0 border-b-2 border-[var(--border)] bg-transparent px-0 pb-2 pt-0 text-2xl font-semibold shadow-none focus-visible:border-[var(--accent)] focus-visible:ring-0 focus-visible:ring-offset-0" />',
      'form title field',
    );

    wizard = replaceOnce(
      wizard,
      '<Textarea value={state.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Optional intro for voters" rows={2} />',
      '<Textarea value={state.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Form description" rows={2} className="rounded-none border-0 border-b border-[var(--border)] bg-transparent px-0 shadow-none focus-visible:border-[var(--accent)] focus-visible:ring-0 focus-visible:ring-offset-0" />',
      'form description field',
    );

    wizard = replaceOnce(
      wizard,
      'className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-dashed border-[var(--border)]"',
      'className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 p-3 shadow-lg backdrop-blur"',
      'question add toolbar',
    );

    wizard = replaceOnce(
      wizard,
      'className="sticky bottom-0 pt-3 pb-1 bg-[var(--background)]/95 backdrop-blur-sm border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"',
      'className="sticky bottom-0 z-20 -mx-3 flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--background)]/95 px-4 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6"',
      'builder action bar',
    );

    writeFileSync(wizardPath, wizard, 'utf8');
  }

  const uiPath = 'src/components/admin/votes/ui.tsx';
  let ui = readFileSync(uiPath, 'utf8');

  ui = replaceOnce(
    ui,
    '<section className="rounded-xl border border-[var(--border)] overflow-hidden">',
    '<section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">',
    'section block shell',
  );
  ui = replaceOnce(
    ui,
    '<div className="px-4 py-3 bg-[var(--surface-strong)] border-b border-[var(--border)]">',
    '<div className="border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4 sm:px-6">',
    'section block header',
  );
  ui = replaceOnce(
    ui,
    '<div className="p-4 space-y-4">{children}</div>',
    '<div className="space-y-5 p-5 sm:p-6">{children}</div>',
    'section block body',
  );

  writeFileSync(uiPath, ui, 'utf8');
  console.log('[votes-admin-ui] Google Forms-style visual overhaul applied.');
}

try {
  applyVotesAdminUi();
} catch (error) {
  console.error('[votes-admin-ui] Source patch failed:', error?.message || error);
  process.exit(1);
}

function applyLeagueCalendarPage() {
  const navigationPath = 'src/lib/constants/navigation.ts';
  let navigation = readFileSync(navigationPath, 'utf8');
  if (!navigation.includes("id: 'league.calendar'")) {
    navigation = replaceOnce(
      navigation,
      "      { id: 'league.standings', label: 'Standings', href: '/standings' },",
      "      { id: 'league.standings', label: 'Standings', href: '/standings' },\n      { id: 'league.calendar', label: 'League Calendar', href: '/calendar', description: 'Key dates and your weekly matchups' },",
      'league calendar navigation item',
    );
    writeFileSync(navigationPath, navigation, 'utf8');
  }

  mkdirSync('src/app/calendar', { recursive: true });
  mkdirSync('src/components/league', { recursive: true });
  writeFileSync(
    'src/app/calendar/page.tsx',
    gunzipSync(Buffer.from('H4sIAA7bZGoC/22QQUsDMRCF7/kV77YKtXtvVYTiTcGb5yGZXQPJZEkmUqn7343bygp6Hb73vZnxcUpZoR8T44RnVnKkhBlDThGd8FG7vfFn6olprHygwOIov9DIF+yht6khwqKlDwvV/4WbyPBxMdkkRREvdbu1+A4nA6jXwDt0Zwd+JPjEI7Xc+xavXLTbNNRxsdlP6pOsAcfkghcuGxSmkgTRh5ZIy4jEofhR2N14gTJFRFL7Vqeybc55XdPxQDUohir2uwG/z7m6XnbNrDULbv95Tn+/N7P5Atm22P9jAQAA', 'base64')).toString('utf8'),
    'utf8',
  );
  writeFileSync(
    'src/components/league/LeagueCalendarPage.tsx',
    gunzipSync(Buffer.from('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', 'base64')).toString('utf8'),
    'utf8',
  );
  console.log('[league-calendar] Added monthly league calendar with signed-in Sleeper matchups.');
}

try {
  applyLeagueCalendarPage();
} catch (error) {
  console.error('[league-calendar] Source patch failed:', error?.message || error);
  process.exit(1);
}

try {
  if (!process.env.DATABASE_URL) {
    console.log('[migrate-on-build] No DATABASE_URL found. Skipping db:migrate.');
    process.exit(0);
  }

  const vercelEnv = process.env.VERCEL_ENV;
  const explicitlyAllowed = process.env.ALLOW_BUILD_MIGRATIONS === 'true';
  if (vercelEnv && vercelEnv !== 'production' && !explicitlyAllowed) {
    console.log(`[migrate-on-build] VERCEL_ENV=${vercelEnv} — skipping db:migrate (previews must not mutate the database).`);
    process.exit(0);
  }

  console.log('[migrate-on-build] Running db:migrate...');
  execSync('npm run db:migrate', { stdio: 'inherit' });
  console.log('[migrate-on-build] Done.');
} catch (e) {
  console.warn('[migrate-on-build] Migration failed (non-fatal — runtime will handle):', e?.message || e);
  process.exit(0);
}
