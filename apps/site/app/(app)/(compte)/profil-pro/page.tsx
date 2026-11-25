'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DAY_LABELS_FR,
  type AvailabilityDay,
  type CategoryDto,
  type DayOfWeek,
  type MeResponse,
} from '@revime/shared';
import { api, errorMessage } from '../../../../lib/client/api';
import { useRequireSession, useSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { Loader, PageTitle } from '../../../../components/app/ui';

/**
 * « Mon profil public », the app's `profil-public` screens on one page: the name and the
 * description clients read, the area, the specialities and the hours. Each block saves on its
 * own (`PATCH /users/me/repairer-profile`, `PATCH /users/me/repairer`, `PUT /users/me/categories`,
 * `PUT /users/me/availability`). Photo and banner are uploaded from the app.
 */
function useSave() {
  const { refresh } = useSession();
  const [state, setState] = useState<'idle' | 'busy' | 'ok'>('idle');
  const [error, setError] = useState<string | null>(null);
  async function save(fn: () => Promise<unknown>) {
    setState('busy');
    setError(null);
    try {
      await fn();
      await refresh();
      setState('ok');
      setTimeout(() => setState('idle'), 2200);
    } catch (e) {
      setError(errorMessage(e));
      setState('idle');
    }
  }
  return { state, error, save };
}

function SaveButton({ state }: { state: 'idle' | 'busy' | 'ok' }) {
  return (
    <button className={`ap-btn ap-btn--pro ap-savebtn${state === 'ok' ? ' is-ok' : ''}`} disabled={state === 'busy'}>
      {state === 'busy' ? 'Enregistrement…' : state === 'ok' ? '✓ Enregistré' : 'Enregistrer'}
    </button>
  );
}

function Identity({ me }: { me: MeResponse }) {
  const [displayName, setName] = useState(me.repairer?.displayName ?? '');
  const [bio, setBio] = useState(me.repairer?.bio ?? '');
  const s = useSave();
  return (
    <form className="ap-box ap-form" onSubmit={(e) => { e.preventDefault(); void s.save(() => api.patch('/users/me/repairer-profile', { displayName: displayName.trim(), bio: bio.trim() })); }}>
      <h2>Présentation</h2>
      <label className="ap-field">
        <span>Nom affiché</span>
        <small className="ap-field__hint">Votre nom ou celui de votre atelier.</small>
        <input value={displayName} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="ap-field">
        <span>Description</span>
        <small className="ap-field__hint">Ce que vous réparez, depuis quand, ce qui vous distingue. {bio.length}/600</small>
        <textarea rows={5} maxLength={600} value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>
      {s.error && <p className="ap-error" role="alert">{s.error}</p>}
      <SaveButton state={s.state} />
    </form>
  );
}

function Area({ me }: { me: MeResponse }) {
  const [postalCode, setPc] = useState(me.repairer?.postalCode ?? '');
  const [radius, setRadius] = useState<number>(me.repairer?.serviceRadiusKm ?? 10);
  const s = useSave();
  return (
    <form className="ap-box ap-form" onSubmit={(e) => { e.preventDefault(); void s.save(() => api.patch('/users/me/repairer', { postalCode: postalCode.trim(), serviceRadiusKm: radius })); }}>
      <h2>Zone d’intervention</h2>
      <label className="ap-field">
        <span>Code postal de l’atelier ou de votre domicile</span>
        <input inputMode="numeric" maxLength={5} value={postalCode} onChange={(e) => setPc(e.target.value.replace(/\D/g, ''))} />
      </label>
      <label className="ap-field">
        <span>Je me déplace jusqu’à <strong>{radius} km</strong></span>
        <input type="range" min={1} max={150} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="ap-range" style={{ '--p': `${(radius / 150) * 100}%` } as React.CSSProperties} />
      </label>
      {me.repairer?.serviceAreaLabel && <p className="ap-hint">Affiché aux clients : {me.repairer.serviceAreaLabel}</p>}
      {s.error && <p className="ap-error" role="alert">{s.error}</p>}
      <SaveButton state={s.state} />
    </form>
  );
}

function Categories({ me }: { me: MeResponse }) {
  const cats = useApi<CategoryDto[]>('/categories');
  const [picked, setPicked] = useState<Set<string>>(new Set(me.repairer?.categoryIds ?? []));
  const s = useSave();
  const roots = (cats.data ?? []).filter((c) => !c.parentId);
  const kids = (id: string) => (cats.data ?? []).filter((c) => c.parentId === id);
  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <form id="categories" className="ap-box ap-form" onSubmit={(e) => { e.preventDefault(); void s.save(() => api.put('/users/me/categories', { categoryIds: [...picked] })); }}>
      <h2>Ce que je répare</h2>
      <p className="ap-hint">Vous recevez les demandes de ces catégories. {picked.size} choisie{picked.size > 1 ? 's' : ''}.</p>
      {cats.loading && <Loader />}
      {roots.map((r) => (
        <fieldset key={r.id} className="ap-chips">
          <legend>{r.labelFr}</legend>
          {(kids(r.id).length ? kids(r.id) : [r]).map((c) => (
            <button key={c.id} type="button" aria-pressed={picked.has(c.id)} onClick={() => toggle(c.id)}>{c.labelFr}</button>
          ))}
        </fieldset>
      ))}
      {s.error && <p className="ap-error" role="alert">{s.error}</p>}
      <SaveButton state={s.state} />
    </form>
  );
}

