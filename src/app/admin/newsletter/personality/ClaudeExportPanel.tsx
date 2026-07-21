'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Label from '@/components/ui/Label';

const packs = [
  { key: 'mason', label: 'Mason Reed', detail: 'Permanent matrix + current evolving memory' },
  { key: 'westy', label: 'Trent Weston / Westy', detail: 'Permanent matrix + current evolving memory' },
  { key: 'shared', label: 'Shared Show Bible', detail: 'League rules, team cards, phrase pools, and episode standards' },
] as const;

export default function ClaudeExportPanel() {
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const safeSeason = Number.isFinite(Number(season)) ? Math.trunc(Number(season)) : new Date().getFullYear();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Claude Project Exports</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs">
          <Label className="mb-1 block text-xs">Memory season</Label>
          <Input type="number" min={2020} max={2100} value={season} onChange={event => setSeason(event.target.value)} />
          <p className="mt-1 text-xs text-[var(--muted)]">The selected season controls which evolving bot-memory snapshot is included.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {packs.map(pack => (
            <div key={pack.key} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="text-sm font-semibold text-[var(--foreground)]">{pack.label}</div>
              <p className="mt-1 min-h-10 text-xs leading-5 text-[var(--muted)]">{pack.detail}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`/api/admin/newsletter/personality-export?pack=${pack.key}&format=md&season=${safeSeason}`}
                  className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600"
                >
                  Download Markdown
                </a>
                <a
                  href={`/api/admin/newsletter/personality-export?pack=${pack.key}&format=json&season=${safeSeason}`}
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background)]"
                >
                  JSON backup
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 px-4 py-3 text-xs leading-5 text-blue-200">
          For a Claude special-episode project, upload all three Markdown files. Mason and Westy remain separate personalities; the Shared Show Bible gives both hosts the same league and editorial context.
        </div>
      </CardContent>
    </Card>
  );
}
