#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ENV_PATH = path.join(process.cwd(), '.env.local');
const want = {
  R2_ACCOUNT_ID: 'fdfd423971a9c0252e3299efe2ebaa33',
  R2_BUCKET: 'east-v-west',
  R2_ACCESS_KEY_ID: '65d28efd570ed73c469bc9ddfaf381d0',
  R2_SECRET_ACCESS_KEY: '3814f2f8664d086cad719692f1e5e4781b905766978331a8f3cb38713c0ce4d2',
};

function setEnvLines(p, vars) {
  let lines = [];
  try { lines = fs.readFileSync(p, 'utf8').split(/\r?\n/); } catch {}
  const filtered = lines.filter((ln) => !/^(R2_ACCOUNT_ID|R2_BUCKET|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY)=/.test(ln));
  const appended = [
    `R2_ACCOUNT_ID=${vars.R2_ACCOUNT_ID}`,
    `R2_BUCKET=${vars.R2_BUCKET}`,
    `R2_ACCESS_KEY_ID=${vars.R2_ACCESS_KEY_ID}`,
    `R2_SECRET_ACCESS_KEY=${vars.R2_SECRET_ACCESS_KEY}`,
  ];
  const out = [...filtered, ...appended].join('\n');
  fs.writeFileSync(p, out, 'utf8');
}

setEnvLines(ENV_PATH, want);
