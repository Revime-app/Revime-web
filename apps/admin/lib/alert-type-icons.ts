import { Bell, CreditCard, Lock, Package, Scale, ShieldAlert, ShieldCheck, ShieldOff, Siren, type LucideIcon } from 'lucide-react';
import type { AdminAlertType } from '@revime/shared';

/**
 * ISS-123: the Lucide icon for each admin alert type. `ADMIN_ALERT_TYPE_LABELS` in the shared
 * package still carries an emoji per type, which the admin no longer draws.
 */
export const ALERT_TYPE_ICON: Record<AdminAlertType, LucideIcon> = {
  DISPUTE_NEW: Scale,
  REPORT_SEVERE: Siren,
  PAYMENT_FAILED: CreditCard,
  PARCEL_INCIDENT: Package,
  ACCOUNT_LOCKED: Lock,
  IP_BLOCKED: ShieldAlert,
  ACCOUNT_SECURED: ShieldCheck,
  PROVIDER_REVOKE_FAILED: ShieldOff,
};

/** The icon for a type string from the API; a bell for a type this admin build does not know. */
export function alertTypeIcon(type: string): LucideIcon {
  return (ALERT_TYPE_ICON as Record<string, LucideIcon | undefined>)[type] ?? Bell;
}
