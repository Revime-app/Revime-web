'use client';

import { useEffect, useState } from 'react';
import type { AdminOverview } from '@revime/shared';
import { DashboardOverview } from '../components/DashboardOverview';

type Data = { s: 'loading' } | { s: 'error' } | { s: 'loaded'; o: AdminOverview };

export default function DashboardPage() {
  const [data, setData] = useState<Data>({ s: 'loading' });

  useEffect(() => {
    let live = true;
    fetch('/api/proxy/admin/overview')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((o: AdminOverview) => live && setData({ s: 'loaded', o }))
      .catch(() => live && setData({ s: 'error' }));
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <h1>Tableau de bord</h1>

      {/* 🛑 A failed load must NEVER render zeros: a grid of 0s is indistinguishable
          from a healthy empty platform. Three states, no fallback numbers. */}
      {data.s === 'loading' && <p className="state">Chargement des indicateurs...</p>}
      {data.s === 'error' && (
        <p className="state state--error">
          Impossible de charger les indicateurs. Aucun chiffre n&apos;est affiché plutôt que
          d&apos;afficher des zéros trompeurs.
        </p>
      )}

      {data.s === 'loaded' && (
        <DashboardOverview o={data.o} />
      )}
    </>
  );
}
