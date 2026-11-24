'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminDemandeListResponse, CategoryDto } from '@revime/shared';
import { DEMANDE_STATUS_LABEL } from '@revime/shared';
import { demandeTypeLabel } from '../../lib/quote-admin';

type View =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'loaded'; data: AdminDemandeListResponse };

/**
 * 🛑 The state column is not decoration. A demande removed by its own author (CF-16) and one
 * removed by an operator both carry `deletedAt`, so the row renders `state` AND
 * `removedByAdmin` - « supprimée par le client » against « supprimée par l'équipe ». Reading
 * only `state` would attribute a client's own decision to us.
 */
const STATE_LABEL: Record<AdminDemandeListResponse['items'][number]['state'], string> = {
  visible: 'Visible',
  masquee: 'Masquée',
  supprimee: 'Supprimée',
};

export default function DemandesPage() {
  const [view, setView] = useState<View>({ state: 'loading' });
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [etat, setEtat] = useState('');
  const [type, setType] = useState('');
  const [categorie, setCategorie] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setView({ state: 'loading' });
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (statut) params.set('statut', statut);
    if (etat) params.set('etat', etat);
    if (type) params.set('type', type);
    if (categorie) params.set('categorie', categorie);
    if (du) params.set('du', du);
    if (au) params.set('au', au);
    params.set('page', String(page));

    try {
      const r = await fetch(`/api/proxy/admin/demandes?${params.toString()}`);
      // 🛑 No `?? []`. A failed fetch must never render as an empty list.
      if (!r.ok) {
        setView({ state: 'error' });
        return;
      }
      setView({ state: 'loaded', data: (await r.json()) as AdminDemandeListResponse });
    } catch {
      setView({ state: 'error' });
    }
  }, [q, statut, etat, type, categorie, du, au, page]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const initialQ = search.get('q');
    const rawStatut = (search.get('statut') || '').toUpperCase();
    let initialStatut = '';
    if (rawStatut === 'EN_COURS' || rawStatut === 'IN_PROGRESS') initialStatut = 'IN_PROGRESS';
    else if (rawStatut === 'TERMINEE' || rawStatut === 'DONE') initialStatut = 'DONE';
    else if (rawStatut === 'OUVERTE' || rawStatut === 'OPEN') initialStatut = 'OPEN';
    else if (rawStatut === 'ANNULEE' || rawStatut === 'CANCELLED') initialStatut = 'CANCELLED';
    if (initialQ) setQ(initialQ);
    if (initialStatut) setStatut(initialStatut);

    const rawEtat = (search.get('etat') || '').toLowerCase();
    if (['visible', 'masquee', 'supprimee'].includes(rawEtat)) {
      setEtat(rawEtat);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    async function loadCategories() {
      try {
        const r = await fetch('/api/proxy/admin/categories');
        if (r.ok) {
          setCategories((await r.json()) as CategoryDto[]);
        }
      } catch {
        // Failed to load categories; the filter will show only "Toutes les catégories"
      }
    }
    void loadCategories();
  }, []);

  return (
    <div className="page page--wide">
      <h1>Demandes</h1>

      <div className="filters">
        <input
          type="search"
          value={q}
          placeholder="Titre, description, marque ou modèle"
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          value={statut}
          onChange={(e) => {
            setPage(1);
            setStatut(e.target.value);
          }}
        >
          <option value="">Tous les statuts</option>
          <option value="OPEN">Ouverte</option>
          <option value="IN_PROGRESS">En cours</option>
          <option value="DONE">Terminée</option>
          <option value="CANCELLED">Annulée</option>
        </select>
        <select
          value={etat}
          onChange={(e) => {
            setPage(1);
            setEtat(e.target.value);
          }}
        >
          <option value="">Tous les états</option>
          <option value="visible">Visible</option>
          <option value="masquee">Masquée</option>
          <option value="supprimee">Supprimée</option>
        </select>
        <select
          aria-label="Type"
          value={type}
          onChange={(e) => {
            setPage(1);
            setType(e.target.value);
          }}
        >
          <option value="">Tous les types</option>
          <option value="publique">Publique</option>
          <option value="devis">Demande de devis privée</option>
        </select>
        <select
          value={categorie}
          onChange={(e) => {
            setPage(1);
            setCategorie(e.target.value);
          }}
        >
          <option value="">Toutes les catégories</option>
          {categories.map((cat) => {
            const parent = cat.parentId ? categories.find((p) => p.id === cat.parentId) : null;
            const label = parent ? `${parent.labelFr} > ${cat.labelFr}` : cat.labelFr;
            return (
              <option key={cat.id} value={cat.id}>
                {label}
              </option>
            );
          })}
        </select>
        <div className="filters__range" role="group" aria-label="Date de création">
          <label htmlFor="demandes-du">Du</label>
          <input
            id="demandes-du"
            type="date"
            value={du}
            onChange={(e) => {
              setPage(1);
              setDu(e.target.value);
            }}
          />
          <label htmlFor="demandes-au">Au</label>
          <input
            id="demandes-au"
            type="date"
            value={au}
            onChange={(e) => {
              setPage(1);
              setAu(e.target.value);
            }}
          />
        </div>
      </div>

      {view.state === 'loading' && <p>Chargement…</p>}

      {view.state === 'error' && (
        <p role="alert" style={{ color: 'red' }}>
          Impossible de charger les demandes.
        </p>
      )}

      {view.state === 'loaded' && view.data.items.length === 0 && view.data.total === 0 && (
        <p>Aucune demande ne correspond à ces critères.</p>
      )}

      {view.state === 'loaded' && view.data.items.length === 0 && view.data.total > 0 && (
        <p>Aucune demande sur cette page. Réduisez le numéro de page.</p>
      )}

      {view.state === 'loaded' && view.data.items.length > 0 && (
        <>
          <p>
            {view.data.total} demande(s) · page {view.data.page}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Type</th>
                <th>Catégorie</th>
                <th>Statut</th>
                <th>État</th>
                <th>Auteur</th>
                <th>Offres</th>
                <th>Créée le</th>
              </tr>
            </thead>
            <tbody>
              {view.data.items.map((d) => (
                <tr key={d.demandeId}>
                  <td>
                    <Link href={`/demandes/${d.demandeId}`}>{d.title}</Link>
                  </td>
                  <td>{demandeTypeLabel(d)}</td>
                  <td>{d.categoryLabelFr}</td>
                  <td>{DEMANDE_STATUS_LABEL[d.status]}</td>
                  <td>
                    {STATE_LABEL[d.state]}
                    {d.state !== 'visible' && (d.removedByAdmin ? " par l'équipe" : ' par le client')}
                  </td>
                  <td>
                    <Link href={`/utilisateurs/${d.authorUserId}`}>{d.authorName}</Link>
                  </td>
                  <td>{d.offerCount}</td>
                  <td>{new Date(d.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="filters">
            <button type="button" disabled={view.data.page <= 1} onClick={() => setPage((p) => p - 1)}>
              Précédent
            </button>
            <button
              type="button"
              disabled={view.data.page * view.data.pageSize >= view.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </div>
  );
}
