#!/usr/bin/env node
import fs from 'node:fs';
const base = process.argv[2] || process.env.TEST_BASE || 'http://localhost:3000';
const LOG = 'test-presign.log';
function log(...args){ const s = args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '); fs.appendFileSync(LOG, s + '\n'); }

async function main() {
  const body = { key: 'uploads/test.txt', contentType: 'text/plain' };
  log('[test] presign POST', base + '/api/media/presign');
  const pres = await fetch(base + '/api/media/presign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!pres.ok) {
    log('[test] presign failed', pres.status, await pres.text());
    process.exit(1);
  }
  const pj = await pres.json();
  log('[test] presign ok', pj);

  const content = 'hello evw ' + new Date().toISOString();
  log('[test] PUT upload to R2');
  const putRes = await fetch(pj.putUrl, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: content });
  if (!putRes.ok) {
    log('[test] PUT failed', putRes.status, await putRes.text());
    process.exit(1);
  }
  log('[test] PUT ok');

  const getUrl = base + '/api/media/' + body.key;
  log('[test] GET via API', getUrl);
  const getRes = await fetch(getUrl);
  if (!getRes.ok) {
    log('[test] GET failed', getRes.status, await getRes.text());
    process.exit(1);
  }
  log('[test] GET ok', getRes.status, getRes.headers.get('content-type'));
}

main().catch((e) => { console.error(e); process.exit(1); });
