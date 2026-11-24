'use client';

import { useState } from 'react';
import { RefundsList } from './RefundsList';
import { RefundDetailDrawer } from './RefundDetailDrawer';

/**
 * CF4-19 (task 7 brief; spec §4). New /remboursements list + detail drawer
 * page. `/remboursement` (singular) remains the per-order refund action page -
 * the drawer's « Ouvrir le remboursement » link goes there.
 */
export default function RemboursementsPage() {
  const [openCommandeId, setOpenCommandeId] = useState<string | null>(null);

  return (
    <div className="page page--wide">
      <h1>Remboursements</h1>

      <RefundsList onOpen={(id) => setOpenCommandeId(id)} />

      <RefundDetailDrawer
        commandeId={openCommandeId}
        isOpen={openCommandeId !== null}
        onClose={() => setOpenCommandeId(null)}
      />
    </div>
  );
}
