'use client';

import React, { useState } from 'react';
import type { AdminUserInternalNote } from '@revime/shared';

interface UserInternalNotesProps {
  userId: string;
  notes: AdminUserInternalNote[];
  busy: boolean;
  onAddNote: (content: string) => Promise<void>;
}

export function UserInternalNotes({
  userId,
  notes,
  busy,
  onAddNote,
}: UserInternalNotesProps) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length < 2) {
      setError('La note doit comporter au moins 2 caractères.');
      return;
    }
    if (trimmed.length > 2000) {
      setError('La note ne peut pas dépasser 2000 caractères.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onAddNote(trimmed);
      setContent('');
    } catch (err: any) {
      setError(err?.message || "Erreur lors de l'ajout de la note.");
    } finally {
      setSubmitting(false);
    }
  }

  const isFormDisabled = busy || submitting;

  return (
    <div
      className="card"
      data-testid="user-internal-notes"
      style={{
        marginBottom: '1.5rem',
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: '12px',
        padding: '20px',
        fontFamily: 'var(--font-google-sans), Arial, sans-serif',
      }}
    >
      <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '1rem', color: 'var(--navy-text, #25324f)' }}>
        Notes internes
      </h2>

      {/* Notes List */}
      <div style={{ marginBottom: '1.5rem', maxHeight: '320px', overflowY: 'auto' }}>
        {notes.length === 0 ? (
          <p style={{ color: 'var(--muted, #6b7280)', fontSize: '13px', margin: 0 }}>
            Aucune note interne pour cet utilisateur.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {notes.map((note) => (
              <div
                key={note.id}
                data-testid={`internal-note-${note.id}`}
                style={{
                  backgroundColor: 'var(--badge-neutral-bg)',
                  border: '1px solid var(--line, #dfe2e2)',
                  borderRadius: '8px',
                  padding: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: '6px',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--navy-text, #25324f)' }}>
                    {note.authorName}{' '}
                    <span style={{ fontWeight: 400, color: 'var(--muted, #6b7280)' }}>
                      ({note.authorEmail})
                    </span>
                  </span>
                  <span style={{ color: 'var(--muted, #6b7280)', fontSize: '11px' }}>
                    {new Date(note.createdAt).toLocaleString('fr-FR')}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    lineHeight: '1.4',
                    color: 'var(--ink, #141414)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {note.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Note Form */}
      <form onSubmit={handleSubmit}>
        <label
          htmlFor="new-internal-note"
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '6px',
            color: 'var(--navy-text, #25324f)',
          }}
        >
          Ajouter une note :
        </label>
        <textarea
          id="new-internal-note"
          data-testid="internal-note-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Renseignez une observation interne..."
          rows={3}
          disabled={isFormDisabled}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid var(--line, #dfe2e2)',
            fontSize: '13px',
            fontFamily: 'inherit',
            resize: 'vertical',
            marginBottom: '6px',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', color: content.length > 2000 ? 'var(--red, #f61b39)' : 'var(--muted, #6b7280)' }}>
            {content.length}/2000 caractères
          </span>
          {error && (
            <span role="alert" style={{ fontSize: '12px', color: 'var(--red, #f61b39)' }}>
              {error}
            </span>
          )}
        </div>

        <button
          type="submit"
          data-testid="submit-internal-note"
          disabled={isFormDisabled || content.trim().length < 2 || content.length > 2000}
          style={{
            backgroundColor: 'var(--navy, #25324f)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: isFormDisabled || content.trim().length < 2 ? 'not-allowed' : 'pointer',
            opacity: isFormDisabled || content.trim().length < 2 ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          {submitting ? 'Enregistrement...' : 'Enregistrer la note'}
        </button>
      </form>
    </div>
  );
}
