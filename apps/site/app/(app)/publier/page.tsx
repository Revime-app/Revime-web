'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DEMANDE_DESCRIPTION_MIN,
  DEMANDE_TITLE_MIN,
  type CategoryDto,
  type CreateDemandeInput,
  type DemandeDto,
  type MeResponse,
  type SignPhotoResponse,
} from '@revime/shared';
import { api, errorMessage } from '../../../lib/client/api';
import { DEMO } from '../../../lib/client/config';
import { useSession } from '../../../lib/client/session';
import { modeBody, needsClientMode } from '../../../lib/client/mode';
import { useApi } from '../../../lib/client/use-api';
import { LoginForm } from '../../../components/app/LoginForm';
import { CategoryIcon, iconForLabel } from '../../../components/app/categories';
import { IconCamera, IconClose, IconPin, IconShieldCheck } from '../../../components/app/icons';
import { Loader } from '../../../components/app/ui';

const MAX_PHOTOS = 10;
const PARTS = [
  { value: 'UNKNOWN', label: 'Je ne sais pas' },
  { value: 'ORIGINAL', label: 'Pièce d’origine' },
  { value: 'COMPATIBLE', label: 'Pièce compatible' },
  { value: 'CLIENT_SUPPLIED', label: 'Je fournis la pièce' },
] as const;
type Parts = (typeof PARTS)[number]['value'];
type Photo = { key: string; file: File; preview: string };

/**
 * The bucket only takes JPEG and PNG (signPhotoSchema), and phones hand out HEIC or 12 MP files:
 * every photo is redrawn as a JPEG of at most 1600 px, which also keeps uploads small.
 */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg'))), 'image/jpeg', 0.85),
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="ap-fs">
      <legend>
        <span className="ap-fs__n">{n}</span> {title}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * Publishing is open to everyone: a visitor fills the whole form, and only « Publier » asks him to
 * sign in, in a sheet over the form so nothing he typed is lost. Photos stay on his device until
 * then, because the upload needs his account.
 */
function PublishForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { status, me, refresh } = useSession();
  // `publish` can run from the login sheet's callback, after a newer render: read `me` fresh.
  const meRef = useRef(me);
  meRef.current = me;
  const categories = useApi<CategoryDto[]>('/categories');
  const draftId = useMemo(() => crypto.randomUUID(), []);

  const [rootId, setRootId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [title, setTitle] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [description, setDescription] = useState('');
  const [parts, setParts] = useState<Parts>('UNKNOWN');
  const [mode, setMode] = useState<'OFFERS' | 'BUDGET'>('OFFERS');
  const [budget, setBudget] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [sending, setSending] = useState(false);
  const [askLogin, setAskLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const all = categories.data ?? [];
  const roots = all.filter((c) => c.parentId === null);
  const selected = all.find((c) => c.id === categoryId);

  // `?categorie=<slug>` from a category tile preselects it.
  useEffect(() => {
    const slug = search.get('categorie');
    const hit = slug ? all.find((c) => c.slug === slug) : undefined;
    if (hit && !categoryId) {
      setCategoryId(hit.parentId ? hit.id : '');
      setRootId(hit.parentId ?? hit.id);
    }
  }, [all, search, categoryId]);

  const activeRoot = rootId ?? selected?.parentId ?? null;
  const children = all.filter((c) => c.parentId === activeRoot);

  const problems = {
    category: !categoryId ? 'Choisissez une catégorie.' : null,
    title: title.trim().length < DEMANDE_TITLE_MIN ? 'Donnez un titre à votre demande.' : null,
    description:
      description.trim().length < DEMANDE_DESCRIPTION_MIN
        ? `Décrivez la panne en ${DEMANDE_DESCRIPTION_MIN} caractères au moins.`
        : null,
    place: !/^\d{5}$/.test(postalCode) || city.trim().length < 2 ? 'Indiquez votre code postal et votre ville.' : null,
    budget: mode === 'BUDGET' && !(Number(budget) > 0) ? 'Indiquez votre budget.' : null,
  };
  const valid = Object.values(problems).every((p) => p === null);
  const show = (k: keyof typeof problems) => (tried ? problems[k] : null);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files)
      .slice(0, MAX_PHOTOS - photos.length)
      .map((file) => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
    setPhotos((list) => [...list, ...next]);
  }

  async function publish() {
    setSending(true);
    setError(null);
    try {
      const photoPaths: string[] = [];
      if (!DEMO) {
        for (const p of photos) {
          const jpeg = await toJpeg(p.file);
          const signed = await api.post<SignPhotoResponse>('/demandes/photos/sign', { draftId, contentType: 'image/jpeg' });
          const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: jpeg });
          if (!put.ok) throw new Error('upload');
          photoPaths.push(signed.path);
        }
      }
      const input: CreateDemandeInput = {
        categoryId,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        title: title.trim(),
        description: description.trim(),
        parts,
        mode,
        budgetCents: mode === 'BUDGET' ? Math.round(Number(budget) * 100) : undefined,
        locationLabel: city.trim(),
        postalCode,
        photoPaths,
      };
      if (needsClientMode(meRef.current)) {
        // The API refuses a demande from an account in réparateur-only mode. Publishing is a
        // client action, so switch first, as the app's Paramètres would, and say so on the button.
        await api.patch<MeResponse>('/users/me/modes', modeBody('CLIENT'));
        await refresh();
      }
      const created = await api.post<DemandeDto>('/demandes', input);
      router.replace(`/mes-demandes/${created.id}?publiee=1`);
    } catch (e) {
      setError(e instanceof Error && e.message === 'upload' ? 'Une photo n’a pas pu être envoyée. Retirez-la et réessayez.' : errorMessage(e));
      setSending(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!valid) return;
    if (status !== 'in') setAskLogin(true);
    else void publish();
  }

  if (categories.loading) return <Loader />;

  return (
    <div className="ap-page ap-pubpage">
      <div className="ap-publish__head">
        <h1>Décrivez ce qu’il faut réparer</h1>
        <p>3 questions, environ 2 minutes. Gratuit et sans engagement : les réparateurs de votre zone vous envoient leurs offres. On vous demandera de vous connecter seulement au moment de publier, sans rien perdre.</p>
      </div>

      <form className="ap-publish__grid" onSubmit={submit} noValidate>
        <div className="ap-stack">
          <Section n={1} title="L’objet">
            <div className="ap-chips ap-chips--wrap" role="radiogroup" aria-label="Famille d’objets">
              {roots.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="ap-chip"
                  aria-pressed={r.id === activeRoot}
                  onClick={() => {
                    setRootId(r.id);
                    if (selected?.parentId !== r.id) setCategoryId('');
                  }}
                >
                  {r.labelFr}
                </button>
              ))}
            </div>
            {activeRoot && (
              <div className="ap-options" role="radiogroup" aria-label="Catégorie">
                {children.map((c) => (
                  <label key={c.id} className="ap-option" data-on={c.id === categoryId || undefined}>
                    <input type="radio" name="categorie" checked={c.id === categoryId} onChange={() => setCategoryId(c.id)} />
                    <CategoryIcon path={iconForLabel(c.labelFr)} size={20} />
                    {c.labelFr}
                  </label>
                ))}
              </div>
            )}
            {show('category') && <p className="ap-error">{show('category')}</p>}
            <div className="ap-field">
              <span>
                Photos <em>facultatif, {MAX_PHOTOS} au maximum</em>
              </span>
              <div className="ap-photos">
                {photos.map((p) => (
                  <span key={p.key} className="ap-photo">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt="" />
                    <button
                      type="button"
                      aria-label="Retirer la photo"
                      onClick={() => setPhotos((list) => list.filter((x) => x.key !== p.key))}
                    >
                      <IconClose size={14} />
                    </button>
                  </span>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <label className="ap-photo ap-photo--add">
                    <IconCamera size={22} />
                    <span>Ajouter</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        addPhotos(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              <p className="ap-hint">Une photo de la panne aide les réparateurs à vous faire un prix juste.</p>
            </div>
          </Section>

          <Section n={2} title="La panne">
            <label className="ap-field">
              <span>En quelques mots</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ex. Écran fissuré"
                maxLength={120}
                aria-invalid={Boolean(show('title'))}
              />
            </label>
            {show('title') && <p className="ap-error">{show('title')}</p>}
            <label className="ap-field">
              <span>Ce qui s’est passé</span>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Quand la panne est apparue, ce que vous avez déjà essayé."
                maxLength={2000}
                aria-invalid={Boolean(show('description'))}
              />
            </label>
            {show('description') && <p className="ap-error">{show('description')}</p>}
            <details className="ap-moredetails">
              <summary>
                Plus de détails <em>(facultatif : marque, modèle, pièces)</em>
              </summary>
            <div className="ap-row2">
              <label className="ap-field">
                <span>
                  Marque <em>facultatif</em>
                </span>
                <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="ex. Apple" maxLength={60} />
              </label>
              <label className="ap-field">
                <span>
                  Modèle <em>facultatif</em>
                </span>
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="ex. iPhone 13" maxLength={60} />
              </label>
            </div>
            <div className="ap-field">
              <span>Pièces</span>
              <div className="ap-chips ap-chips--wrap" role="radiogroup" aria-label="Pièces">
                {PARTS.map((p) => (
                  <button type="button" key={p.value} className="ap-chip" aria-pressed={p.value === parts} onClick={() => setParts(p.value)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            </details>
          </Section>

          <Section n={3} title="Où et comment">
            <div className="ap-row2">
              <label className="ap-field">
                <span>Code postal</span>
                <input
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={5}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="ex. 69003"
                />
              </label>
              <label className="ap-field">
                <span>Ville</span>
                <input autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} placeholder="ex. Lyon" maxLength={120} />
              </label>
            </div>
            {show('place') && <p className="ap-error">{show('place')}</p>}
            <div className="ap-options ap-options--2" role="radiogroup" aria-label="Prix">
              <label className="ap-option ap-option--big" data-on={mode === 'OFFERS' || undefined}>
                <input type="radio" name="mode" checked={mode === 'OFFERS'} onChange={() => setMode('OFFERS')} />
                <strong>Je reçois des offres</strong>
                <span>Les réparateurs proposent leur prix.</span>
              </label>
              <label className="ap-option ap-option--big" data-on={mode === 'BUDGET' || undefined}>
                <input type="radio" name="mode" checked={mode === 'BUDGET'} onChange={() => setMode('BUDGET')} />
                <strong>J’ai un budget</strong>
                <span>Vous indiquez un montant maximum.</span>
              </label>
            </div>
            {mode === 'BUDGET' && (
              <label className="ap-field ap-field--short">
                <span>Votre budget (€)</span>
                <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(',', '.'))} placeholder="ex. 80" />
              </label>
            )}
            {show('budget') && <p className="ap-error">{show('budget')}</p>}
          </Section>
        </div>

        <aside className="ap-publish__aside">
          <p className="ap-publish__label">Ce que verront les réparateurs</p>
          <div className="ap-preview">
            <span className="ap-tile__media">
              {photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[0].preview} alt="" />
              ) : (
                <span className="ap-tile__icon">
                  <CategoryIcon path={iconForLabel(selected?.labelFr ?? '')} size={30} />
                </span>
              )}
            </span>
            <span className="ap-tile__body">
              <span className="ap-tile__cat">{selected?.labelFr ?? 'Catégorie'}</span>
              <span className="ap-tile__title">{title.trim() || 'Votre titre'}</span>
              <span className="ap-tile__meta">
                <IconPin size={14} /> {city.trim() || 'Votre ville'}
              </span>
              {description.trim() && <span className="ap-preview__desc">{description.trim()}</span>}
            </span>
          </div>
          <p className="ap-hint">
            <IconShieldCheck size={14} /> Votre nom et votre adresse restent cachés jusqu’à ce que vous choisissiez une offre.
          </p>
          {error && (
            <p className="ap-error" role="alert">
              {error}
            </p>
          )}
          <button className="ap-btn ap-btn--primary ap-btn--block ap-publish__go" disabled={sending}>
            {sending ? 'Publication…' : 'Publier ma demande'}
          </button>
          {status === 'out' && <p className="ap-hint ap-center-text">On vous demandera de vous connecter juste avant.</p>}
          {needsClientMode(me) && (
            <p className="ap-hint ap-center-text">
              Vous êtes en mode réparateur : en publiant, votre compte passe en mode client, ici et dans l’appli.
            </p>
          )}
        </aside>
      </form>

      {askLogin && (
        <div className="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="login-title" onClick={() => setAskLogin(false)}>
          <div className="ap-sheet__panel" onClick={(e) => e.stopPropagation()}>
            <button className="ap-sheet__close" aria-label="Fermer" onClick={() => setAskLogin(false)}>
              <IconClose size={18} />
            </button>
            <h2 id="login-title">Connectez-vous pour publier</h2>
            <p className="ap-muted">Votre demande est prête : elle part dès que vous êtes connecté.</p>
            <LoginForm
              onDone={() => {
                setAskLogin(false);
                void publish();
              }}
            />
          </div>
        </div>
      )}
      <p className="ap-hint ap-center-text">
        En publiant, vous acceptez les <Link href="/cgu">conditions d’utilisation</Link>.
      </p>
    </div>
  );
}

export default function PublierPage() {
  return (
    <Suspense fallback={<Loader />}>
      <PublishForm />
    </Suspense>
  );
}
