import NewsletterEditorRouter from './NewsletterEditorRouter';

export default async function NewsletterEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NewsletterEditorRouter newsletterId={id} />;
}
