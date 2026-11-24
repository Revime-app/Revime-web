import type { Metadata } from 'next';
import { Soon } from '../../../components/espace/Soon';

export const metadata: Metadata = { title: 'Messages' };

export default function MessagesPage() {
  return (
    <Soon
      title="Messages"
      text="Vos conversations avec les réparateurs arrivent sur le site dans une prochaine étape. Elles sont déjà dans l’appli REVIME."
    />
  );
}
