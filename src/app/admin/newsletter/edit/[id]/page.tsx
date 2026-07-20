'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import SectionHeader from '@/components/ui/SectionHeader';
import EditorialWorkspace from '../../EditorialWorkspace';

export default function NewsletterEditorialWorkspacePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <div className="container mx-auto px-3 sm:px-4 py-6 max-w-[1800px]">
      <div className="flex items-center justify-between gap-3 mb-4">
        <SectionHeader title="Newsletter Editorial Workspace" />
        <Link href="/admin/newsletter"><Button variant="ghost" size="sm">Back to newsletter admin</Button></Link>
      </div>
      <EditorialWorkspace newsletterId={id} />
    </div>
  );
}
