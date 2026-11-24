'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DEMANDE_DESCRIPTION_MIN,
  DEMANDE_TITLE_MIN,
  type CategoryDto,
  type CreateDemandeInput,
  type DemandeDto,
  type SignPhotoResponse,
} from '@revime/shared';
import { api, errorMessage } from '../../../lib/client/api';
import { DEMO } from '../../../lib/client/config';
import { useApi } from '../../../lib/client/use-api';
import { Loader, ScreenTitle } from '../../../components/espace/ui';
import { IconCamera, IconClose } from '../../../components/espace/icons';

const STEPS = ['Objet', 'Problème', 'Où et comment', 'Vérification'] as const;
const MAX_PHOTOS = 10;

const PARTS = [
  { value: 'UNKNOWN', label: 'Je ne sais pas' },
  { value: 'ORIGINAL', label: "Pièce d'origine" },
  { value: 'COMPATIBLE', label: 'Pièce compatible' },
  { value: 'CLIENT_SUPPLIED', label: 'Je fournis la pièce' },
] as const;
type Parts = (typeof PARTS)[number]['value'];

type Photo = { key: string; preview: string; state: 'uploading' | 'done' | 'error'; path?: string };

/**
 * The bucket only takes JPEG and PNG (signPhotoSchema), and phones hand out HEIC or 12 MP files.
 * Every picked image is redrawn as a JPEG of at most 1600 px, which also keeps uploads small.
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

function Wizard() {
  const router = useRouter();
  const search = useSearchParams();
  const categories = useApi<CategoryDto[]>('/categories');
  const draftId = useMemo(() => crypto.randomUUID(), []);

  const [step, setStep] = useState(1);
  const [categoryId, setCategoryId] = useState(search.get('categorie') ?? '');
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
  const [error, setError] = useState<string | null>(null);

  const all = categories.data ?? [];
  const roots = all.filter((c) => c.parentId === null);
  const selected = all.find((c) => c.id === categoryId);
  const [openRoot, setOpenRoot] = useState<string | null>(null);
  const rootId = openRoot ?? selected?.parentId ?? roots[0]?.id ?? null;
  const children = all.filter((c) => c.parentId === rootId);

  const uploading = photos.some((p) => p.state === 'uploading');
  const canContinue =
    step === 1
      ? Boolean(categoryId) && title.trim().length >= DEMANDE_TITLE_MIN && !uploading
      : step === 2
        ? description.trim().length >= DEMANDE_DESCRIPTION_MIN
        : step === 3
          ? /^\d{5}$/.test(postalCode) && city.trim().length >= 2 && (mode === 'OFFERS' || Number(budget) > 0)
          : true;

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    for (const file of Array.from(files).slice(0, room)) {
      const key = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      setPhotos((list) => [...list, { key, preview, state: 'uploading' }]);
      try {
        let path = `demo/${key}.jpg`;
        if (!DEMO) {
          const jpeg = await toJpeg(file);
          const signed = await api.post<SignPhotoResponse>('/demandes/photos/sign', {
            draftId,
            contentType: 'image/jpeg',
          });
          const put = await fetch(signed.uploadUrl, {
            method: 'PUT',
            headers: { 'content-type': 'image/jpeg' },
            body: jpeg,
          });
          if (!put.ok) throw new Error('upload');
          path = signed.path;
        }
        setPhotos((list) => list.map((p) => (p.key === key ? { ...p, state: 'done', path } : p)));
      } catch {
        setPhotos((list) => list.map((p) => (p.key === key ? { ...p, state: 'error' } : p)));
      }
    }
  }

  async function publish() {
    setSending(true);
    setError(null);
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
      photoPaths: photos.filter((p) => p.state === 'done' && p.path).map((p) => p.path!),
    };
    try {
      const created = await api.post<DemandeDto>('/demandes', input);
      router.replace(`/demande/${created.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setSending(false);
    }
  }

  if (categories.loading) return <Loader />;

  return (
    <div className="esp-page esp-wizard">
      <ScreenTitle title="Publier une demande" sub={`Étape ${step} sur 4 · ${STEPS[step - 1]}`} />
      <div className="esp-wizard__bar" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={i < step ? 'is-on' : undefined} />
        ))}
      </div>

      {step === 1 && (
        <div className="esp-form">
          <fieldset>
            <legend className="esp-label">Catégorie</legend>
            <div className="esp-chips esp-chips--wrap">
              {roots.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className={r.id === rootId ? 'esp-chip is-on' : 'esp-chip'}
                  onClick={() => setOpenRoot(r.id)}
                >
                  {r.labelFr}
                </button>
              ))}
            </div>
            <div className="esp-options">
              {children.map((c) => (
                <label key={c.id} className={c.id === categoryId ? 'esp-option is-on' : 'esp-option'}>
                  <input
                    type="radio"
                    name="categorie"
                    value={c.id}
                    checked={c.id === categoryId}
                    onChange={() => setCategoryId(c.id)}
                  />
                  {c.labelFr}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="esp-row2">
            <Field label="Marque" optional>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="ex. Apple" maxLength={60} />
            </Field>
            <Field label="Modèle" optional>
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="ex. iPhone 13" maxLength={60} />
            </Field>
          </div>
          <Field label="Titre de la demande">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex. Écran iPhone 13 fissuré"
              maxLength={120}
            />
          </Field>
          <div>
            <p className="esp-label">
              Photos <span className="esp-muted">(facultatif, {MAX_PHOTOS} au maximum)</span>
            </p>
            <div className="esp-photos">
              {photos.map((p) => (
                <span key={p.key} className={`esp-photo esp-photo--${p.state}`}>
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
                <label className="esp-photo esp-photo--add">
                  <IconCamera size={22} />
                  <span>Ajouter</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      void addPhotos(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            {photos.some((p) => p.state === 'error') && (
              <p className="esp-error esp-small">Une photo n’a pas pu être envoyée. Retirez-la et réessayez.</p>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="esp-form">
          <Field label="Description du problème">
            <textarea
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez la panne, quand elle est apparue, ce que vous avez déjà tenté."
              maxLength={2000}
            />
          </Field>
          <fieldset>
            <legend className="esp-label">Pièces</legend>
            <div className="esp-options esp-options--2">
              {PARTS.map((p) => (
                <label key={p.value} className={p.value === parts ? 'esp-option is-on' : 'esp-option'}>
                  <input type="radio" name="pieces" checked={p.value === parts} onChange={() => setParts(p.value)} />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {step === 3 && (
        <div className="esp-form">
          <fieldset>
            <legend className="esp-label">Comment voulez-vous recevoir les prix ?</legend>
            <div className="esp-options esp-options--2">
              <label className={mode === 'OFFERS' ? 'esp-option esp-option--big is-on' : 'esp-option esp-option--big'}>
                <input type="radio" name="mode" checked={mode === 'OFFERS'} onChange={() => setMode('OFFERS')} />
                <strong>Je reçois des offres</strong>
                <span className="esp-muted">Les réparateurs proposent leur prix.</span>
              </label>
              <label className={mode === 'BUDGET' ? 'esp-option esp-option--big is-on' : 'esp-option esp-option--big'}>
                <input type="radio" name="mode" checked={mode === 'BUDGET'} onChange={() => setMode('BUDGET')} />
                <strong>J’indique mon budget</strong>
                <span className="esp-muted">Les réparateurs savent ce que vous voulez mettre.</span>
              </label>
            </div>
          </fieldset>
          {mode === 'BUDGET' && (
            <Field label="Votre budget (€)">
              <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(',', '.'))} placeholder="ex. 80" />
            </Field>
          )}
          <div className="esp-row2">
            <Field label="Code postal">
              <input
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))}
                placeholder="ex. 69003"
              />
            </Field>
            <Field label="Ville">
              <input autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} placeholder="ex. Lyon" maxLength={120} />
            </Field>
          </div>
          <p className="esp-muted esp-small">Seule la ville est montrée aux réparateurs, jamais votre adresse.</p>
        </div>
      )}

      {step === 4 && (
        <dl className="esp-card esp-facts esp-recap">
          <dt>Catégorie</dt>
          <dd>{selected?.labelFr}</dd>
          {(brand || model) && (
            <>
              <dt>Objet</dt>
              <dd>{[brand, model].filter(Boolean).join(' ')}</dd>
            </>
          )}
          <dt>Titre</dt>
          <dd>{title}</dd>
          <dt>Problème</dt>
          <dd>{description}</dd>
          <dt>Pièces</dt>
          <dd>{PARTS.find((p) => p.value === parts)?.label}</dd>
          <dt>Mode</dt>
          <dd>{mode === 'OFFERS' ? 'Je reçois des offres' : `Budget de ${budget} €`}</dd>
          <dt>Localisation</dt>
          <dd>
            {city} · {postalCode}
          </dd>
          <dt>Photos</dt>
          <dd>{photos.filter((p) => p.state === 'done').length} photo(s)</dd>
        </dl>
      )}

      {error && <p className="esp-error">{error}</p>}

      <div className="esp-wizard__nav">
        {step > 1 && (
          <button className="esp-btn esp-btn--secondary" onClick={() => setStep((s) => s - 1)} disabled={sending}>
            Retour
          </button>
        )}
        {step < 4 ? (
          <button className="esp-btn esp-btn--primary" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            Continuer
          </button>
        ) : (
          <button className="esp-btn esp-btn--primary" onClick={publish} disabled={sending}>
            {sending ? 'Publication…' : 'Publier ma demande'}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, optional = false, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="esp-field">
      <span className="esp-label">
        {label} {optional && <span className="esp-muted">(facultatif)</span>}
      </span>
      {children}
    </label>
  );
}

export default function PublierPage() {
  return (
    <Suspense fallback={<Loader />}>
      <Wizard />
    </Suspense>
  );
}
