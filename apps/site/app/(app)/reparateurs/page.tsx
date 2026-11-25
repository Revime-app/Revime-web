import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '../../../lib/seo';
import { Loader } from '../../../components/app/ui';
import { RepairerDirectory } from './RepairerDirectory';

export const metadata: Metadata = buildMetadata({
  title: 'Trouver un réparateur près de chez vous',
  description:
    'Réparateurs vérifiés de téléphones, ordinateurs, vélos, électroménager et plus : comparez leurs avis et leur zone, puis demandez un devis.',
  path: '/reparateurs',
});

export default function ReparateursPage() {
  return (
    <Suspense fallback={<Loader />}>
      <RepairerDirectory />
    </Suspense>
  );
}
