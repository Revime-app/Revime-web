import type { Metadata } from 'next';
import { ClientHome } from './ClientHome';

export const metadata: Metadata = { title: 'Accueil' };

export default function AccueilPage() {
  return <ClientHome />;
}
