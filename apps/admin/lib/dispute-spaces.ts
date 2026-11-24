import type { DisputeStatusType } from '@revime/shared';
import { stripSupportPrefix } from '@revime/shared';

export type DisputeSpaceTab = 'MAIN' | 'CLIENT' | 'REPAIRER';

export const spaceTabs: Array<{ id: DisputeSpaceTab; label: string }> = [
  { id: 'MAIN', label: 'Conversation principale' },
  { id: 'CLIENT', label: 'Espace client (confidentiel)' },
  { id: 'REPAIRER', label: 'Espace réparateur (confidentiel)' },
];

export function visibleToLabel(space: DisputeSpaceTab): string {
  switch (space) {
    case 'MAIN':
      return 'Visible par : client et réparateur';
    case 'CLIENT':
      return 'Visible par : client uniquement';
    case 'REPAIRER':
      return 'Visible par : réparateur uniquement';
  }
}

export function canWriteSpace(space: DisputeSpaceTab, status: DisputeStatusType): boolean {
  if (status === 'OPEN' || status === 'IN_REVIEW') {
    return true;
  }
  if (
    status === 'RESOLVED_REFUNDED' ||
    status === 'RESOLVED_RELEASED' ||
    status === 'RESOLVED_DISMISSED'
  ) {
    return space === 'MAIN';
  }
  return false;
}

export function renderSupportBody(body: string): string {
  return stripSupportPrefix(body);
}

export type DisputeSenderRole = 'CLIENT' | 'REPAIRER' | 'ADMIN' | 'SYSTEM' | 'UNKNOWN';

export interface DisputeSenderDisplay {
  role: DisputeSenderRole;
  label: string;
  color: string;
  badgeBg: string;
  badgeBorder: string;
}

export const DISPUTE_ROLE_STYLE: Record<
  DisputeSenderRole,
  { color: string; badgeBg: string; badgeBorder: string; labelPrefix: string }
> = {
  CLIENT: {
    color: 'var(--badge-info-text)',
    badgeBg: 'var(--badge-info-bg)',
    badgeBorder: 'var(--badge-info-border)',
    labelPrefix: 'Client',
  },
  REPAIRER: {
    color: 'var(--badge-warning-text)',
    badgeBg: 'var(--badge-warning-bg)',
    badgeBorder: 'var(--badge-warning-border)',
    labelPrefix: 'Réparateur',
  },
  ADMIN: {
    color: 'var(--badge-success-text)',
    badgeBg: 'var(--badge-success-bg)',
    badgeBorder: 'var(--badge-success-border)',
    labelPrefix: 'REVIME — Support',
  },
  SYSTEM: {
    color: 'var(--ink2)',
    badgeBg: 'var(--badge-neutral-bg)',
    badgeBorder: 'var(--line)',
    labelPrefix: 'Système',
  },
  UNKNOWN: {
    color: 'var(--ink2)',
    badgeBg: 'var(--badge-neutral-bg)',
    badgeBorder: 'var(--line)',
    labelPrefix: 'Participant',
  },
};

export interface DisputePartyRef {
  id?: string | null;
  name?: string | null;
}

export function cleanPartyName(name: string | null | undefined, roleLabel: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === roleLabel.toLowerCase() ||
    lower === 'client' ||
    lower === 'réparateur' ||
    lower === 'reparateur'
  ) {
    return '';
  }
  const prefixRegex = new RegExp(`^${roleLabel}\\s*·\\s*`, 'i');
  return trimmed.replace(prefixRegex, '').trim();
}

function display(role: DisputeSenderRole, label: string): DisputeSenderDisplay {
  const { color, badgeBg, badgeBorder } = DISPUTE_ROLE_STYLE[role];
  return { role, label, color, badgeBg, badgeBorder };
}

/** « Client · Camille », or the bare role when the party has no name of its own (a deleted account). */
function partyDisplay(role: 'CLIENT' | 'REPAIRER', rawName: string | null | undefined): DisputeSenderDisplay {
  const prefix = DISPUTE_ROLE_STYLE[role].labelPrefix;
  const name = cleanPartyName(rawName?.trim(), prefix);
  return display(role, name ? `${prefix} · ${name}` : prefix);
}

export function resolveDisputeSender(
  msg: {
    senderUserId?: string | null;
    kind?: string | null;
    senderName?: string | null;
    senderRole?: string | null;
  },
  client?: DisputePartyRef | null,
  repairer?: DisputePartyRef | null,
): DisputeSenderDisplay {
  if (msg.kind === 'SUPPORT' || msg.senderRole === 'ADMIN') {
    return display('ADMIN', DISPUTE_ROLE_STYLE.ADMIN.labelPrefix);
  }
  if (msg.kind === 'SYSTEM' || msg.senderRole === 'SYSTEM') {
    return display('SYSTEM', DISPUTE_ROLE_STYLE.SYSTEM.labelPrefix);
  }

  const senderId = msg.senderUserId ?? null;
  const clientId = client?.id ?? null;
  const repairerId = repairer?.id ?? null;

  if ((senderId && clientId && senderId === clientId) || msg.senderRole === 'CLIENT') {
    return partyDisplay('CLIENT', client?.name?.trim() || msg.senderName);
  }
  if ((senderId && repairerId && senderId === repairerId) || msg.senderRole === 'REPAIRER') {
    return partyDisplay('REPAIRER', repairer?.name?.trim() || msg.senderName);
  }

  const named = msg.senderName?.trim();
  return display('UNKNOWN', named || DISPUTE_ROLE_STYLE.UNKNOWN.labelPrefix);
}

/**
 * A confidential space belongs to one party, so any message that REVIME did not write is that party's:
 * the label comes from the tab, there is no sender id to compare.
 */
export function resolveConfidentialSender(
  msg: { author: string },
  space: 'CLIENT' | 'REPAIRER',
  client?: DisputePartyRef | null,
  repairer?: DisputePartyRef | null,
): DisputeSenderDisplay {
  if (msg.author === 'REVIME') return display('ADMIN', DISPUTE_ROLE_STYLE.ADMIN.labelPrefix);
  return partyDisplay(space, space === 'CLIENT' ? client?.name : repairer?.name);
}
