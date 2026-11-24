import { redirect } from 'next/navigation';

/** The second factor now lives in « Paramètres » › Sécurité. Kept so old links still land. */
export default function SecuritePage() {
  redirect('/parametres');
}
