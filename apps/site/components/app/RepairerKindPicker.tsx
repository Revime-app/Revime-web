'use client';

import { IconArrowRight, IconBriefcase, IconUser } from './icons';

export type RepairerKind = 'INDIVIDUAL' | 'PRO';

/** The app's RepairerKindPicker: Particulier or Professionnel, word for word. */
export function RepairerKindPicker({ onChoose, disabled }: { onChoose: (kind: RepairerKind) => void; disabled?: boolean }) {
  const option = (kind: RepairerKind, title: string, meta: [string, string]) => {
    const Icon = kind === 'PRO' ? IconBriefcase : IconUser;
    return (
      <button type="button" className="ap-kind" disabled={disabled} onClick={() => onChoose(kind)}>
        <span className="ap-kind__row">
          <span className="ap-kind__ic">
            <Icon size={18} />
          </span>
          <strong>{title}</strong>
          <IconArrowRight size={18} />
        </span>
        <span className="ap-kind__meta">
          {meta[0]}
          <br />
          {meta[1]}
        </span>
      </button>
    );
  };
  return (
    <div className="ap-kinds">
      {option('INDIVIDUAL', 'Particulier', ['Réparations occasionnelles.', 'Vérification CNI requise.'])}
      {option('PRO', 'Professionnel', ['Entreprise / Auto-ent.', 'SIRET + CNI requis.'])}
    </div>
  );
}
