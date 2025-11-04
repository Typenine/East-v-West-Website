#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

async function getServerDate(accountId){
  const url = `https://${accountId}.r2.cloudflarestorage.com`;
  const res = await fetch(url);
  const d = res.headers.get('date');
  return d ? Date.parse(d) : NaN;
}

function setEnvVar(filepath, key, value){
  let lines = [];
  try { lines = fs.readFileSync(filepath, 'utf8').split(/\r?\n/); } catch {}
  const filtered = lines.filter((ln) => !(new RegExp(`^${key}=`).test(ln)));
  filtered.push(`${key}=${value}`);
  fs.writeFileSync(filepath, filtered.join('\n'), 'utf8');
}

async function main(){
  const account = process.env.R2_ACCOUNT_ID || '';
  if (!account) { console.error('[calc-r2-offset] R2_ACCOUNT_ID missing'); process.exit(1); }
  const server = await getServerDate(account);
  if (!Number.isFinite(server)) { console.error('[calc-r2-offset] Could not read server date'); process.exit(1); }
  const local = Date.now();
  const offset = server - local; // add this to local now to match server
  const envPath = path.join(process.cwd(), '.env.local');
  setEnvVar(envPath, 'R2_CLOCK_OFFSET_MS', String(offset));
  console.log(`[calc-r2-offset] server=${new Date(server).toISOString()} local=${new Date(local).toISOString()} offsetMs=${offset}`);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
