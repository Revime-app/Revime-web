'use client';

import { useRequireSession } from '../../../lib/client/session';
import { Loader, PageTitle } from '../../../components/app/ui';

export default function MessagesPage() {
  const me = useRequireSession();
  if (!me) return <Loader />;
  return (
    <div className="ap-page ap-narrow">
      <PageTitle title="Messages" />
      <div className="ap-empty">
        <strong>Vos conversations arrivent sur le site</strong>
        <span>Elles sont déjà dans l’appli REVIME, avec le même compte.</span>
      </div>
    </div>
  );
}
