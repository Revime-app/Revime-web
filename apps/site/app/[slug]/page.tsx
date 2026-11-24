import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LegalArticle } from '../../components/LegalArticle';
import { PUBLIC_DOCUMENTS, findDocument } from '../../lib/documents';

/** Only the app's documents exist; any other slug is a 404, never a dynamic render. */
export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLIC_DOCUMENTS.map((d) => ({ slug: d.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = findDocument(slug);
  return entry ? { title: `${entry.label} | Revime` } : {};
}

export default async function LegalDocumentPage({ params }: Props) {
  const { slug } = await params;
  const entry = findDocument(slug);
  if (!entry) notFound();
  return <LegalArticle document={entry.document} />;
}
