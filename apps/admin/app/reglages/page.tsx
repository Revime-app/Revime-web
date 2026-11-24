'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AdminLegalVersionsResponse,
  LegalDocumentKind,
  PlatformSettingsDto,
  UpdatePlatformSettingsDto,
} from '@revime/shared';
import { DEFAULT_PLATFORM_SETTINGS, resolveApiErrorMessage } from '@revime/shared';
import { LEGAL_VERSIONS_ENDPOINT, legalReadHref, publishFormError, publishLegalVersion, versionOptions } from '../../lib/legal-versions';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { useAdminMe } from '../../components/AdminGate';
import { TriangleAlert, Zap } from 'lucide-react';
import { Icon } from '../../components/Icon';

export const DEFAULT_PLATFORM_SETTINGS_ENDPOINT = '/api/proxy/admin/settings';

export interface FeeSimulation {
  fixedEuros: number;
  variableEuros: number;
  protectionTotalEuros: number;
  totalClientEuros: number;
  commissionEuros: number;
  fixedEurosFormatted: string;
  variableEurosFormatted: string;
  protectionTotalFormatted: string;
  totalClientFormatted: string;
  commissionFormatted: string;
}

export function calculateFeeSimulation(
  fixedCents: number,
  protectionRateBp: number,
  commissionRateBp: number,
  repairEuros = 100
): FeeSimulation {
  const repairCents = repairEuros * 100;
  const fixedCentsClean = Math.max(0, Number.isFinite(fixedCents) ? fixedCents : 0);
  const rateBpClean = Math.max(0, Number.isFinite(protectionRateBp) ? protectionRateBp : 0);
  const commissionBpClean = Math.max(0, Number.isFinite(commissionRateBp) ? commissionRateBp : 0);

  const variableCents = Math.round((repairCents * rateBpClean) / 10000);
  const protectionTotalCents = fixedCentsClean + variableCents;
  const totalClientCents = repairCents + protectionTotalCents;
  const commissionCents = Math.round((repairCents * commissionBpClean) / 10000);

  const formatEuroValue = (cents: number) => {
    return (
      (cents / 100).toLocaleString('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + ' €'
    );
  };

  return {
    fixedEuros: fixedCentsClean / 100,
    variableEuros: variableCents / 100,
    protectionTotalEuros: protectionTotalCents / 100,
    totalClientEuros: totalClientCents / 100,
    commissionEuros: commissionCents / 100,
    fixedEurosFormatted: formatEuroValue(fixedCentsClean),
    variableEurosFormatted: formatEuroValue(variableCents),
    protectionTotalFormatted: formatEuroValue(protectionTotalCents),
    totalClientFormatted: formatEuroValue(totalClientCents),
    commissionFormatted: formatEuroValue(commissionCents),
  };
}

function parseEurosToCents(val: string): number {
  const clean = val.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

function parsePercentToBp(val: string): number {
  const clean = val.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

export async function updatePlatformSettingsAction(
  payload: UpdatePlatformSettingsDto,
  endpoint = DEFAULT_PLATFORM_SETTINGS_ENDPOINT,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; data?: PlatformSettingsDto; error?: string }> {
  try {
    const res = await fetchImpl(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = (await res.json()) as PlatformSettingsDto;
      return { ok: true, data };
    }
    // V7 D5 (U9b): the server's own reason, e.g. « Cette version (…) n'est pas publiée. ».
    const body = await res.json().catch(() => null);
    return { ok: false, error: resolveApiErrorMessage(body, res.status, 'Erreur lors de l’enregistrement des réglages.').message };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Erreur réseau lors de l’enregistrement.' };
  }
}

export interface ReglagesPageProps {
  initialSettings?: PlatformSettingsDto | null;
  initialMe?: { role: string } | null;
  initialIsSuperAdmin?: boolean;
  apiEndpoint?: string;
  /** V7 D5 (U9b): the published versions; fetched on mount when absent. */
  initialLegalVersions?: AdminLegalVersionsResponse | null;
}

/** Only a super admin edits, and only on the real values: after a failed load the form holds the defaults. */
export function canEditSettings(hasSuperAdminRole: boolean, loadFailed: boolean): boolean {
  return hasSuperAdminRole && !loadFailed;
}

export default function ReglagesPage({
  initialSettings = null,
  initialMe = null,
  initialIsSuperAdmin,
  apiEndpoint = DEFAULT_PLATFORM_SETTINGS_ENDPOINT,
  initialLegalVersions = null,
}: ReglagesPageProps) {
  const me = useAdminMe();

  const hasSuperAdminRole = useMemo(() => {
    if (initialIsSuperAdmin !== undefined) return initialIsSuperAdmin;
    if (initialMe) return initialMe.role === 'super_admin';
    return me?.role === 'super_admin';
  }, [initialIsSuperAdmin, initialMe, me]);

  // Master saved settings
  const [savedSettings, setSavedSettings] = useState<PlatformSettingsDto>(
    initialSettings ?? {
      ...DEFAULT_PLATFORM_SETTINGS,
      updatedAt: new Date().toISOString(),
      updatedByUserId: null,
    }
  );

  // Form Fields State
  const [protectionFixed, setProtectionFixed] = useState(
    (savedSettings.protectionFixedCents / 100).toFixed(2).replace('.', ',')
  );
  const [protectionRate, setProtectionRate] = useState(
    (savedSettings.protectionRateBp / 100).toFixed(2).replace('.', ',')
  );
  const [commissionRate, setCommissionRate] = useState(
    (savedSettings.commissionRateBp / 100).toFixed(2).replace('.', ',')
  );

  const [payoutHoldHours, setPayoutHoldHours] = useState(savedSettings.payoutHoldHours);
  const [offerValidityHours, setOfferValidityHours] = useState(savedSettings.offerValidityHours);
  const [paymentHoldHours, setPaymentHoldHours] = useState(savedSettings.paymentHoldHours);

  const [deliveryHomeEnabled, setDeliveryHomeEnabled] = useState(savedSettings.deliveryHomeEnabled);
  const [deliveryWorkshopEnabled, setDeliveryWorkshopEnabled] = useState(
    savedSettings.deliveryWorkshopEnabled
  );
  const [deliveryParcelEnabled, setDeliveryParcelEnabled] = useState(
    savedSettings.deliveryParcelEnabled
  );

  const [carrierMondialRelay, setCarrierMondialRelay] = useState(savedSettings.carrierMondialRelay);
  const [carrierChronopost, setCarrierChronopost] = useState(savedSettings.carrierChronopost);
  const [carrierColissimo, setCarrierColissimo] = useState(savedSettings.carrierColissimo);
  const [carrierRelaisColis, setCarrierRelaisColis] = useState(savedSettings.carrierRelaisColis);

  const [maxInsurableValue, setMaxInsurableValue] = useState(
    (savedSettings.maxInsurableValueCents / 100).toFixed(0)
  );

  const [cguCurrentVersion, setCguCurrentVersion] = useState(savedSettings.cguCurrentVersion);
  const [cguForceReaccept, setCguForceReaccept] = useState(savedSettings.cguForceReaccept);
  const [legalNoticeVersion, setLegalNoticeVersion] = useState(savedSettings.legalNoticeVersion);

  const [maintenanceEnabled, setMaintenanceEnabled] = useState(savedSettings.maintenanceEnabled);
  const [maintenanceMessage, setMaintenanceMessage] = useState(savedSettings.maintenanceMessage);

  // UI status
  const [loading, setLoading] = useState(initialSettings === null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  // The form starts on the defaults: if the real values never arrived, saving would overwrite the
  // stored settings with them, so a failed load locks the form like a non-super-admin's.
  const [loadFailed, setLoadFailed] = useState(false);
  const isSuperAdmin = canEditSettings(hasSuperAdminRole, loadFailed);

  const applySettings = useCallback((data: PlatformSettingsDto) => {
    setSavedSettings(data);
    setProtectionFixed((data.protectionFixedCents / 100).toFixed(2).replace('.', ','));
    setProtectionRate((data.protectionRateBp / 100).toFixed(2).replace('.', ','));
    setCommissionRate((data.commissionRateBp / 100).toFixed(2).replace('.', ','));
    setPayoutHoldHours(data.payoutHoldHours);
    setOfferValidityHours(data.offerValidityHours);
    setPaymentHoldHours(data.paymentHoldHours);
    setDeliveryHomeEnabled(data.deliveryHomeEnabled);
    setDeliveryWorkshopEnabled(data.deliveryWorkshopEnabled);
    setDeliveryParcelEnabled(data.deliveryParcelEnabled);
    setCarrierMondialRelay(data.carrierMondialRelay);
    setCarrierChronopost(data.carrierChronopost);
    setCarrierColissimo(data.carrierColissimo);
    setCarrierRelaisColis(data.carrierRelaisColis);
    setMaxInsurableValue((data.maxInsurableValueCents / 100).toFixed(0));
    setCguCurrentVersion(data.cguCurrentVersion);
    setCguForceReaccept(data.cguForceReaccept);
    setLegalNoticeVersion(data.legalNoticeVersion);
    setMaintenanceEnabled(data.maintenanceEnabled);
    setMaintenanceMessage(data.maintenanceMessage);
  }, []);

  // Initial fetch on mount if initialSettings is not provided
  useEffect(() => {
    if (initialSettings) {
      applySettings(initialSettings);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchSettings = async () => {
      try {
        const res = await fetch(apiEndpoint);
        if (res.ok && !cancelled) {
          const data = (await res.json()) as PlatformSettingsDto;
          applySettings(data);
        } else if (!cancelled) {
          setLoadFailed(true);
          setFeedback({
            type: 'error',
            message: 'Impossible de charger les réglages de la plateforme.',
          });
        }
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          setFeedback({
            type: 'error',
            message: 'Erreur réseau lors du chargement des réglages.',
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchSettings();

    return () => {
      cancelled = true;
    };
  }, [apiEndpoint, initialSettings, applySettings]);

  // V7 D5 (U9b, `DEC7-24` Q14): published CGU and mentions légales versions, and the publish form.
  const [legalVersions, setLegalVersions] = useState<AdminLegalVersionsResponse>(
    initialLegalVersions ?? { cgu: [], mentionsLegales: [] }
  );
  const [pubKind, setPubKind] = useState<LegalDocumentKind>('CGU');
  const [pubVersion, setPubVersion] = useState(() => new Date().toISOString().slice(0, 10));
  const [pubFile, setPubFile] = useState<File | null>(null);
  const [pubSummary, setPubSummary] = useState('');
  const [pubActivate, setPubActivate] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [pubFeedback, setPubFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadLegalVersions = useCallback(async () => {
    try {
      const res = await fetch(LEGAL_VERSIONS_ENDPOINT);
      if (res.ok) setLegalVersions((await res.json()) as AdminLegalVersionsResponse);
    } catch {
      // The dropdowns keep the stored value as their only option; the save still validates it.
    }
  }, []);

  useEffect(() => {
    if (!initialLegalVersions) void loadLegalVersions();
  }, [initialLegalVersions, loadLegalVersions]);

  const handlePublish = async () => {
    const invalid = publishFormError({ version: pubVersion, file: pubFile });
    if (invalid || !pubFile) {
      setPubFeedback({ type: 'error', message: invalid ?? 'Choisissez le fichier PDF.' });
      return;
    }
    setPublishing(true);
    setPubFeedback(null);
    const res = await publishLegalVersion({
      kind: pubKind,
      version: pubVersion,
      file: pubFile,
      summary: pubKind === 'CGU' ? pubSummary : null,
      activate: pubActivate,
    });
    setPublishing(false);
    if (!res.ok) {
      setPubFeedback({ type: 'error', message: res.error });
      return;
    }
    await loadLegalVersions();
    if (pubActivate) {
      // The server already made it active: move the dropdown and the saved baseline together, so the
      // form does not read as having unsaved changes.
      const field = pubKind === 'CGU' ? 'cguCurrentVersion' : 'legalNoticeVersion';
      if (pubKind === 'CGU') setCguCurrentVersion(pubVersion);
      else setLegalNoticeVersion(pubVersion);
      setSavedSettings((prev) => ({ ...prev, [field]: pubVersion }));
    }
    setPubFile(null);
    setPubSummary('');
    setPubFeedback({
      type: 'success',
      message: pubActivate ? `Version ${pubVersion} publiée et active.` : `Version ${pubVersion} publiée.`,
    });
  };

  // UX polish: Clear feedback on input change
  const clearFeedbackOnEdit = () => {
    if (feedback) setFeedback(null);
  };

  // Reset form back to last saved values
  const handleReset = useCallback(() => {
    applySettings(savedSettings);
    setFeedback(null);
  }, [applySettings, savedSettings]);

  // Compute live fee simulation
  const simulation = useMemo(() => {
    const fixedCents = parseEurosToCents(protectionFixed);
    const rateBp = parsePercentToBp(protectionRate);
    const commBp = parsePercentToBp(commissionRate);
    return calculateFeeSimulation(fixedCents, rateBp, commBp, 100);
  }, [protectionFixed, protectionRate, commissionRate]);

  // Save handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;

    setSaving(true);
    setFeedback(null);

    const payload: UpdatePlatformSettingsDto = {
      protectionFixedCents: parseEurosToCents(protectionFixed),
      protectionRateBp: parsePercentToBp(protectionRate),
      commissionRateBp: parsePercentToBp(commissionRate),
      payoutHoldHours: Number(payoutHoldHours),
      offerValidityHours: Number(offerValidityHours),
      paymentHoldHours: Number(paymentHoldHours),
      deliveryHomeEnabled,
      deliveryWorkshopEnabled,
      deliveryParcelEnabled,
      carrierMondialRelay,
      carrierChronopost,
      carrierColissimo,
      carrierRelaisColis,
      maxInsurableValueCents: parseEurosToCents(maxInsurableValue),
      cguCurrentVersion: cguCurrentVersion.trim(),
      cguForceReaccept,
      legalNoticeVersion: legalNoticeVersion.trim(),
      maintenanceEnabled,
      maintenanceMessage: maintenanceMessage.trim(),
    };

    const res = await updatePlatformSettingsAction(payload, apiEndpoint, fetch);
    if (res.ok && res.data) {
      setSavedSettings(res.data);
      setFeedback({
        type: 'success',
        message: 'Réglages enregistrés avec succès.',
      });
    } else {
      setFeedback({
        type: 'error',
        message: res.error ?? 'Erreur lors de l’enregistrement des réglages.',
      });
    }
    setSaving(false);
  };

  return (
    <div className="page page--detail">
      {/* Breadcrumbs Navigation */}
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Réglages', href: '/parametres' },
          { label: 'Réglages plateforme' },
        ]}
      />

      <div style={{ margin: '16px 0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink, #141414)', margin: 0 }}>
            Réglages plateforme
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted, #64748b)', fontSize: '14px' }}>
            Gestion centralisée de la tarification, des commissions, des délais, des transporteurs et du mode maintenance.
          </p>
        </div>

        {maintenanceEnabled && (
          <span
            className="badge badge--danger"
            data-testid="maintenance-badge"
            style={{
              backgroundColor: 'var(--badge-danger-bg, #fef3f2)',
              color: 'var(--badge-danger-text, #b42318)',
              border: '1px solid var(--badge-danger-border, #fecdca)',
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <Icon as={TriangleAlert} /> Mode maintenance actif
          </span>
        )}
      </div>

      {/* Loading state indicator */}
      {loading && (
        <div
          data-testid="settings-loading"
          style={{
            padding: '12px 18px',
            backgroundColor: 'var(--navy-soft, #f0f1f5)',
            color: 'var(--navy-text, #25324f)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-field, 4px)',
            marginBottom: '24px',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          Chargement des réglages de la plateforme...
        </div>
      )}

      {/* Honest status: these values are stored but nothing reads them yet (RU-26, FND-600) */}
      <div
        role="note"
        className="settings-banner settings-banner--warning"
        style={{
          padding: '12px 18px',
          backgroundColor: 'var(--badge-warning-bg, #fffaeb)',
          color: 'var(--badge-warning-text, #b54708)',
          border: '1px solid var(--badge-warning-border, #fedf89)',
          borderRadius: 'var(--r-field, 4px)',
          marginBottom: '24px',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        {/* V7 D5: the maintenance mode left this list with U9, the CGU with U9b. */}
        Valeurs enregistrées, pas encore appliquées : les frais, les délais et les transporteurs de
        la plateforme sont toujours fixés dans le code. Modifier ces champs ne change pas encore le
        comportement de l&apos;application.
      </div>

      {/* Role-Based Consultation Banner */}
      {!hasSuperAdminRole && (
        <div
          role="status"
          className="settings-banner settings-banner--warning"
          style={{
            padding: '12px 18px',
            backgroundColor: 'var(--badge-warning-bg, #fffaeb)',
            color: 'var(--badge-warning-text, #b54708)',
            border: '1px solid var(--badge-warning-border, #fedf89)',
            borderRadius: 'var(--r-field, 4px)',
            marginBottom: '24px',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          Mode consultation — Seuls les super administrateurs peuvent modifier ces réglages.
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`settings-banner settings-banner--${feedback.type}`}
          style={{
            padding: '12px 18px',
            backgroundColor:
              feedback.type === 'success'
                ? 'var(--badge-success-bg, #ecfdf3)'
                : 'var(--badge-danger-bg, #fef3f2)',
            color:
              feedback.type === 'success'
                ? 'var(--badge-success-text, #027a48)'
                : 'var(--badge-danger-text, #b42318)',
            border: `1px solid ${
              feedback.type === 'success'
                ? 'var(--badge-success-border, #a6f4c5)'
                : 'var(--badge-danger-border, #fecdca)'
            }`,
            borderRadius: 'var(--r-field, 4px)',
            marginBottom: '24px',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Card 1: Tarification & Commissions */}
        <section
          className="card"
          data-testid="card-pricing"
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 8px)',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '8px' }}>
            Tarification &amp; Commissions
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--muted, #64748b)', marginBottom: '20px' }}>
            Structure des frais de protection acheteur et de la commission prélevée auprès des réparateurs.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label htmlFor="protectionFixedCents" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink, #141414)' }}>
                Frais fixes de protection (€)
              </label>
              <input
                id="protectionFixedCents"
                name="protectionFixedCents"
                type="text"
                value={protectionFixed}
                disabled={!isSuperAdmin}
                onChange={(e) => {
                  setProtectionFixed(e.target.value);
                  clearFeedbackOnEdit();
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '14px',
                  backgroundColor: !isSuperAdmin ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '4px', display: 'block' }}>
                Par ex. 2,90 €
              </span>
            </div>

            <div>
              <label htmlFor="protectionRateBp" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink, #141414)' }}>
                Taux proportionnel de protection (%)
              </label>
              <input
                id="protectionRateBp"
                name="protectionRateBp"
                type="text"
                value={protectionRate}
                disabled={!isSuperAdmin}
                onChange={(e) => {
                  setProtectionRate(e.target.value);
                  clearFeedbackOnEdit();
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '14px',
                  backgroundColor: !isSuperAdmin ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '4px', display: 'block' }}>
                Par ex. 4,5 % (450 points de base)
              </span>
            </div>

            <div>
              <label htmlFor="commissionRateBp" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink, #141414)' }}>
                Commission réparateur (%)
              </label>
              <input
                id="commissionRateBp"
                name="commissionRateBp"
                type="text"
                value={commissionRate}
                disabled={!isSuperAdmin}
                onChange={(e) => {
                  setCommissionRate(e.target.value);
                  clearFeedbackOnEdit();
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '14px',
                  backgroundColor: !isSuperAdmin ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '4px', display: 'block' }}>
                Par ex. 0,0 % (0 points de base)
              </span>
            </div>
          </div>

          {/* Live Simulation Preview */}
          <div
            className="live-simulator"
            data-testid="live-simulator"
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--navy-soft, #f0f1f5)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '16px' }}><Icon as={Zap} /></span>
              <strong style={{ fontSize: '14px', color: 'var(--navy-text, #25324f)' }}>
                Simulateur en direct
              </strong>
              <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                (pour une réparation type de 100,00 €)
              </span>
            </div>

            <div style={{ fontSize: '13.5px', lineHeight: '1.6', color: 'var(--ink, #141414)' }}>
              <div>
                Frais fixes: <strong>{simulation.fixedEurosFormatted}</strong> + Variable: <strong>{simulation.variableEurosFormatted}</strong> = Protection: <strong>{simulation.protectionTotalFormatted}</strong> (Total client: <strong>{simulation.totalClientFormatted}</strong>)
              </div>
              <div style={{ marginTop: '4px' }}>
                Commission réparateur: <strong>{simulation.commissionFormatted}</strong>
              </div>
            </div>
          </div>
        </section>

        {/* Card 2: Délais & Expirations */}
        <section
          className="card"
          data-testid="card-delays"
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 8px)',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '8px' }}>
            Délais &amp; Expirations
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--muted, #64748b)', marginBottom: '20px' }}>
            Délais opérationnels pour les paiements, la libération des fonds et la caducité des devis.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div>
              <label htmlFor="payoutHoldHours" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink, #141414)' }}>
                Délai de libération des fonds (heures)
              </label>
              <input
                id="payoutHoldHours"
                name="payoutHoldHours"
                type="number"
                min={1}
                max={720}
                value={payoutHoldHours}
                disabled={!isSuperAdmin}
                onChange={(e) => {
                  setPayoutHoldHours(Number(e.target.value));
                  clearFeedbackOnEdit();
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '14px',
                  backgroundColor: !isSuperAdmin ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '4px', display: 'block' }}>
                Standard : 48h
              </span>
            </div>

            <div>
              <label htmlFor="offerValidityHours" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink, #141414)' }}>
                Validité des offres réparateurs (heures)
              </label>
              <input
                id="offerValidityHours"
                name="offerValidityHours"
                type="number"
                min={1}
                max={720}
                value={offerValidityHours}
                disabled={!isSuperAdmin}
                onChange={(e) => {
                  setOfferValidityHours(Number(e.target.value));
                  clearFeedbackOnEdit();
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '14px',
                  backgroundColor: !isSuperAdmin ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '4px', display: 'block' }}>
                Standard : 168h (7 jours)
              </span>
            </div>

            <div>
              <label htmlFor="paymentHoldHours" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink, #141414)' }}>
                Expiration session de paiement (heures)
              </label>
              <input
                id="paymentHoldHours"
                name="paymentHoldHours"
                type="number"
                min={1}
                max={48}
                value={paymentHoldHours}
                disabled={!isSuperAdmin}
                onChange={(e) => {
                  setPaymentHoldHours(Number(e.target.value));
                  clearFeedbackOnEdit();
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '14px',
                  backgroundColor: !isSuperAdmin ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '4px', display: 'block' }}>
                Standard : 2h
              </span>
            </div>
          </div>
        </section>

        {/* Card 3: Livraison & Transporteurs */}
        <section
          className="card"
          data-testid="card-delivery"
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 8px)',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '8px' }}>
            Livraison &amp; Transporteurs
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--muted, #64748b)', marginBottom: '20px' }}>
            Activation des modes de remise et sélection des réseaux de transporteurs autorisés.
          </p>

          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '12px' }}>
              Modes de livraison autorisés
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  name="deliveryHomeEnabled"
                  checked={deliveryHomeEnabled}
                  disabled={!isSuperAdmin}
                  onChange={(e) => {
                    setDeliveryHomeEnabled(e.target.checked);
                    clearFeedbackOnEdit();
                  }}
                />
                À domicile
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  name="deliveryWorkshopEnabled"
                  checked={deliveryWorkshopEnabled}
                  disabled={!isSuperAdmin}
                  onChange={(e) => {
                    setDeliveryWorkshopEnabled(e.target.checked);
                    clearFeedbackOnEdit();
                  }}
                />
                En atelier
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  name="deliveryParcelEnabled"
                  checked={deliveryParcelEnabled}
                  disabled={!isSuperAdmin}
                  onChange={(e) => {
                    setDeliveryParcelEnabled(e.target.checked);
                    clearFeedbackOnEdit();
                  }}
                />
                Envoi colis
              </label>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '12px' }}>
              Réseaux de transporteurs partenaires
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  name="carrierMondialRelay"
                  checked={carrierMondialRelay}
                  disabled={!isSuperAdmin}
                  onChange={(e) => {
                    setCarrierMondialRelay(e.target.checked);
                    clearFeedbackOnEdit();
                  }}
                />
                Mondial Relay
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  name="carrierChronopost"
                  checked={carrierChronopost}
                  disabled={!isSuperAdmin}
                  onChange={(e) => {
                    setCarrierChronopost(e.target.checked);
                    clearFeedbackOnEdit();
                  }}
                />
                Chronopost
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  name="carrierColissimo"
                  checked={carrierColissimo}
                  disabled={!isSuperAdmin}
                  onChange={(e) => {
                    setCarrierColissimo(e.target.checked);
                    clearFeedbackOnEdit();
                  }}
                />
                Colissimo
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  name="carrierRelaisColis"
                  checked={carrierRelaisColis}
                  disabled={!isSuperAdmin}
                  onChange={(e) => {
                    setCarrierRelaisColis(e.target.checked);
                    clearFeedbackOnEdit();
                  }}
                />
                Relais Colis
              </label>
            </div>
          </div>

          <div style={{ maxWidth: '320px' }}>
            <label htmlFor="maxInsurableValueCents" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink, #141414)' }}>
              Plafond d’assurance colis (€)
            </label>
            <input
              id="maxInsurableValueCents"
              name="maxInsurableValueCents"
              type="text"
              value={maxInsurableValue}
              disabled={!isSuperAdmin}
              onChange={(e) => {
                setMaxInsurableValue(e.target.value);
                clearFeedbackOnEdit();
              }}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                fontSize: '14px',
                backgroundColor: !isSuperAdmin ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
              }}
            />
            <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '4px', display: 'block' }}>
              Standard : 1 000 € (100 000 centimes)
            </span>
          </div>
        </section>

        {/* Card 4: CGU & Légal */}
        <section
          className="card"
          data-testid="card-legal"
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 8px)',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '8px' }}>
            CGU &amp; Légal
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--muted, #64748b)', marginBottom: '20px' }}>
            Versions contractuelles opposables et déclenchement de réacceptation obligatoire.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label htmlFor="cguCurrentVersion" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink, #141414)' }}>
                Version active des CGU
              </label>
              {/* V7 D5 (U9b, Q14): a published version, never free text; the save checks it too. */}
              <select
                id="cguCurrentVersion"
                name="cguCurrentVersion"
                value={cguCurrentVersion}
                disabled={!isSuperAdmin}
                onChange={(e) => {
                  setCguCurrentVersion(e.target.value);
                  clearFeedbackOnEdit();
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '14px',
                  backgroundColor: !isSuperAdmin ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              >
                {versionOptions(legalVersions.cgu, cguCurrentVersion).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <a href={legalReadHref('CGU', cguCurrentVersion)} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '6px', fontSize: '13px', color: 'var(--ink, #141414)' }}>
                Lire
              </a>
            </div>

            <div>
              <label htmlFor="legalNoticeVersion" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink, #141414)' }}>
                Version des mentions légales
              </label>
              <select
                id="legalNoticeVersion"
                name="legalNoticeVersion"
                value={legalNoticeVersion}
                disabled={!isSuperAdmin}
                onChange={(e) => {
                  setLegalNoticeVersion(e.target.value);
                  clearFeedbackOnEdit();
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 'var(--r-field, 4px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  fontSize: '14px',
                  backgroundColor: !isSuperAdmin ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                  color: 'var(--ink, #141414)',
                }}
              >
                {versionOptions(legalVersions.mentionsLegales, legalNoticeVersion).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <a href={legalReadHref('MENTIONS_LEGALES', legalNoticeVersion)} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '6px', fontSize: '13px', color: 'var(--ink, #141414)' }}>
                Lire
              </a>
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                name="cguForceReaccept"
                checked={cguForceReaccept}
                disabled={!isSuperAdmin}
                onChange={(e) => {
                  setCguForceReaccept(e.target.checked);
                  clearFeedbackOnEdit();
                }}
              />
              <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                Forcer la réacceptation des CGU lors de la prochaine connexion
              </span>
            </label>
            <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '4px', marginLeft: '24px', display: 'block' }}>
              Les utilisateurs actifs devront obligatoirement valider ces nouvelles conditions pour poursuivre leur navigation.
            </span>
          </div>

          {/* V7 D5 (U9b, `DEC7-24` Q14): super admins only, like every write on this page. Publishing
              never ticks « Forcer la réacceptation » (DEC7-24 Q1 of the third round). */}
          {isSuperAdmin && (
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--line, #dfe2e2)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '6px' }}>
                Publier une nouvelle version
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--muted, #64748b)', marginBottom: '14px' }}>
                Le PDF officiel, daté. Une version publiée ne se supprime ni ne se remplace : les preuves d’acceptation y renvoient.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                  Document
                  <select
                    name="publishKind"
                    value={pubKind}
                    onChange={(e) => setPubKind(e.target.value as LegalDocumentKind)}
                    style={{ display: 'block', width: '100%', marginTop: '6px', padding: '9px 12px', borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', fontSize: '14px' }}
                  >
                    <option value="CGU">CGU</option>
                    <option value="MENTIONS_LEGALES">Mentions légales</option>
                  </select>
                </label>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                  Version (date)
                  <input
                    type="date"
                    name="publishVersion"
                    value={pubVersion}
                    onChange={(e) => setPubVersion(e.target.value)}
                    style={{ display: 'block', width: '100%', marginTop: '6px', padding: '8px 12px', borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', fontSize: '14px' }}
                  />
                </label>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                  Fichier PDF (10 Mo au plus)
                  <input
                    type="file"
                    name="publishFile"
                    accept="application/pdf"
                    onChange={(e) => setPubFile(e.target.files?.[0] ?? null)}
                    style={{ display: 'block', marginTop: '6px', fontSize: '13px' }}
                  />
                </label>
              </div>
              {pubKind === 'CGU' && (
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '12px' }}>
                  Résumé des changements (facultatif, montré sur l’écran de réacceptation)
                  <textarea
                    name="publishSummary"
                    rows={2}
                    maxLength={500}
                    value={pubSummary}
                    onChange={(e) => setPubSummary(e.target.value)}
                    style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: 'var(--r-field, 4px)', border: '1px solid var(--line, #dfe2e2)', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', marginBottom: '12px' }}>
                <input type="checkbox" name="publishActivate" checked={pubActivate} onChange={(e) => setPubActivate(e.target.checked)} />
                <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>Rendre active maintenant</span>
              </label>
              {pubFeedback && (
                <p role="status" style={{ fontSize: '13px', marginBottom: '12px', color: pubFeedback.type === 'error' ? 'var(--red, #b42318)' : 'var(--green-deep, #067647)' }}>
                  {pubFeedback.message}
                </p>
              )}
              <button type="button" className="btn btn--secondary" disabled={publishing} onClick={() => void handlePublish()}>
                {publishing ? 'Publication…' : 'Publier'}
              </button>
            </div>
          )}
        </section>

        {/* Card 5: Mode Maintenance */}
        <section
          className="card"
          data-testid="card-maintenance"
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 8px)',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink, #141414)', margin: 0 }}>
              Mode Maintenance
            </h2>
            {maintenanceEnabled && (
              <span
                className="badge badge--danger"
                data-testid="maintenance-badge"
                style={{
                  backgroundColor: 'var(--badge-danger-bg, #fef3f2)',
                  color: 'var(--badge-danger-text, #b42318)',
                  border: '1px solid var(--badge-danger-border, #fecdca)',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                Mode maintenance actif
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted, #64748b)', marginBottom: '8px' }}>
            Bascule l’application publique en statut indisponible pour interventions techniques ou mises à jour majeures.
          </p>
          {/* V7 D5 (U9, `DEC7-24` Q7): what clients see. The second line stays true for every older build. */}
          <p style={{ fontSize: '13px', color: 'var(--muted, #64748b)', marginBottom: '20px' }}>
            Quand il est actif, l’application affiche à tous les utilisateurs un écran « Maintenance en cours » avec ce message ; les comptes de l’équipe gardent l’accès.{' '}
            Les versions de l’application antérieures à cette fonctionnalité ne l’affichent pas.
          </p>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: isSuperAdmin ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                name="maintenanceEnabled"
                checked={maintenanceEnabled}
                disabled={!isSuperAdmin}
                onChange={(e) => {
                  setMaintenanceEnabled(e.target.checked);
                  clearFeedbackOnEdit();
                }}
              />
              <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                Activer le mode maintenance sur la plateforme publique
              </span>
            </label>
          </div>

          <div>
            <label htmlFor="maintenanceMessage" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink, #141414)' }}>
              Message personnalisé aux utilisateurs
            </label>
            <textarea
              id="maintenanceMessage"
              name="maintenanceMessage"
              rows={3}
              value={maintenanceMessage}
              disabled={!isSuperAdmin}
              onChange={(e) => {
                setMaintenanceMessage(e.target.value);
                clearFeedbackOnEdit();
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--r-field, 4px)',
                border: '1px solid var(--line, #dfe2e2)',
                fontSize: '14px',
                backgroundColor: !isSuperAdmin ? 'var(--navy-soft, #f0f1f5)' : 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>
        </section>

        {/* Action Controls (Super Admin only interactive) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '8px',
          }}
        >
          <button
            type="button"
            onClick={handleReset}
            disabled={!isSuperAdmin || saving}
            style={{
              backgroundColor: 'var(--navy-soft, #f0f1f5)',
              color: 'var(--navy-text, #25324f)',
              border: '1px solid var(--line, #dfe2e2)',
              padding: '10px 20px',
              borderRadius: 'var(--r-field, 4px)',
              fontWeight: 600,
              fontSize: '14px',
              cursor: isSuperAdmin && !saving ? 'pointer' : 'not-allowed',
              opacity: isSuperAdmin && !saving ? 1 : 0.6,
            }}
          >
            Réinitialiser
          </button>

          <button
            type="submit"
            disabled={!isSuperAdmin || saving}
            style={{
              backgroundColor: 'var(--navy, #25324f)',
              color: 'var(--on-accent, #ffffff)',
              border: '1px solid var(--navy, #25324f)',
              padding: '10px 24px',
              borderRadius: 'var(--r-field, 4px)',
              fontWeight: 600,
              fontSize: '14px',
              cursor: isSuperAdmin && !saving ? 'pointer' : 'not-allowed',
              opacity: isSuperAdmin && !saving ? 1 : 0.6,
            }}
          >
            {saving ? 'Enregistrement en cours...' : 'Enregistrer les modifications'}
          </button>
        </div>
      </form>
    </div>
  );
}
