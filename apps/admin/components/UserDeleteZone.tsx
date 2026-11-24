import React from 'react';
import { Trash2 } from 'lucide-react';
import { Icon } from './Icon';

/**
 * « Supprimer le compte » sits in a collapsed section, like « Suspendre » and « Modérer » above it.
 * Those sections change height when opened, and a click aimed at one of them once landed on a
 * full-width red delete button that had moved under the cursor.
 */
export function UserDeleteZone({ busy, onOpen }: { busy: boolean; onOpen: () => void }) {
  return (
    <details style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--line, #dfe2e2)' }}>
      <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--red-text, #bd0e26)' }}>
        Zone dangereuse
      </summary>
      <div style={{ marginTop: '0.75rem' }}>
        <button
          type="button"
          data-testid="open-delete-user-modal"
          onClick={onOpen}
          disabled={busy}
          style={{
            backgroundColor: 'var(--badge-danger-bg)',
            color: 'var(--red, #f61b39)',
            border: '1px solid var(--badge-danger-border)',
            borderRadius: '8px',
            padding: '9px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
            width: '100%',
            textAlign: 'center',
          }}
        >
          <Icon as={Trash2} /> Supprimer le compte
        </button>
      </div>
    </details>
  );
}
