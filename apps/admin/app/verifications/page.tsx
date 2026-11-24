'use client';

import { VerificationAlertsBlock } from '../../components/VerificationAlertsBlock';
import { VerificationsList } from './VerificationsList';

/**
 * CF4-21 / A-3 (Compliance Brief Page 9, Mockup page9_img2.png).
 * Top: Verification fraud and discrepancy alerts ("Dossiers nécessitant une action").
 * Main: Full verifications list with filters and decision panels.
 */
export default function VerificationsPage() {
  return (
    <div className="page page--wide">
      <h1>Vérifications</h1>

      {/* A-3: Verification Fraud & Discrepancy Alerts */}
      <VerificationAlertsBlock />

      <VerificationsList />
    </div>
  );
}
