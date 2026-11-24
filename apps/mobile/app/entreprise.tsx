import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Modal,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import {
  companyIdentifierSchema,
  normaliseCompanyIdentifier,
  mayVerifyBusiness,
  formatLegalForm,
  BUSINESS_LEGAL_FORMS,
  type BusinessLegalForm,
  BUSINESS_DECISION_MOTIF_LABEL,
  type BusinessDecisionMotif,
} from '@revime/shared';
import { useTheme } from '../src/theme';
import { Card } from '../src/components/Card';
import { Field } from '../src/components/Field';
import { Button } from '../src/components/Button';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { ScreenMotif } from '../src/components/ScreenMotif';
import {
  IconVerified,
  IconStore,
  IconDocument,
  IconCancel,
  IconLock,
  IconTick,
  IconClock,
  IconChevronRight,
  IconMailAt,
  IconEdit,
  IconPlus,
} from '../src/icons';
import { useSessionContext } from '../src/lib/session';
import {
  signDocumentUpload,
  uploadDocumentToUrl,
  DocumentUploadError,
  ApiError,
} from '../src/lib/api';
import {
  useBusinessStatus,
  useSubmitBusiness,
  useLookupBusiness,
  useIdentityStatus,
} from '../src/lib/queries';
import { SUPPORT_EMAIL } from '../src/lib/support';
import { RevimeLoader } from '../src/components/lottie/RevimeLoader';
import { KeyboardAvoider } from '../src/components/KeyboardAvoider';

type PickedDoc = {
  uri: string;
  name: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number;
};

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function getMimeType(
  name: string,
  reportedMime?: string | null,
): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (
    reportedMime === 'application/pdf' ||
    reportedMime === 'image/jpeg' ||
    reportedMime === 'image/png'
  ) {
    return reportedMime;
  }
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  return null;
}

/**
 * CF5-07 4-State Professional Business Verification Flow
 * - Prerequisite Gate (Identity not verified)
 * - State 1: Saisie des informations (07-1)
 * - State 2: Vérification en cours (07-2)
 * - State 3: Entreprise vérifiée (07-3)
 * - State 4: Vérification refusée / Documents à renvoyer (07-4)
 */
