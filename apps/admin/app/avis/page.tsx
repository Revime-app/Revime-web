'use client';

import { useState } from 'react';
import { ReviewsList } from './ReviewsList';
import { ReviewDetailDrawer } from './ReviewDetailDrawer';

/**
 * CF4-37 « Avis » (spec §4.4). Consult, search and filter reviews; moderate one ONLY when
 * justified (« Pas de suppression parce qu'un avis est négatif »): a hide needs a motif from a
 * fixed list and can be undone. Same list + drawer shape as /remboursements.
 */
export default function AvisPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  // Bumped after a hide/restore so the list re-reads the row's new state.
  const [version, setVersion] = useState(0);

  return (
    <div className="page page--wide">
      <h1>Avis</h1>

      <ReviewsList onOpen={setOpenId} version={version} />

      <ReviewDetailDrawer
        reviewId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => setVersion((v) => v + 1)}
      />
    </div>
  );
}
