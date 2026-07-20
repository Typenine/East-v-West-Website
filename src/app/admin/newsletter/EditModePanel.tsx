'use client';

import EditorialWorkspace from './EditorialWorkspace';

export interface EditModePanelProps {
  season: string;
  week: string;
  needsWeek: boolean;
  newsletterId?: string | null;
  html: string | null;
  onHtmlUpdate: (html: string) => void;
  onClose: () => void;
  onPublish: () => void;
  publishing: boolean;
  finalizeResult: { ok: boolean; message: string } | null;
  setFinalizeResult: (result: { ok: boolean; message: string } | null) => void;
}

/**
 * Backwards-compatible host for the generator page. The real editor now lives
 * in EditorialWorkspace and always resolves an immutable newsletter id before
 * saving. Keeping this adapter avoids duplicating the editorial workflow.
 */
export default function EditModePanel({
  season,
  week,
  needsWeek,
  newsletterId,
  html,
  onHtmlUpdate,
  onClose,
  setFinalizeResult,
}: EditModePanelProps) {
  return (
    <EditorialWorkspace
      newsletterId={newsletterId}
      season={season}
      week={needsWeek ? week : 0}
      initialHtml={html}
      embedded
      onHtmlUpdate={onHtmlUpdate}
      onClose={onClose}
      onPublished={message => setFinalizeResult({ ok: true, message })}
    />
  );
}