export default function Entreprise() {
  const router = useRouter();
  const { palette, accent, spacing, radii } = useTheme();
  const { me, refresh, refreshIfStale } = useSessionContext();
  const insets = useSafeAreaInsets();

  const identityStatus = useIdentityStatus(Boolean(me?.connectEnabled));

  useFocusEffect(
    useCallback(() => {
      void refreshIfStale();
      if (me?.connectEnabled) {
        void identityStatus.refetch();
      }
    }, [refreshIfStale, me?.connectEnabled, identityStatus.refetch]),
  );

  const eligible =
    me !== null &&
    mayVerifyBusiness(
      me,
      identityStatus.data?.status ?? null,
      identityStatus.data?.decision ?? null,
    );

  const businessStatus = useBusinessStatus(Boolean(eligible));
  const submitBusinessMutation = useSubmitBusiness();
  const lookupMutation = useLookupBusiness();

  // Mode & Form state
  const [editing, setEditing] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [denomination, setDenomination] = useState('');
  const [legalForm, setLegalForm] = useState<string>('');
  const [establishmentAddress, setEstablishmentAddress] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [registrationProof, setRegistrationProof] = useState<PickedDoc | null>(null);
  const [insuranceProof, setInsuranceProof] = useState<PickedDoc | null>(null);

  const [lookupStatus, setLookupStatus] = useState<
    'idle' | 'searching' | 'found' | 'not_found' | 'error'
  >('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStepText, setSubmittingStepText] = useState<string | null>(null);
  const [legalFormModalVisible, setLegalFormModalVisible] = useState(false);

  const lastLookedUpRef = useRef<string>('');

  const company = businessStatus.data?.company ?? null;
  const status = businessStatus.data?.status ?? null;
  const decision = businessStatus.data?.decision ?? null;

  // Initialize editing state when moving from view to edit mode
  const populateFormWithExisting = useCallback(() => {
    if (company) {
      setIdentifier(company.siret ?? company.siren);
      setDenomination(company.denomination ?? '');
      setLegalForm(company.legalForm ? formatLegalForm(company.legalForm) : '');
      setEstablishmentAddress(company.establishmentAddress ?? '');
      setVatNumber(company.vatNumber ?? '');
      setRegistrationProof(null);
      setInsuranceProof(null);
      setLookupStatus('idle');
      setSubmitError(null);
    }
  }, [company]);

  const handleStartEdit = () => {
    populateFormWithExisting();
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setSubmitError(null);
  };

  // Auto-lookup logic when SIRET/SIREN identifier is typed
  const performLookup = useCallback(
    async (idToLookup: string) => {
      const clean = normaliseCompanyIdentifier(idToLookup);
      if (clean.length !== 9 && clean.length !== 14) return;
      if (clean === lastLookedUpRef.current) return;

      lastLookedUpRef.current = clean;
      setLookupStatus('searching');

      try {
        const res = await lookupMutation.mutateAsync(clean);
        if (res.found && res.company) {
          setLookupStatus('found');
          if (res.company.denomination && !denomination.trim()) {
            setDenomination(res.company.denomination);
          }
          if (res.company.legalForm && !legalForm.trim()) {
            setLegalForm(formatLegalForm(res.company.legalForm));
          }
          if (res.company.address && !establishmentAddress.trim()) {
            setEstablishmentAddress(res.company.address);
          }
        } else {
          setLookupStatus('not_found');
        }
      } catch {
        setLookupStatus('not_found');
      }
    },
    [lookupMutation, denomination, legalForm, establishmentAddress],
  );

  useEffect(() => {
    const clean = normaliseCompanyIdentifier(identifier);
    if ((clean.length === 9 || clean.length === 14) && companyIdentifierSchema.safeParse(identifier).success) {
      const timer = setTimeout(() => {
        void performLookup(identifier);
      }, 350);
      return () => clearTimeout(timer);
    } else {
      if (clean.length < 9) {
        setLookupStatus('idle');
      }
    }
  }, [identifier, performLookup]);

  // Document Picker
  const handlePickDocument = async (target: 'registration' | 'insurance') => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const asset = res.assets[0]!;
      const sizeBytes = asset.size ?? 0;
      if (sizeBytes > 10 * 1024 * 1024) {
        Alert.alert('Fichier trop volumineux', 'Le document ne doit pas dépasser 10 Mo.');
        return;
      }

      const mime = getMimeType(asset.name, asset.mimeType);
      if (!mime) {
        Alert.alert(
          'Format non supporté',
          'Veuillez sélectionner un fichier au format PDF, JPG ou PNG.',
        );
        return;
      }

      const doc: PickedDoc = {
        uri: asset.uri,
        name: asset.name,
        mimeType: mime,
        sizeBytes: sizeBytes || 1024,
      };

      if (target === 'registration') {
        setRegistrationProof(doc);
      } else {
        setInsuranceProof(doc);
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de charger le document.');
    }
  };

  // Submit Handler
  const digits = normaliseCompanyIdentifier(identifier);
  const isIdentifierValid = companyIdentifierSchema.safeParse(identifier).success;
  const isFormValid =
    isIdentifierValid &&
    denomination.trim().length > 0 &&
    legalForm.trim().length > 0 &&
    establishmentAddress.trim().length >= 5 &&
    registrationProof !== null;

  const handleSubmit = async () => {
    if (!isFormValid || !registrationProof) return;
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      // 1. Upload mandatory registration proof
      setSubmittingStepText("Envoi du justificatif d'immatriculation...");
      const signReg = await signDocumentUpload(
        registrationProof.name,
        registrationProof.mimeType,
        registrationProof.sizeBytes,
      );
      await uploadDocumentToUrl(
        signReg.uploadUrl,
        registrationProof.uri,
        registrationProof.mimeType,
      );
      const regAttachment = {
        path: signReg.path,
        name: registrationProof.name,
        sizeBytes: registrationProof.sizeBytes,
      };

      // 2. Upload optional insurance proof if selected
      let insAttachment: { path: string; name: string; sizeBytes: number } | null = null;
      if (insuranceProof) {
        setSubmittingStepText("Envoi de l'attestation RC Pro...");
        const signIns = await signDocumentUpload(
          insuranceProof.name,
          insuranceProof.mimeType,
          insuranceProof.sizeBytes,
        );
        await uploadDocumentToUrl(
          signIns.uploadUrl,
          insuranceProof.uri,
          insuranceProof.mimeType,
        );
        insAttachment = {
          path: signIns.path,
          name: insuranceProof.name,
          sizeBytes: insuranceProof.sizeBytes,
        };
      }

      // 3. Submit business verification payload
      setSubmittingStepText('Envoi de votre demande...');
      await submitBusinessMutation.mutateAsync({
        identifier: digits,
        denomination: denomination.trim(),
        legalForm: legalForm.trim(),
        establishmentAddress: establishmentAddress.trim(),
        vatNumber: vatNumber.trim() ? vatNumber.trim() : null,
        registrationProof: regAttachment,
        insuranceProof: insAttachment,
      });

      await businessStatus.refetch();
      await refresh();
      setEditing(false);
    } catch (err) {
      // V7 A4: a refused upload now carries its reason (format, size, expired link, connection).
      setSubmitError(
        err instanceof ApiError || err instanceof DocumentUploadError
          ? err.message
          : "Une erreur est survenue lors de l'envoi.",
      );
    } finally {
      setIsSubmitting(false);
      setSubmittingStepText(null);
    }
  };

  const handleContactSupport = () => {
    const subject = encodeURIComponent(
      `Vérification entreprise - SIRET ${company?.siret || company?.siren || ''}`,
    );
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`);
  };

  // Determine current active view state
  const isPendingState = status === 'PENDING' && !editing;
  const isApprovedState = status === 'APPROVED' && !editing;
  const isRejectedOrDocsRequired =
    (status === 'REJECTED' || status === 'DOCUMENTS_REQUIRED') && !editing;
  const isFormState = !isPendingState && !isApprovedState && !isRejectedOrDocsRequired;

  const dirigenteName = me?.name || me?.repairer?.displayName || 'Nom vérifié';

  return (
    // The top edge only, like every other `ScreenHeader` screen: the header has no inset of its own.
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={2} variant="accent" />
      <ScreenHeader
        title="Mon entreprise"
        onBack={() => {
          if (editing) {
            setEditing(false);
          } else {
            router.back();
          }
        }}
      />

      <KeyboardAvoider style={styles.avoid}>
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* PREREQUISITE GATE */}
          {!eligible ? (
            <Card style={styles.cardSpacing}>
              <View style={styles.gateIconBox}>
                <IconLock size={28} color={palette.muted} strokeWidth={2} />
              </View>
              <Text style={[styles.gateTitle, { color: palette.ink }]}>
                Vérification d'identité requise
              </Text>
              <Text style={[styles.gateText, { color: palette.muted }]}>
                Vérifiez d'abord votre identité. Le niveau professionnel s'ajoute ensuite.
              </Text>
              <Button
                label="Vérifier mon identité"
                onPress={() => router.push('/statut-verification')}
              />
            </Card>
          ) : isPendingState && company ? (
            /* STATE 2: VÉRIFICATION EN COURS (07-2) */
            <>
              {/* Status Banner */}
              <View
                style={[
                  styles.statusBanner,
                  { backgroundColor: palette.navySoft, borderColor: palette.navyLift },
                ]}
              >
                <View style={styles.bannerHeaderRow}>
                  <IconClock size={20} color={palette.navyLift} strokeWidth={2.2} />
                  <Text style={[styles.bannerTitle, { color: palette.navyDeep }]}>
                    Vérification en cours
                  </Text>
                </View>
                <Text style={[styles.bannerBody, { color: palette.navy }]}>
                  Nous avons bien reçu vos informations. Elles seront bientôt vérifiées par l'équipe
                  REVIME.
                </Text>
              </View>

              {/* 3-Step Stepper */}
              <Card style={styles.cardSpacing}>
                <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                  ÉTAPE DE VÉRIFICATION
                </Text>
                <View style={styles.stepperContainer}>
                  <View style={styles.stepperLines}>
                    <View
                      style={[
                        styles.stepperLine,
                        { backgroundColor: palette.navyLift, opacity: 0.6 },
                      ]}
                    />
                    <View
                      style={[
                        styles.stepperLine,
                        { backgroundColor: palette.line },
                      ]}
                    />
                  </View>

                  <View style={styles.stepperNodesRow}>
                    {/* Node 1: Envoyé */}
                    <View style={styles.stepperNode}>
                      <View
                        style={[
                          styles.stepBadge,
                          { backgroundColor: palette.navy, borderColor: palette.navy },
                        ]}
                      >
                        <IconTick size={13} color={palette.paper} strokeWidth={2.6} />
                      </View>
                      <Text style={[styles.stepText, { color: palette.ink, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>
                        1. Envoyé
                      </Text>
                    </View>

                    {/* Node 2: Vérification REVIME */}
                    <View style={styles.stepperNode}>
                      <View
                        style={[
                          styles.stepBadge,
                          {
                            backgroundColor: palette.paper,
                            borderColor: palette.navyLift,
                            borderWidth: 2,
                          },
                        ]}
                      >
                        <IconClock size={13} color={palette.navyLift} strokeWidth={2.4} />
                      </View>
                      <Text
                        style={[
                          styles.stepText,
                          { color: palette.navyLift, fontFamily: 'GoogleSansFlex_700Bold' },
                        ]}
                      >
                        2. Vérification REVIME
                      </Text>
                    </View>

                    {/* Node 3: Badge activé */}
                    <View style={styles.stepperNode}>
                      <View
                        style={[
                          styles.stepBadge,
                          { backgroundColor: palette.mist, borderColor: palette.line },
                        ]}
                      >
                        <IconStore size={13} color={palette.faint} strokeWidth={1.8} />
                      </View>
                      <Text style={[styles.stepText, { color: palette.faint }]}>
                        3. Badge activé
                      </Text>
                    </View>
                  </View>
                </View>
              </Card>

              {/* Summary Card */}
              <Card style={styles.cardSpacing}>
                <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                  INFORMATIONS TRANSMISES
                </Text>
                <View style={styles.summaryList}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Numéro SIRET / SIREN
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.siret ? `SIRET ${company.siret}` : `SIREN ${company.siren}`}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Raison sociale
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.denomination}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Forme juridique
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {formatLegalForm(company.legalForm)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Adresse de l'établissement
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.establishmentAddress}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Nom du dirigeant
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.dirigeantName}
                    </Text>
                  </View>
                  {company.vatNumber ? (
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                        N° TVA intracommunautaire
                      </Text>
                      <Text style={[styles.summaryValue, { color: palette.ink }]}>
                        {company.vatNumber}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Justificatif d'immatriculation
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.registrationProofName}
                    </Text>
                  </View>
                  {company.insuranceProofName ? (
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                        Attestation RC Pro
                      </Text>
                      <Text style={[styles.summaryValue, { color: palette.ink }]}>
                        {company.insuranceProofName}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Card>

              {/* Inactive Badge Preview */}
              <Card style={styles.cardSpacing}>
                <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                  BADGE EN ATTENTE D'ACTIVATION
                </Text>
                <View style={styles.previewPillRow}>
                  <View
                    style={[
                      styles.previewBadgePill,
                      { backgroundColor: palette.mist, borderColor: palette.line },
                    ]}
                  >
                    <IconStore size={14} color={palette.muted} strokeWidth={2} />
                    <Text style={[styles.previewBadgeText, { color: palette.muted }]}>
                      Professionnel vérifié
                    </Text>
                  </View>
                </View>
                <Text style={[styles.captionText, { color: palette.muted }]}>
                  Ce badge sera automatiquement activé dès la validation par l'équipe REVIME.
                </Text>
              </Card>
            </>
          ) : isApprovedState && company ? (
            /* STATE 3: ENTREPRISE VÉRIFIÉE (07-3) */
            <>
              {/* Status Banner */}
              <View
                style={[
                  styles.statusBanner,
                  { backgroundColor: palette.greenSoft, borderColor: palette.green },
                ]}
              >
                <View style={styles.bannerHeaderRow}>
                  <IconVerified size={20} color={palette.greenDeep} strokeWidth={2.4} />
                  <Text style={[styles.bannerTitle, { color: palette.greenDeep }]}>
                    Entreprise vérifiée
                  </Text>
                </View>
                <Text style={[styles.bannerBody, { color: palette.greenDeep }]}>
                  Vérifiée par REVIME{company.verifiedAt ? ` le ${formatDateFr(company.verifiedAt)}` : ''}. Le badge « Professionnel vérifié » est affiché sur vos offres.
                </Text>
              </View>

              {/* Active Badge Chip */}
              <Card style={styles.cardSpacing}>
                <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                  BADGE ACTIF
                </Text>
                <View style={styles.previewPillRow}>
                  <View
                    style={[
                      styles.previewBadgePill,
                      { backgroundColor: palette.greenSoft, borderColor: palette.greenDeep },
                    ]}
                  >
                    <IconVerified size={14} color={palette.greenDeep} strokeWidth={2.4} />
                    <Text style={[styles.previewBadgeText, { color: palette.greenDeep }]}>
                      Professionnel vérifié
                    </Text>
                  </View>
                </View>
                <Text style={[styles.captionText, { color: palette.muted }]}>
                  Le badge est visible par tous les clients sur vos propositions et sur votre fiche publique.
                </Text>
              </Card>

              {/* Verified Information Summary */}
              <Card style={styles.cardSpacing}>
                <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                  INFORMATIONS VÉRIFIÉES
                </Text>
                <View style={styles.summaryList}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Raison sociale
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink, fontFamily: 'GoogleSansFlex_600SemiBold' }]}>
                      {company.denomination}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Numéro SIRET / SIREN
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.siret ? `SIRET ${company.siret}` : `SIREN ${company.siren}`}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Forme juridique
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {formatLegalForm(company.legalForm)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Adresse de l'établissement
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.establishmentAddress}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Nom du dirigeant
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.dirigeantName}
                    </Text>
                  </View>
                  {company.vatNumber ? (
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                        N° TVA intracommunautaire
                      </Text>
                      <Text style={[styles.summaryValue, { color: palette.ink }]}>
                        {company.vatNumber}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Card>

              <View style={styles.actionBlock}>
                <Button
                  label="Modifier mes informations"
                  variant="secondary"
                  icon={<IconEdit size={18} color={palette.ink} strokeWidth={2} />}
                  onPress={handleStartEdit}
                />
                <Text style={[styles.noticeUnderButton, { color: palette.muted }]}>
                  Toute modification entraîne une nouvelle vérification.
                </Text>
              </View>
            </>
          ) : isRejectedOrDocsRequired && company ? (
            /* STATE 4: VÉRIFICATION REFUSÉE / DOCUMENTS À RENVOYER (07-4) */
            <>
              {/* Status Banner */}
              <View
                style={[
                  styles.statusBanner,
                  { backgroundColor: palette.redSoft, borderColor: palette.red },
                ]}
              >
                <View style={styles.bannerHeaderRow}>
                  <IconCancel size={20} color={palette.redDeep} strokeWidth={2.4} />
                  <Text style={[styles.bannerTitle, { color: palette.redDeep }]}>
                    {status === 'REJECTED' ? 'Vérification refusée' : 'Documents à renvoyer'}
                  </Text>
                </View>
                <Text style={[styles.bannerBody, { color: palette.redDeep }]}>
                  Corrigez les éléments ci-dessous puis renvoyez votre demande.
                </Text>
              </View>

              {/* Decision Motif Alert */}
              <Card style={[styles.cardSpacing, { borderColor: palette.red, borderWidth: 1 }]}>
                <Text style={[styles.sectionLabel, { color: palette.redDeep }]}>
                  {status === 'REJECTED' ? 'MOTIF DU REFUS' : 'MOTIF DE LA DEMANDE'}
                </Text>
                <Text style={[styles.motifTitle, { color: palette.ink }]}>
                  {decision?.motif
                    ? BUSINESS_DECISION_MOTIF_LABEL[decision.motif] ?? decision.motif
                    : 'Demande non validée'}
                </Text>
                {decision?.note ? (
                  <View style={[styles.decisionNoteBox, { backgroundColor: palette.mist }]}>
                    <Text style={[styles.decisionNoteText, { color: palette.ink2 }]}>
                      « {decision.note} »
                    </Text>
                  </View>
                ) : null}
              </Card>

              {/* Previous Summary */}
              <Card style={styles.cardSpacing}>
                <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                  INFORMATIONS TRANSMISES
                </Text>
                <View style={styles.summaryList}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Numéro SIRET / SIREN
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.siret ? `SIRET ${company.siret}` : `SIREN ${company.siren}`}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Raison sociale
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.denomination}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Forme juridique
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {formatLegalForm(company.legalForm)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: palette.muted }]}>
                      Adresse
                    </Text>
                    <Text style={[styles.summaryValue, { color: palette.ink }]}>
                      {company.establishmentAddress}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Action Buttons */}
              <View style={styles.actionBlock}>
                <Button
                  label="Corriger et renvoyer"
                  variant="primary"
                  onPress={handleStartEdit}
                />
                <Button
                  label="Contacter REVIME"
                  variant="secondary"
                  icon={<IconMailAt size={18} color={palette.ink} strokeWidth={1.8} />}
                  onPress={handleContactSupport}
                />
              </View>
            </>
          ) : (
            /* STATE 1: SAISIE DES INFORMATIONS (07-1) */
            <>
              <Text style={[styles.intro, { color: palette.muted }]}>
                Facultatif. Faites vérifier votre entreprise pour afficher le badge « Professionnel
                vérifié » sur vos offres.
              </Text>

              <Card style={styles.cardSpacing}>
                {/* 1. SIRET Field & Auto-lookup */}
                <Field
                  label="Numéro SIREN ou SIRET"
                  value={identifier}
                  onChangeText={(text) => {
                    setIdentifier(text);
                    setSubmitError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={20}
                  placeholder="980 491 005 00016"
                  helperText={
                    lookupStatus === 'found'
                      ? '✓ Entreprise trouvée dans le registre public SIRENE'
                      : lookupStatus === 'not_found'
                        ? 'Informations non trouvées dans le registre public. Vous pouvez les renseigner manuellement.'
                        : lookupStatus === 'searching'
                          ? 'Recherche dans le registre public...'
                          : undefined
                  }
                />

                {/* 2. Raison sociale */}
                <Field
                  label="Raison sociale"
                  value={denomination}
                  onChangeText={(text) => {
                    setDenomination(text);
                    setSubmitError(null);
                  }}
                  placeholder="Ex: Atelier ReparTech"
                  maxLength={255}
                />

                {/* 3. Forme juridique Selector */}
                <View style={{ marginBottom: spacing.lg }}>
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_600SemiBold',
                      fontSize: 12.5,
                      color: palette.ink2,
                      marginBottom: spacing.xs,
                    }}
                  >
                    Forme juridique
                  </Text>
                  <Pressable
                    onPress={() => setLegalFormModalVisible(true)}
                    style={[
                      styles.pickerButton,
                      {
                        borderColor: palette.line,
                        backgroundColor: palette.mist,
                        borderRadius: radii.field,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerButtonText,
                        { color: legalForm ? palette.ink : palette.faint },
                      ]}
                    >
                      {legalForm || 'Sélectionner la forme juridique'}
                    </Text>
                    <IconChevronRight size={18} color={palette.muted} strokeWidth={2} />
                  </Pressable>
                </View>

                {/* 4. Adresse de l'établissement */}
                <Field
                  label="Adresse de l'établissement"
                  value={establishmentAddress}
                  onChangeText={(text) => {
                    setEstablishmentAddress(text);
                    setSubmitError(null);
                  }}
                  placeholder="12 rue de la Paix, 75002 Paris"
                  maxLength={500}
                />

                {/* 5. Nom du dirigeant (Locked Card) */}
                <View style={styles.lockedDirigeantBox}>
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_600SemiBold',
                      fontSize: 12.5,
                      color: palette.ink2,
                      marginBottom: spacing.xs,
                    }}
                  >
                    Nom du dirigeant
                  </Text>
                  <View
                    style={[
                      styles.lockedDirigeantCard,
                      {
                        backgroundColor: palette.mist,
                        borderColor: palette.line,
                        borderRadius: radii.field,
                      },
                    ]}
                  >
                    <View style={styles.dirigeantRow}>
                      <IconLock size={16} color={palette.muted} strokeWidth={2} />
                      <Text style={[styles.dirigeantName, { color: palette.ink }]}>
                        {dirigenteName}
                      </Text>
                    </View>
                    <Text style={[styles.dirigeantCaption, { color: palette.muted }]}>
                      Repris de votre identité vérifiée. Il doit correspondre à celui du justificatif.
                    </Text>
                  </View>
                </View>

                {/* 6. N° de TVA intracommunautaire (facultatif) */}
                <Field
                  label="N° de TVA intracommunautaire (facultatif)"
                  value={vatNumber}
                  onChangeText={(text) => {
                    setVatNumber(text);
                    setSubmitError(null);
                  }}
                  placeholder="FR 12 345678901"
                  maxLength={50}
                />
              </Card>

              {/* 7. Document Pickers */}
              <Card style={styles.cardSpacing}>
                <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                  PIÈCES JUSTIFICATIVES
                </Text>

                {/* Mandatory Registration Proof */}
                <View style={styles.docSection}>
                  <Text style={[styles.docLabel, { color: palette.ink }]}>
                    Justificatif d'immatriculation de moins de 3 mois *
                  </Text>
                  <Text style={[styles.docSubtext, { color: palette.muted }]}>
                    Extrait Kbis, avis de situation SIRENE ou attestation URSSAF (PDF, JPG, PNG ≤ 10 Mo).
                  </Text>

                  {registrationProof ? (
                    <View
                      style={[
                        styles.pickedFileRow,
                        { backgroundColor: palette.mist, borderColor: palette.line },
                      ]}
                    >
                      <IconDocument size={20} color={palette.ink} strokeWidth={1.8} />
                      <View style={styles.pickedFileInfo}>
                        <Text
                          style={[styles.pickedFileName, { color: palette.ink }]}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {registrationProof.name}
                        </Text>
                        <Text style={[styles.pickedFileSize, { color: palette.muted }]}>
                          {formatFileSize(registrationProof.sizeBytes)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setRegistrationProof(null)}
                        hitSlop={8}
                        style={styles.removeFileBtn}
                      >
                        <IconCancel size={18} color={palette.muted} strokeWidth={2} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => handlePickDocument('registration')}
                      style={({ pressed }) => [
                        styles.pickBox,
                        {
                          borderColor: palette.line,
                          backgroundColor: pressed ? palette.mist : palette.paper,
                        },
                      ]}
                    >
                      <IconPlus size={18} color={accent.accent} strokeWidth={2.4} />
                      <Text style={[styles.pickBoxText, { color: accent.accent }]}>
                        Choisir le justificatif d'immatriculation
                      </Text>
                    </Pressable>
                  )}
                </View>

                {/* Optional Insurance Proof */}
                <View style={[styles.docSection, { marginTop: spacing.lg }]}>
                  <Text style={[styles.docLabel, { color: palette.ink }]}>
                    Attestation d'assurance RC Pro (facultatif)
                  </Text>
                  <Text style={[styles.docSubtext, { color: palette.muted }]}>
                    Attestation en cours de validité (PDF, JPG, PNG ≤ 10 Mo).
                  </Text>

                  {insuranceProof ? (
                    <View
                      style={[
                        styles.pickedFileRow,
                        { backgroundColor: palette.mist, borderColor: palette.line },
                      ]}
                    >
                      <IconDocument size={20} color={palette.ink} strokeWidth={1.8} />
                      <View style={styles.pickedFileInfo}>
                        <Text
                          style={[styles.pickedFileName, { color: palette.ink }]}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {insuranceProof.name}
                        </Text>
                        <Text style={[styles.pickedFileSize, { color: palette.muted }]}>
                          {formatFileSize(insuranceProof.sizeBytes)}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setInsuranceProof(null)}
                        hitSlop={8}
                        style={styles.removeFileBtn}
                      >
                        <IconCancel size={18} color={palette.muted} strokeWidth={2} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => handlePickDocument('insurance')}
                      style={({ pressed }) => [
                        styles.pickBox,
                        {
                          borderColor: palette.line,
                          backgroundColor: pressed ? palette.mist : palette.paper,
                        },
                      ]}
                    >
                      <IconPlus size={18} color={accent.accent} strokeWidth={2.4} />
                      <Text style={[styles.pickBoxText, { color: accent.accent }]}>
                        Ajouter une attestation RC Pro
                      </Text>
                    </Pressable>
                  )}
                </View>
              </Card>

              {/* 8. Badge Preview Card */}
              <Card style={styles.cardSpacing}>
                <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                  CE QUE VERRONT LES CLIENTS UNE FOIS VÉRIFIÉ
                </Text>
                <View style={styles.previewPillRow}>
                  <View
                    style={[
                      styles.previewBadgePill,
                      { backgroundColor: palette.greenSoft, borderColor: palette.greenDeep },
                    ]}
                  >
                    <IconVerified size={14} color={palette.greenDeep} strokeWidth={2.4} />
                    <Text style={[styles.previewBadgeText, { color: palette.greenDeep }]}>
                      Professionnel vérifié
                    </Text>
                  </View>
                </View>
                <Text style={[styles.captionText, { color: palette.muted }]}>
                  Ce badge garantit aux clients votre existence légale et active la confiance sur vos devis.
                </Text>
              </Card>

              {/* Error Message */}
              {submitError ? (
                <View style={[styles.errorBox, { backgroundColor: palette.redSoft }]}>
                  <Text style={[styles.errorText, { color: palette.redDeep }]}>{submitError}</Text>
                </View>
              ) : null}

              {/* Progress Text during submission */}
              {submittingStepText ? (
                <View style={styles.submittingStepRow}>
                  <RevimeLoader variant="fill" size={28} centered={false} />
                  <Text style={[styles.submittingStepText, { color: palette.ink2 }]}>
                    {submittingStepText}
                  </Text>
                </View>
              ) : null}

              {/* Action Buttons */}
              <View style={styles.actionBlock}>
                <Button
                  label="Envoyer pour vérification"
                  disabled={!isFormValid || isSubmitting}
                  loading={isSubmitting}
                  onPress={() => void handleSubmit()}
                />
                {editing && (
                  <Button
                    label="Annuler"
                    variant="text"
                    disabled={isSubmitting}
                    onPress={handleCancelEdit}
                  />
                )}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoider>

      {/* Legal Form Picker Modal */}
      <Modal
        visible={legalFormModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLegalFormModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setLegalFormModalVisible(false)}
        >
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: palette.paper, paddingBottom: insets.bottom + spacing.lg },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.ink }]}>
                Forme juridique
              </Text>
              <Pressable
                onPress={() => setLegalFormModalVisible(false)}
                hitSlop={8}
                style={styles.modalCloseBtn}
              >
                <IconCancel size={20} color={palette.muted} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalOptionsList}>
              {BUSINESS_LEGAL_FORMS.map((form) => {
                const selected = legalForm === form;
                return (
                  <Pressable
                    key={form}
                    onPress={() => {
                      setLegalForm(form);
                      setLegalFormModalVisible(false);
                      setSubmitError(null);
                    }}
                    style={({ pressed }) => [
                      styles.modalOptionRow,
                      {
                        backgroundColor: selected
                          ? palette.mist
                          : pressed
                            ? palette.page
                            : palette.paper,
                        borderBottomColor: palette.line,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        {
                          color: selected ? palette.ink : palette.ink2,
                          fontFamily: selected
                            ? 'GoogleSansFlex_600SemiBold'
                            : 'GoogleSansFlex_400Regular',
                        },
                      ]}
                    >
                      {form}
                    </Text>
                    {selected && (
                      <IconTick size={18} color={accent.accent} strokeWidth={2.4} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  avoid: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16 },
  intro: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
    marginBottom: 16,
  },
  cardSpacing: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  captionText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 8,
  },
  noticeUnderButton: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },

  // Gate Card
  gateIconBox: {
    alignSelf: 'center',
    marginBottom: 12,
    marginTop: 6,
  },
  gateTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 8,
  },
  gateText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
  },

  // Status Banners
  statusBanner: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  bannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  bannerTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 16,
  },
  bannerBody: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },

  // Stepper
  stepperContainer: {
    paddingVertical: 10,
  },
  stepperLines: {
    position: 'absolute',
    top: 22,
    left: '18%',
    right: '18%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  stepperLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 12,
  },
  stepperNodesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  stepperNode: {
    alignItems: 'center',
    width: '32%',
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepText: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 11,
    textAlign: 'center',
  },

  // Summary Rows
  summaryList: {
    gap: 12,
  },
  summaryRow: {
    gap: 2,
  },
  summaryLabel: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12,
  },
  summaryValue: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 14,
  },

  // Motif Decision Box
  motifTitle: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 15,
    marginBottom: 6,
  },
  decisionNoteBox: {
    padding: 12,
    borderRadius: 8,
    marginTop: 6,
  },
  decisionNoteText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Legal form picker
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderWidth: 1.5,
  },
  pickerButtonText: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 15,
  },

  // Dirigeant box
  lockedDirigeantBox: {
    marginBottom: 16,
  },
  lockedDirigeantCard: {
    borderWidth: 1,
    padding: 12,
  },
  dirigeantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dirigeantName: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 14,
  },
  dirigeantCaption: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
  },

  // Document picking
  docSection: {
    gap: 4,
  },
  docLabel: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
  },
  docSubtext: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 6,
  },
  pickBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  pickBoxText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
  },
  pickedFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  pickedFileInfo: {
    flex: 1,
    marginLeft: 10,
  },
  pickedFileName: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
  },
  pickedFileSize: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  removeFileBtn: {
    padding: 4,
  },

  // Badge preview
  previewPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  previewBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  previewBadgeText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 12,
  },

  // Actions & status
  errorBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  submittingStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  submittingStepText: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
  },
  actionBlock: {
    gap: 8,
    marginTop: 8,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 16,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalOptionsList: {
    paddingHorizontal: 12,
  },
  modalOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  modalOptionText: {
    fontSize: 14,
  },
});
