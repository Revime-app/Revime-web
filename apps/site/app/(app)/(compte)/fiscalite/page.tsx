'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fiscalDeclarationInputSchema, type FiscalPreFillResponse } from '@revime/shared';
import { api, errorMessage } from '../../../../lib/client/api';
import { useRequireSession, useSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { Loader, PageTitle } from '../../../../components/app/ui';

/** The app's « Informations fiscales » (fiscalite.tsx), DAC7: same fields, same schema, same endpoint. */
export default function FiscalitePage() {
  const me = useRequireSession();
  const { refresh } = useSession();
  const router = useRouter();
  const pre = useApi<FiscalPreFillResponse>(me ? '/users/me/fiscal' : null);
  const [addressLine, setAddressLine] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [nif, setNif] = useState('');
  const [hasNoNif, setHasNoNif] = useState(false);
  const [birthCity, setBirthCity] = useState('');
  const [birthCountry, setBirthCountry] = useState('France');
  const [birthDate, setBirthDate] = useState('');
  const [attestation, setAttestation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = pre.data?.declaration;
    if (!d) return;
    setAddressLine(d.addressLine || '');
    setPostalCode(d.postalCode || '');
    setCity(d.city || '');
    setNif(d.nif || '');
    setHasNoNif(d.hasNoNif || false);
    setBirthCity(d.birthCity || '');
    setBirthCountry(d.birthCountry || 'France');
  }, [pre.data?.declaration]);

  if (!me || pre.loading) return <Loader text="Chargement de vos informations…" />;

  const legalName = pre.data?.legalName || (me.firstName && me.lastName ? `${me.firstName} ${me.lastName}` : me.name);
  const locked = Boolean(pre.data?.isBirthDateLocked && pre.data?.birthDate);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!locked && !birthDate.trim()) {
      setError('Veuillez renseigner votre date de naissance (format AAAA-MM-JJ).');
      return;
    }
    const parsed = fiscalDeclarationInputSchema.safeParse({
      addressLine,
      postalCode,
      city,
      country: 'FR',
      hasNoNif,
      nif: hasNoNif ? null : nif,
      birthCity: hasNoNif ? birthCity : null,
      birthCountry: hasNoNif ? birthCountry : null,
      birthDate: locked ? null : birthDate.trim(),
      attestation,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Vérifiez les informations saisies.');
      return;
    }
    setBusy(true);
    try {
      await api.put('/users/me/fiscal', parsed.data);
      await refresh();
      router.replace('/statut-verification');
    } catch (err) {
      setError(errorMessage(err) || "Une erreur est survenue lors de l'enregistrement de vos informations fiscales.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-page ap-narrow" data-mode="pro">
      <PageTitle title="Informations fiscales" back="/statut-verification" />
      <div className="ap-box">
        <h2>Déclaration fiscale annuelle (DAC7)</h2>
        <p className="ap-muted">
          Conformément à la directive européenne DAC7, les plateformes collaboratives sont tenues de collecter et déclarer
          chaque année les revenus perçus par leurs utilisateurs.
        </p>
      </div>
      <form className="ap-form" onSubmit={submit}>
        <h2 className="ap-eyebrow-h">Identité légale</h2>
        <dl className="ap-box ap-kv">
          <div>
            <dt>Nom complet</dt>
            <dd>{legalName}</dd>
          </div>
          {locked && (
            <div>
              <dt>Date de naissance</dt>
              <dd>{pre.data?.birthDate}</dd>
            </div>
          )}
        </dl>
        {!locked && (
          <label className="ap-field">
            <span>Date de naissance</span>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            <small className="ap-field__hint">Requis pour la déclaration fiscale (18 ans ou plus).</small>
          </label>
        )}

        <h2 className="ap-eyebrow-h">Adresse de résidence fiscale</h2>
        <label className="ap-field">
          <span>Adresse (numéro et voie)</span>
          <input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="Ex : 12 rue de la Paix" autoComplete="address-line1" />
        </label>
        <label className="ap-field">
          <span>Code postal</span>
          <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Ex : 75002" inputMode="numeric" autoComplete="postal-code" />
        </label>
        <label className="ap-field">
          <span>Ville</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex : Paris" autoComplete="address-level2" />
        </label>
        <label className="ap-field">
          <span>Pays de résidence fiscale</span>
          <input value="France" disabled />
        </label>

        <h2 className="ap-eyebrow-h">Identifiant fiscal</h2>
        {!hasNoNif && (
          <label className="ap-field">
            <span>Numéro fiscal (NIF)</span>
            <input value={nif} onChange={(e) => setNif(e.target.value)} placeholder="Ex : 0123456789012" inputMode="numeric" />
            <small className="ap-field__hint">13 chiffres, sur votre avis d&apos;impôt.</small>
          </label>
        )}
        <label className="ap-check">
          <input type="checkbox" checked={hasNoNif} onChange={(e) => setHasNoNif(e.target.checked)} />
          <span>Je n&apos;ai pas de numéro fiscal</span>
        </label>
        {hasNoNif && (
          <>
            <label className="ap-field">
              <span>Ville de naissance</span>
              <input value={birthCity} onChange={(e) => setBirthCity(e.target.value)} placeholder="Ex : Lyon" />
            </label>
            <label className="ap-field">
              <span>Pays de naissance</span>
              <input value={birthCountry} onChange={(e) => setBirthCountry(e.target.value)} placeholder="Ex : France" />
            </label>
          </>
        )}

        <label className="ap-check">
          <input type="checkbox" checked={attestation} onChange={(e) => setAttestation(e.target.checked)} />
          <span>J&apos;atteste sur l&apos;honneur l&apos;exactitude des informations fournies conformément à la directive fiscale DAC7.</span>
        </label>
        {error && <p className="ap-banner ap-banner--error">{error}</p>}
        <button className="ap-btn ap-btn--primary ap-btn--block" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Valider mes informations'}
        </button>
      </form>
    </div>
  );
}
