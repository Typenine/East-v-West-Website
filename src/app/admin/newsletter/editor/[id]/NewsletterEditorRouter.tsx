'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import EditorialWorkspace from '../../EditorialWorkspace';
import Button from '@/components/ui/Button';

interface PreviewPayload {
  success?: boolean;
  title?: string | null;
  status?: 'draft' | 'published';
  newsletter?: {
    sections?: Array<{ type: string; data: unknown }>;
  };
  error?: string;
}

export default function NewsletterEditorRouter({ newsletterId }: { newsletterId: string }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/newsletter?id=${encodeURIComponent(newsletterId)}&draft=1`, {
      cache: 'no-store',
      credentials: 'include',
    })
      .then(async response => {
        const data = await response.json() as PreviewPayload;
        if (!response.ok || data.success === false) throw new Error(data.error || 'Unable to load newsletter');
        if (!cancelled) setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [newsletterId]);

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-zinc-500">Loading newsletter preview...</div>;
  }

  const isUploadedPdf = Boolean(payload?.newsletter?.sections?.some(section => section.type === 'UploadedPdf'));
  if (!isUploadedPdf) return <EditorialWorkspace newsletterId={newsletterId} />;

  const title = payload?.title?.trim() || 'Uploaded Newsletter';
  const pdfUrl = `/api/newsletter/pdf?id=${encodeURIComponent(newsletterId)}`;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/newsletter" className="text-sm text-zinc-500 hover:text-zinc-300">← Newsletter Admin</Link>
          <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-zinc-500">Uploaded PDF preview{payload?.status ? ` · ${payload.status}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">Open PDF in new tab</Button>
          </a>
          <a href={`${pdfUrl}&download=1`}>
            <Button variant="primary">Download original PDF</Button>
          </a>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl">
        <iframe
          src={pdfUrl}
          title={`${title} PDF preview`}
          className="block h-[82vh] min-h-[760px] w-full border-0 bg-zinc-700"
        />
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-500">
        This is the original uploaded PDF. Return to Newsletter Admin to rename, publish, send the Discord announcement, or delete the draft.
      </div>
    </div>
  );
}
