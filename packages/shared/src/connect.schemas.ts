import { z } from 'zod';

/**
 * There is deliberately no NOT_STARTED. The absence of a ConnectAccount row IS
 * not-started, and `ConnectStatusResponse.status` is null for it - see spec §3.1.
 * A member for it would create two representations of one state.
 */
export const connectStatusSchema = z.enum(['PENDING', 'VERIFIED', 'RESTRICTED', 'REJECTED']);
export type ConnectStatus = z.infer<typeof connectStatusSchema>;

export const CONNECT_STATUS_LABEL: Record<ConnectStatus, string> = {
  PENDING: 'En attente',
  VERIFIED: 'Vérifié',
  RESTRICTED: 'Restreint',
  REJECTED: 'Refusé',
};

/**
 * Stripe's answer about the réparateur's legal shape, NOT the self-declared
 * `RepairerProfile.kind`. The identity spec §6.2 forbids `kind` from driving a
 * badge; this is the field that legitimately can.
 */
export const connectEntityTypeSchema = z.enum(['INDIVIDUAL', 'COMPANY']);
export type ConnectEntityType = z.infer<typeof connectEntityTypeSchema>;

/** 
 * `POST /connect/onboarding`. 
 * AccountSession credentials for in-app onboarding plus hosted fallback URL.
 */
export type ConnectOnboardingResponse = {
  clientSecret: string;
  publishableKey: string;
  url: string;
};

/** `GET /connect/status`. */
export type ConnectStatusResponse = {
  /** null when the réparateur has never started. The app renders « Configurer ». */
  status: ConnectStatus | null;
  entityType: ConnectEntityType | null;
  /** Whether P3 may transfer to this account. Cached; P3 re-reads Stripe at transfer time. */
  transfersActive: boolean;
  /** ISO 8601, or null. How stale the three fields above are. */
  lastSyncedAt: string | null;
};
