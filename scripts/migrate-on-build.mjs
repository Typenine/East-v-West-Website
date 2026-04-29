#!/usr/bin/env node
import { execSync } from 'node:child_process';

try {
  if (!process.env.DATABASE_URL) {
    console.log('[migrate-on-build] No DATABASE_URL found. Skipping db:migrate.');
    process.exit(0);
  }
  console.log('[migrate-on-build] Running db:migrate...');
  execSync('npm run db:migrate', { stdio: 'inherit' });
  console.log('[migrate-on-build] Done.');
} catch (e) {
  console.warn('[migrate-on-build] Migration failed (non-fatal — runtime will handle):', e?.message || e);
  process.exit(0);
}
