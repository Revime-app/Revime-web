'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  BUSINESS_DECISION_MOTIF_LABEL,
  BUSINESS_LEGAL_FORMS,
  mayVerifyBusiness,
  submitBusinessVerificationSchema,
  type BusinessDocumentAttachment,
  type BusinessStatusResponse,
  type IdentityStatusResponse,
  type LookupCompanyResponse,
} from '@revime/shared';
import { api, errorMessage } from '../../../../lib/client/api';
import { useRequireSession, useSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { Loader, PageTitle } from '../../../../components/app/ui';

/**
 * The app's « Mon entreprise » (entreprise.tsx): identity first, then the company (SIREN/SIRET looked
 * up in the public register), the registration proof, the optional RC Pro, sent to REVIME for review.
 */
const MAX = 10 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

async function uploadDoc(file: File): Promise<BusinessDocumentAttachment> {
  if (file.size > MAX) throw new Error('Le document ne doit pas dépasser 10 Mo.');
  if (!TYPES.includes(file.type)) throw new Error('Veuillez sélectionner un fichier au format PDF, JPG ou PNG.');
  const signed = await api.post<{ path: string; uploadUrl: string }>('/business/sign-document-upload', {
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  const res = await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!res.ok) throw new Error('Impossible de charger le document.');
  return { path: signed.path, name: file.name, sizeBytes: file.size };
}

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

export default function EntreprisePage() {
  const me = useRequireSession();
  const { refresh } = useSession();
  const identity = useApi<IdentityStatusResponse>(me?.connectEnabled ? '/identity/status' : null);
  const eligible = me ? mayVerifyBusiness(me, identity.data?.status ?? null, identity.data?.decision ?? null) : false;
  const business = useApi<BusinessStatusResponse>(eligible ? '/business/status' : null);

  const [editing, setEditing] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [denomination, setDenomination] = useState('');
  const [legalForm, setLegalForm] = useState('');
  const [address, setAddress] = useState('');
  const [vat, setVat] = useState('');
  const [reg, setReg] = useState<BusinessDocumentAttachment | null>(null);
  const [ins, setIns] = useState<BusinessDocumentAttachment | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'busy' | 'found' | 'none'>('idle');
  const [uploading, setUploading] = useState<'reg' | 'ins' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const company = business.data?.company ?? null;
  useEffect(() => {
    if (company && editing) {
      setIdentifier(company.siret ?? company.siren);
      setDenomination(company.denomination);
      setLegalForm(company.legalForm);
      setAddress(company.establishmentAddress);
      setVat(company.vatNumber ?? '');
    }
  }, [company, editing]);

  if (!me) return <Loader />;

  async function find() {
    const id = identifier.replace(/\s/g, '');
    if (id.length !== 9 && id.length !== 14) return;
    setLookup('busy');
    try {
      const r = await api.post<LookupCompanyResponse>('/business/lookup', { identifier: id });
      if (r.found) {
        setDenomination(r.company.denomination ?? denomination);
        setLegalForm(BUSINESS_LEGAL_FORMS.find((f) => r.company.legalForm?.includes(f)) ?? legalForm);
        setAddress(r.company.address ?? address);
        setLookup('found');
      } else setLookup('none');
    } catch {
      setLookup('none');
    }
  }

  async function pick(kind: 'reg' | 'ins', file: File | undefined) {
    if (!file) return;
    setUploading(kind);
    setError(null);
    try {
      const doc = await uploadDoc(file);
      if (kind === 'reg') setReg(doc);
      else setIns(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger le document.');
    } finally {
      setUploading(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = submitBusinessVerificationSchema.safeParse({
      identifier: identifier.replace(/\s/g, ''),
      denomination,
      legalForm,
      establishmentAddress: address,
      vatNumber: vat.trim() || null,
      registrationProof: reg,
      insuranceProof: ins,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Vérifiez les informations saisies.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/business/submit', parsed.data);
      setEditing(false);
      business.reload();
      void refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const st = business.data?.status ?? null;
  const refused = st === 'REJECTED' || st === 'DOCUMENTS_REQUIRED';
  const showForm = eligible && (editing || (!business.loading && st === null));

  return (
    <div className="ap-page ap-narrow" data-mode="pro">
      <PageTitle title="Mon entreprise" back="/profil" />

      {!eligible ? (
        identity.loading ? (
          <Loader />
        ) : (
          <div className="ap-box ap-gate">
            <h2>Vérification d&apos;identité requise</h2>
            <p>Vérifiez d&apos;abord votre identité. Le niveau professionnel s&apos;ajoute ensuite.</p>
            <Link className="ap-btn ap-btn--primary ap-btn--block" href="/statut-verification">
              Vérifier mon identité
            </Link>
          </div>
        )
      ) : business.loading ? (
        <Loader />
      ) : !showForm && company ? (
        <>
          {st === 'PENDING' && (
            <div className="ap-banner">
              <p>Vérification en cours</p>
              <p className="ap-muted">Nous avons bien reçu vos informations. Elles seront bientôt vérifiées par l&apos;équipe REVIME.</p>
            </div>
          )}
          {st === 'APPROVED' && (
            <div className="ap-banner ap-banner--ok">
              <p>Professionnel vérifié</p>
            </div>
          )}
          {refused && business.data?.decision && (
            <div className="ap-banner ap-banner--error">
              <p>{st === 'DOCUMENTS_REQUIRED' ? 'Documents à renvoyer' : 'Vérification refusée'}</p>
              <p>
                Motif : {BUSINESS_DECISION_MOTIF_LABEL[business.data.decision.motif]}
                {business.data.decision.note ? ` · ${business.data.decision.note}` : ''}
              </p>
            </div>
          )}
          <dl className="ap-box ap-kv">
            <div>
              <dt>SIREN / SIRET</dt>
              <dd>{company.siret ?? company.siren}</dd>
            </div>
            <div>
              <dt>Raison sociale</dt>
              <dd>{company.denomination}</dd>
            </div>
            <div>
              <dt>Forme juridique</dt>
              <dd>{company.legalForm}</dd>
            </div>
            <div>
              <dt>Adresse</dt>
              <dd>{company.establishmentAddress}</dd>
            </div>
            <div>
              <dt>Nom du dirigeant</dt>
              <dd>{company.dirigeantName}</dd>
            </div>
            {company.vatNumber && (
              <div>
                <dt>N° TVA intracommunautaire</dt>
                <dd>{company.vatNumber}</dd>
              </div>
            )}
            <div>
              <dt>Justificatif d&apos;immatriculation</dt>
              <dd>{company.registrationProofName}</dd>
            </div>
            {company.insuranceProofName && (
              <div>
                <dt>Attestation RC Pro</dt>
                <dd>{company.insuranceProofName}</dd>
              </div>
            )}
          </dl>
          {(business.data?.canEdit || refused) && (
            <button type="button" className="ap-btn ap-btn--primary ap-btn--block" onClick={() => setEditing(true)}>
              {refused ? 'Corriger et renvoyer' : 'Modifier mes informations'}
            </button>
          )}
        </>
      ) : (
        <form className="ap-form" onSubmit={submit}>
          <label className="ap-field">
            <span>Numéro SIREN ou SIRET</span>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} onBlur={() => void find()} placeholder="980 491 005 00016" inputMode="numeric" />
            {lookup === 'busy' && <small className="ap-field__hint">Recherche dans le registre public...</small>}
            {lookup === 'found' && <small className="ap-field__hint">Informations reprises du registre public. Vérifiez-les.</small>}
            {lookup === 'none' && <small className="ap-field__hint">Informations non trouvées dans le registre public. Vous pouvez les renseigner manuellement.</small>}
          </label>
          <label className="ap-field">
            <span>Raison sociale</span>
            <input value={denomination} onChange={(e) => setDenomination(e.target.value)} placeholder="Ex: Atelier ReparTech" />
          </label>
          <label className="ap-field">
            <span>Forme juridique</span>
            <select value={legalForm} onChange={(e) => setLegalForm(e.target.value)}>
              <option value="">Sélectionner la forme juridique</option>
              {BUSINESS_LEGAL_FORMS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="ap-field">
            <span>Adresse de l&apos;établissement</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue de la Paix, 75002 Paris" />
          </label>
          <label className="ap-field">
            <span>Nom du dirigeant</span>
            <input value={me.name || me.repairer?.displayName || ''} disabled />
            <small className="ap-field__hint">Repris de votre identité vérifiée. Il doit correspondre à celui du justificatif.</small>
          </label>
          <label className="ap-field">
            <span>N° de TVA intracommunautaire (facultatif)</span>
            <input value={vat} onChange={(e) => setVat(e.target.value)} placeholder="FR 12 345678901" />
          </label>

          <div className="ap-field">
            <span>Justificatif d&apos;immatriculation de moins de 3 mois *</span>
            <small className="ap-field__hint">Extrait Kbis, avis de situation SIRENE ou attestation URSSAF (PDF, JPG, PNG ≤ 10 Mo).</small>
            {reg ? (
              <p className="ap-file">
                {reg.name} · {size(reg.sizeBytes)}{' '}
                <button type="button" className="ap-link" onClick={() => setReg(null)}>
                  Retirer
                </button>
              </p>
            ) : (
              <label className="ap-btn ap-btn--secondary ap-btn--block ap-filebtn">
                {uploading === 'reg' ? 'Envoi…' : "Choisir le justificatif d'immatriculation"}
                <input type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => void pick('reg', e.target.files?.[0])} />
              </label>
            )}
          </div>
          <div className="ap-field">
            <span>Attestation RC Pro (facultatif)</span>
            {ins ? (
              <p className="ap-file">
                {ins.name} · {size(ins.sizeBytes)}{' '}
                <button type="button" className="ap-link" onClick={() => setIns(null)}>
                  Retirer
                </button>
              </p>
            ) : (
              <label className="ap-btn ap-btn--secondary ap-btn--block ap-filebtn">
                {uploading === 'ins' ? 'Envoi…' : 'Ajouter une attestation RC Pro'}
                <input type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => void pick('ins', e.target.files?.[0])} />
              </label>
            )}
          </div>

          <div className="ap-box">
            <p className="ap-eyebrow-h">Ce que verront les clients une fois vérifié</p>
            <p>
              <span className="ap-chip ap-chip--ok">Professionnel vérifié</span>
            </p>
            <p className="ap-muted">Ce badge garantit aux clients votre existence légale et active la confiance sur vos devis.</p>
          </div>

          {error && <p className="ap-banner ap-banner--error">{error}</p>}
          <button className="ap-btn ap-btn--primary ap-btn--block" disabled={busy || uploading !== null}>
            {busy ? 'Envoi de votre demande...' : 'Envoyer pour vérification'}
          </button>
          {editing && (
            <button type="button" className="ap-btn ap-btn--secondary ap-btn--block" onClick={() => setEditing(false)}>
              Annuler
            </button>
          )}
        </form>
      )}
    </div>
  );
}
