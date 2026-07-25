#!/usr/bin/env node
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

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