const hm = (m: number | null) => (m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const toMin = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return Number.isFinite(h) ? (h ?? 0) * 60 + (m ?? 0) : null;
};

function Hours({ me }: { me: MeResponse }) {
  const initial: AvailabilityDay[] =
    me.repairer?.availability?.length === 7
      ? me.repairer.availability
      : ([1, 2, 3, 4, 5, 6, 7] as const).map((d) => ({ dayOfWeek: d, closed: d >= 6, opensAt: d >= 6 ? null : 540, closesAt: d >= 6 ? null : 1080 }));
  const [days, setDays] = useState<AvailabilityDay[]>(initial);
  const s = useSave();
  const set = (i: number, patch: Partial<AvailabilityDay>) => setDays((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <form className="ap-box ap-form" onSubmit={(e) => { e.preventDefault(); void s.save(() => api.put('/users/me/availability', { days })); }}>
      <h2>Horaires</h2>
      <div className="ap-hours">
        {days.map((d, i) => (
          <div key={d.dayOfWeek} className="ap-hours__row" data-closed={d.closed || undefined}>
            <span>{DAY_LABELS_FR[d.dayOfWeek as DayOfWeek]}</span>
            <label className="ap-switch">
              <input type="checkbox" checked={!d.closed} onChange={(e) => set(i, e.target.checked ? { closed: false, opensAt: 540, closesAt: 1080 } : { closed: true, opensAt: null, closesAt: null })} />
              <span aria-hidden="true" />
              <small>{d.closed ? 'Fermé' : 'Ouvert'}</small>
            </label>
            {!d.closed && (
              <span className="ap-hours__times">
                <input type="time" aria-label="Ouverture" value={hm(d.opensAt)} onChange={(e) => set(i, { opensAt: toMin(e.target.value) })} />
                <span>–</span>
                <input type="time" aria-label="Fermeture" value={hm(d.closesAt)} onChange={(e) => set(i, { closesAt: toMin(e.target.value) })} />
              </span>
            )}
          </div>
        ))}
      </div>
      {s.error && <p className="ap-error" role="alert">{s.error}</p>}
      <SaveButton state={s.state} />
    </form>
  );
}

function ProfilePro() {
  const me = useRequireSession();
  const welcome = useSearchParams().get('bienvenue') === '1';
  useEffect(() => {
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  if (!me) return <Loader />;
  if (!me.repairer) {
    return (
      <div className="ap-page">
        <PageTitle title="Mon profil public" />
        <div className="ap-empty">
          <strong>Activez d’abord le mode réparateur</strong>
          <span>Choisissez « Réparateur » dans le sélecteur de mode, puis votre statut.</span>
          <Link href="/parametres" className="ap-btn ap-btn--pro">Changer de mode</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="ap-page">
      <PageTitle title="Mon profil public" sub="Ce que les clients voient avant de vous choisir">
        <Link href={`/reparateurs/${me.id}`} className="ap-btn ap-btn--secondary ap-btn--sm">Voir ma page</Link>
      </PageTitle>
      {welcome && (
        <div className="ap-published">
          <h2>Bienvenue côté réparateur</h2>
          <p>Trois choses pour recevoir vos premières demandes : votre zone, ce que vous réparez, et vos versements (depuis le tableau de bord).</p>
        </div>
      )}
      <div className="ap-proform">
        <Identity me={me} />
        <Area me={me} />
        <Categories me={me} />
        <Hours me={me} />
      </div>
      <p className="ap-hint">La photo et la bannière se changent dans l’appli REVIME.</p>
    </div>
  );
}

export default function ProfileProPage() {
  return (
    <Suspense fallback={<Loader />}>
      <ProfilePro />
    </Suspense>
  );
}
