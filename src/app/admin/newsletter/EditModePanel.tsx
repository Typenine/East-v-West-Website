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

export default function EditModePanel({
  season,
  week,
  needsWeek,
  newsletterId,
  html,
  onHtmlUpdate,
  onClose,
  onPublish,
  publishing,
  setFinalizeResult,
}: EditModePanelProps) {
  return (
    <EditorialWorkspace
      embedded
      newsletterId={newsletterId}
      season={season}
      week={week}
      needsWeek={needsWeek}
      initialHtml={html}
      onHtmlUpdate={onHtmlUpdate}
      onClose={onClose}
      onPublish={onPublish}
      publishing={publishing}
      setFinalizeResult={setFinalizeResult}
    />
  );
}
