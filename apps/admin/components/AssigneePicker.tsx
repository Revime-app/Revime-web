'use client';

import React, { useEffect, useState } from 'react';
import { DELETED_USER_NAME, type DisputeAssigneeItem } from '@revime/shared';
import { User } from 'lucide-react';
import { Icon } from './Icon';

export interface AssigneePickerProps {
  disputeId: string;
  currentAssigneeId?: string | null;
  currentAssigneeName?: string | null;
  currentUserId?: string | null;
  onAssigned?: (newAssigneeId: string | null, newAssigneeName: string | null) => void;
}

export async function assignDisputeToUser(
  disputeId: string,
  assigneeUserId?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchImpl(`/api/proxy/admin/litiges/${encodeURIComponent(disputeId)}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assigneeUserId ? { assigneeUserId } : {}),
    });
    if (!res.ok) {
      return { ok: false, error: "Échec de l'assignation" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Erreur réseau lors de l\'assignation' };
  }
}

export async function unassignDisputeUser(
  disputeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchImpl(`/api/proxy/admin/litiges/${encodeURIComponent(disputeId)}/unassign`, {
      method: 'PATCH',
    });
    if (!res.ok) {
      return { ok: false, error: 'Échec de la désassignation' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Erreur réseau lors de la désassignation' };
  }
}

export function AssigneePicker({
  disputeId,
  currentAssigneeId,
  currentAssigneeName,
  currentUserId,
  onAssigned,
}: AssigneePickerProps) {
  const isDeletedAssignee =
    currentAssigneeName === DELETED_USER_NAME || currentAssigneeName === 'Opérateur supprimé';

  const [assigneeId, setAssigneeId] = useState<string | null>(
    isDeletedAssignee ? null : (currentAssigneeId ?? null),
  );
  const [assigneeName, setAssigneeName] = useState<string | null>(
    isDeletedAssignee ? null : (currentAssigneeName ?? null),
  );
  const [assignees, setAssignees] = useState<DisputeAssigneeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchAssignees() {
      try {
        const res = await fetch('/api/proxy/admin/litiges/assignees');
        if (res.ok) {
          const data = (await res.json()) as DisputeAssigneeItem[];
          if (!cancelled && Array.isArray(data)) {
            setAssignees(data);
            return;
          }
        }

        // Fallback to staff members endpoint if assignees route is not available
        const fallbackRes = await fetch('/api/proxy/admin/staff/members');
        if (fallbackRes.ok) {
          const fbData = await fallbackRes.json();
          const items = Array.isArray(fbData) ? fbData : (fbData.items ?? []);
          if (!cancelled) {
            setAssignees(
              items.map((m: any) => ({
                id: m.id,
                name: m.name || m.email,
                email: m.email,
                role: m.role,
              })),
            );
          }
        }
      } catch {
        // Silently preserve empty assignees list on fetch error
      }
    }

    void fetchAssignees();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const isDeleted =
      currentAssigneeName === DELETED_USER_NAME || currentAssigneeName === 'Opérateur supprimé';
    setAssigneeId(isDeleted ? null : (currentAssigneeId ?? null));
    setAssigneeName(isDeleted ? null : (currentAssigneeName ?? null));
  }, [currentAssigneeId, currentAssigneeName]);

  const handleAssignToMe = async () => {
    if (!currentUserId || loading) return;
    setLoading(true);
    const result = await assignDisputeToUser(disputeId, currentUserId);
    if (result.ok) {
      const myItem = assignees.find((a) => a.id === currentUserId);
      const newName = myItem?.name ?? 'Moi';
      setAssigneeId(currentUserId);
      setAssigneeName(newName);
      onAssigned?.(currentUserId, newName);
    }
    setLoading(false);
  };

  const handleSelectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVal = e.target.value;
    if (loading) return;

    if (!selectedVal) return;

    if (selectedVal === '__UNASSIGN__') {
      // Unassign action
      setLoading(true);
      const result = await unassignDisputeUser(disputeId);
      if (result.ok) {
        setAssigneeId(null);
        setAssigneeName(null);
        onAssigned?.(null, null);
      }
      setLoading(false);
    } else {
      // Assign to selected staff member
      setLoading(true);
      const result = await assignDisputeToUser(disputeId, selectedVal);
      if (result.ok) {
        const targetMember = assignees.find((a) => a.id === selectedVal);
        const newName = targetMember?.name ?? selectedVal;
        setAssigneeId(selectedVal);
        setAssigneeName(newName);
        onAssigned?.(selectedVal, newName);
      }
      setLoading(false);
    }
  };

  const isAssignedToCurrent = Boolean(currentUserId && assigneeId === currentUserId);
  const currentOptionPresent = assignees.some((a) => a.id === assigneeId);

  return (
    <div
      className="assignee-picker"
      data-testid="assignee-picker"
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'nowrap',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      {/* Current assignee label or Non assigné */}
      {assigneeId && assigneeName ? (
        <span
          data-testid="assignee-name"
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--navy-text, #25324f)',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon as={User} /> {assigneeName}
        </span>
      ) : (
        <span
          data-testid="unassigned-label"
          style={{
            fontSize: '11px',
            color: 'var(--muted, #9ca3af)',
            fontStyle: 'italic',
          }}
        >
          Non assigné
        </span>
      )}

      {/* Dropdown selector */}
      <select
        data-testid="assignee-select"
        value={assigneeId ?? ''}
        onChange={handleSelectChange}
        disabled={loading}
        aria-label="Assigner ce litige à un collaborateur"
        style={{
          padding: '3px 6px',
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--navy-text, #25324f)',
          backgroundColor: 'var(--paper, #ffffff)',
          border: '1px solid var(--line, #dfe2e2)',
          borderRadius: 'var(--r-field, 4px)',
          cursor: loading ? 'wait' : 'pointer',
          maxWidth: '140px',
        }}
      >
        <option value="" disabled={Boolean(assigneeId)}>Modifier…</option>
        {assigneeId && assigneeName && !currentOptionPresent && (
          <option value={assigneeId}>{assigneeName}</option>
        )}
        {assignees.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
        {assigneeId && <option value="__UNASSIGN__">Désassigner</option>}
      </select>

      {/* 1-click « M'assigner » shortcut */}
      {currentUserId && !isAssignedToCurrent && (
        <button
          type="button"
          data-testid="assign-to-me-btn"
          onClick={handleAssignToMe}
          disabled={loading}
          title="M'assigner ce dossier"
          style={{
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#ffffff',
            backgroundColor: 'var(--navy, #25324f)',
            border: 'none',
            borderRadius: 'var(--r-field, 4px)',
            cursor: loading ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
            transition: 'opacity 0.15s ease',
          }}
        >
          {loading ? '…' : "M'assigner"}
        </button>
      )}
    </div>
  );
}
