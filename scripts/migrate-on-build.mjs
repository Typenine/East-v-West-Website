#!/usr/bin/env node
import { execSync } from 'node:child_process';

try {
  if (!process.env.DATABASE_URL) {
    console.log('[migrate-on-build] No DATABASE_URL found. Skipping db:migrate.');
    process.exit(0);
  }

  // Deployment safety: preview/branch deployments must NOT migrate the database.
  // Migrations run only when:
  //   - VERCEL_ENV === 'production' (production deploy), or
  //   - VERCEL_ENV is unset (local dev build), or
  //   - ALLOW_BUILD_MIGRATIONS === 'true' (explicit opt-in, e.g. a dedicated staging project)
  const vercelEnv = process.env.VERCEL_ENV; // 'production' | 'preview' | 'development' | undefined
  const explicitlyAllowed = process.env.ALLOW_BUILD_MIGRATIONS === 'true';
  if (vercelEnv && vercelEnv !== 'production' && !explicitlyAllowed) {
    console.log(`[migrate-on-build] VERCEL_ENV=${vercelEnv} — skipping db:migrate (previews must not mutate the database). Set ALLOW_BUILD_MIGRATIONS=true to override intentionally.`);
    process.exit(0);
  }

  console.log('[migrate-on-build] Running db:migrate...');
  execSync('npm run db:migrate', { stdio: 'inherit' });
  console.log('[migrate-on-build] Done.');
} catch (e) {
  console.warn('[migrate-on-build] Migration failed (non-fatal — runtime will handle):', e?.message || e);
  process.exit(0);
}
