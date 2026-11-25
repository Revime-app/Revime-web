import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '../../../lib/seo';
import { Loader } from '../../../components/app/ui';
import { DemandeBrowse } from './DemandeBrowse';

export const metadata: Metadata = buildMetadata({
  title: 'Demandes de réparation en cours',
  description: 'Les demandes de réparation publiées sur REVIME : téléphones, vélos, électroménager, chaussures et plus.',
  path: '/demandes',
});

export default function DemandesPage() {
  return (
    <Suspense fallback={<Loader />}>
      <DemandeBrowse />
    </Suspense>
  );
}
