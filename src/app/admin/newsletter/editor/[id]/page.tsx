import EditorialWorkspace from '../../EditorialWorkspace';

export default async function NewsletterEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorialWorkspace newsletterId={id} />;
}
