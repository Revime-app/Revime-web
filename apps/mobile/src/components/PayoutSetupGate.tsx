import { useEffect, useMemo, useState } from 'react';
import type { CommandeDto } from '@revime/shared';
import { useRepairerJourney } from '../lib/use-repairer-journey';
import {
  hasSeenPayoutSheet,
  markPayoutSheetSeen,
  payoutSheetContent,
  payoutSheetDue,
} from '../lib/payout-sheet';
import { PayoutSetupSheet } from './PayoutSetupSheet';

/**
 * V8 E1, mockup 4. Decides whether the order page opens `PayoutSetupSheet` and remembers that it did, once per
 * order. A component of its own because the order page returns early (loading, error, unpaid) before its data, and
 * these hooks must run on every render of whatever holds them. Rendered by `app/commande/[id]/index.tsx` for the
 * repairer only.
 */
export function PayoutSetupGate({
  commande,
}: {
  commande: Pick<CommandeDto, 'id' | 'status' | 'step' | 'hasStripeTransfer' | 'refundedCents' | 'payoutCents'>;
}) {
  const { journey, identityError, connectError } = useRepairerJourney();
  const seenBefore = useMemo(() => hasSeenPayoutSheet(commande.id), [commande.id]);
  const [dismissed, setDismissed] = useState(false);
  const visible = !seenBefore && !dismissed && payoutSheetDue(commande, journey, identityError || connectError);

  // Remembered as soon as it shows, so leaving the screen any way at all counts as having seen it.
  useEffect(() => {
    if (visible) markPayoutSheetSeen(commande.id);
  }, [visible, commande.id]);

  if (!journey || !visible) return null;
  return (
    <PayoutSetupSheet
      visible
      content={payoutSheetContent(journey, commande.payoutCents)}
      onDismiss={() => setDismissed(true)}
    />
  );
}
