import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Field } from '../../src/components/Field';
import { AddressInput } from '../../src/components/AddressInput';
import { Button } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { Card } from '../../src/components/Card';
import { PhotoPicker, type PickedPhoto } from '../../src/components/PhotoPicker';
import { useCategories, useCreateQuoteRequest, useRepairer, useMyDemandes } from '../../src/lib/queries';
import { api, ApiError } from '../../src/lib/api';
import { useSessionContext } from '../../src/lib/session';
import { initDraftId, resetDraftId } from '../../src/lib/photo-upload';
import { IconTick } from '../../src/icons';
import {
  categoryTree,
  createQuoteRequestSchema,
  normalisePriceInput,
  QUOTE_ALREADY_OPEN,
  type CreateQuoteRequestInput,
  type MeResponse,
} from '@revime/shared';
import { RevimeLoader } from '../../src/components/lottie/RevimeLoader';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

type Travel = NonNullable<CreateQuoteRequestInput['preferredTravel']>;

/**
 * CF4-25 (spec §4.3) - « Demander un devis » to ONE réparateur, from his profile.
 *
 * One screen rather than `publier.tsx`'s four-step wizard: the H3 field list is the same
 * demande plus two fields, and the réparateur is already chosen, so the wizard's pacing buys
 * nothing here. The category drill-in is a THIRD copy of publier's selector - the comment in
 * `publier.tsx` says a third consumer is the point to extract; it is copied here instead
 * because both callers live in a workspace with no tests and publier is the client's main
 * path. Recorded as a ruling rather than done silently.
 *
 * The budget is « éventuel »: an empty field sends `mode: 'OFFERS'`, a filled one
 * `mode: 'BUDGET'` with the amount, so the shared budget refine can never fire on a blank.
 *
 * Validation runs `createQuoteRequestSchema` on the client first (its French messages land on
 * the inputs), then the server's `ApiError.fields` do the same for anything it adds.
 */
export default function NouveauDevis() {
  const { palette, spacing, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { repairerId: rawRepairerId } = useLocalSearchParams<{ repairerId?: string }>();
  const repairerId = rawRepairerId ?? '';
  const repairer = useRepairer(repairerId);
  const categories = useCategories();
  const create = useCreateQuoteRequest(repairerId);
  const myDemandes = useMyDemandes();

  const existingOpenDemande = useMemo(() => {
    return (
      myDemandes.data?.find(
        (d) => d.status === 'OPEN' && d.quoteRequest?.repairer.userId === repairerId,
      ) ?? null
    );
  }, [myDemandes.data, repairerId]);

  const [categoryId, setCategoryId] = useState('');
  const [openParentId, setOpenParentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [preferredTravel, setPreferredTravel] = useState<Travel | null>(null);
  const [details, setDetails] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const { refresh } = useSessionContext();

  // One screen visit is one storage prefix, as in publier.tsx.
  useEffect(() => {
    initDraftId();
    return () => resetDraftId();
  }, []);

  const tree = useMemo(() => categoryTree(categories.data ?? []), [categories.data]);
  const openParent = tree.find((p) => p.id === openParentId) ?? null;

  // Normalised at entry: a newer app can talk to an older API (apps/mobile/AGENTS.md).
  const displayName = repairer.data?.displayName ?? null;

  const uploading = photos.some((p) => p.state === 'uploading');

  const submit = async () => {
    setFields({});
    setFormError(null);
    const budgetValue = budget.trim() === '' ? null : Math.round(Number(budget) * 100);
    const candidate = {
      categoryId,
      title: title.trim(),
      description: description.trim(),
      parts: 'UNKNOWN' as const,
      mode: budgetValue === null ? ('OFFERS' as const) : ('BUDGET' as const),
      budgetCents: budgetValue ?? undefined,
      locationLabel: locationLabel.trim(),
      postalCode: postalCode.trim(),
      photoPaths: photos.filter((p) => p.state === 'done').map((p) => p.path!),
      preferredTravel: preferredTravel ?? undefined,
      details: details.trim() === '' ? undefined : details.trim(),
    };
    const parsed = createQuoteRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && next[key] === undefined) next[key] = issue.message;
      }
      setFields(next);
      if (Object.keys(next).length === 0) setFormError('Vérifiez le formulaire.');
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      resetDraftId();
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.message === QUOTE_ALREADY_OPEN || error.code === 'CONFLICT') {
          void myDemandes.refetch();
        }
        setFields(error.fields ?? {});
        // A field this bundle renders nowhere (older app, newer server) must still say so.
        setFormError(error.fields ? null : error.message);
        const known = ['categoryId', 'title', 'description', 'budgetCents', 'locationLabel', 'postalCode', 'photoPaths', 'preferredTravel', 'details'];
        if (error.fields && !Object.keys(error.fields).some((k) => known.includes(k))) {
          setFormError(error.message);
        }
        return;
      }
      setFormError('Une erreur est survenue. Merci de réessayer.');
    }
  };

  const isClientModeError = Boolean(
    formError && formError.toLowerCase().includes('mode client'),
  );

  const handleSwitchToClientMode = async () => {
    setSwitchingMode(true);
    try {
      await api.patch<MeResponse>('/users/me/modes', {
        activeMode: 'CLIENT',
        clientEnabled: true,
      });
      await refresh();
      setFormError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('Impossible de passer en mode client. Merci de réessayer.');
      }
    } finally {
      setSwitchingMode(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenMotif v={3} variant="accent" />
        <ScreenHeader title="Demander un devis" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg, alignItems: 'center', marginTop: spacing.xl }}>
          <View style={[styles.tick, { backgroundColor: accent.accentSoft }]}>
            <IconTick size={28} color={accent.accent} strokeWidth={2.4} />
          </View>
          <Text style={[styles.sentTitle, { color: palette.ink, marginTop: spacing.lg }]}>
            {displayName ? `Demande envoyée à ${displayName}` : 'Demande envoyée'}
          </Text>
          <Text style={[styles.hint, { color: palette.muted, marginTop: spacing.sm, textAlign: 'center' }]}>
            Suivez-la dans « Mes réparations ». Sans réponse sous 7 jours, elle expire.
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: spacing.xl, gap: spacing.sm }}>
            <Button label="Voir mes réparations" onPress={() => router.replace('/commandes')} />
            <Button label="Retour" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={3} variant="accent" />
      <ScreenHeader
        title="Demander un devis"
        subtitle={displayName ? `À ${displayName}` : undefined}
        onBack={() => router.back()}
      />
      <KeyboardAvoider style={styles.screen}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {repairer.isError && (
            <Text style={[styles.error, { color: palette.red, marginBottom: spacing.md }]}>
              Ce réparateur n&apos;est pas disponible.
            </Text>
          )}

          <Text style={[styles.label, { color: palette.ink2, marginBottom: spacing.xs }]}>Catégorie</Text>
          {categories.isPending && <RevimeLoader variant="fill" size={32} centered={false} text="Chargement…" />}
          {categories.isError && (
            <Pressable onPress={() => void categories.refetch()}>
              <Text style={[styles.error, { color: palette.red }]}>
                Impossible de charger les catégories. Réessayer
              </Text>
            </Pressable>
          )}
          {!categories.isError && openParent === null && (
            <View style={styles.chips}>
              {tree.map((p) => (
                <Chip
                  key={p.id}
                  label={p.labelFr}
                  chevron={p.children.length > 0}
                  active={categoryId === p.id}
                  onPress={() => (p.children.length > 0 ? setOpenParentId(p.id) : setCategoryId(p.id))}
                />
              ))}
            </View>
          )}
          {!categories.isError && openParent !== null && (
            <View>
              <Pressable onPress={() => setOpenParentId(null)}>
                <Text style={[styles.link, { color: accent.accent, marginBottom: spacing.sm }]}>
                  Toutes les catégories
                </Text>
              </Pressable>
              <View style={styles.chips}>
                <Chip
                  label={openParent.labelFr}
                  active={categoryId === openParent.id}
                  onPress={() => setCategoryId(openParent.id)}
                />
                {openParent.children.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.labelFr}
                    active={categoryId === c.id}
                    onPress={() => setCategoryId(c.id)}
                  />
                ))}
              </View>
            </View>
          )}
          {fields.categoryId && <Text style={[styles.error, { color: palette.red }]}>{fields.categoryId}</Text>}

          <View style={{ height: spacing.lg }} />
          <Field
            label="Objet"
            value={title}
            onChangeText={setTitle}
            error={fields.title}
            counter={{ current: title.length, min: 2, max: 120 }}
            placeholder="ex. Écran iPhone 13 fissuré"
          />
          <Field
            label="Problème"
            value={description}
            onChangeText={setDescription}
            error={fields.description}
            counter={{ current: description.length, min: 10, max: 2000 }}
            multiline
            minHeight={110}
            placeholder="Décrivez la panne et ce que vous avez déjà tenté."
          />

          <PhotoPicker photos={photos} onChange={setPhotos} />
          {fields.photoPaths && <Text style={[styles.error, { color: palette.red }]}>{fields.photoPaths}</Text>}

          <View style={{ height: spacing.lg }} />
          <Field
            label="Budget éventuel (€)"
            value={budget}
            onChangeText={(t) => setBudget(normalisePriceInput(t))}
            error={fields.budgetCents}
            helperText="Facultatif"
            keyboardType="decimal-pad"
            placeholder="ex. 80"
          />

          <Text style={[styles.label, { color: palette.ink2, marginBottom: spacing.xs }]}>
            Mode d&apos;intervention souhaité
          </Text>
          <View style={[styles.chips, { marginBottom: spacing.lg }]}>
            <Chip
              label="Sans préférence"
              active={preferredTravel === null}
              onPress={() => setPreferredTravel(null)}
            />
            <Chip label="En atelier" active={preferredTravel === 'WORKSHOP'} onPress={() => setPreferredTravel('WORKSHOP')} />
            <Chip label="À domicile" active={preferredTravel === 'HOME'} onPress={() => setPreferredTravel('HOME')} />
          </View>

          <AddressInput
            label="Localisation"
            value={locationLabel}
            onChangeText={setLocationLabel}
            onSelect={(res) => {
              setLocationLabel(res.label);
              setPostalCode(res.postcode);
            }}
            error={fields.locationLabel || fields.postalCode}
            placeholder="Saisissez une adresse..."
          />

          <Field
            label="Informations complémentaires"
            value={details}
            onChangeText={setDetails}
            error={fields.details}
            helperText="Facultatif"
            counter={{ current: details.length, max: 1000 }}
            multiline
            minHeight={90}
          />

          <Card style={{ marginTop: spacing.sm }}>
            <Text style={[styles.hint, { color: palette.muted }]}>
              Cette demande n&apos;est visible que par ce réparateur. Il a 7 jours pour vous répondre.
            </Text>
          </Card>

          {(existingOpenDemande || formError === QUOTE_ALREADY_OPEN) && (
            <Card
              style={{
                backgroundColor: palette.mist,
                borderColor: palette.line,
                marginTop: spacing.md,
                padding: spacing.md,
              }}
            >
              <Text style={[styles.label, { color: palette.ink, marginBottom: 4 }]}>
                Demande en cours
              </Text>
              <Text style={[styles.hint, { color: palette.muted, marginBottom: spacing.md }]}>
                {QUOTE_ALREADY_OPEN}
              </Text>
              <Button
                label="Voir ma demande en cours"
                variant="secondary"
                onPress={() => {
                  if (existingOpenDemande) {
                    router.push(`/demande/${existingOpenDemande.id}`);
                  } else {
                    router.push('/commandes');
                  }
                }}
              />
            </Card>
          )}

          {formError && formError !== QUOTE_ALREADY_OPEN && (
            <Text style={[styles.error, { color: palette.red, marginTop: spacing.md }]}>{formError}</Text>
          )}

          {isClientModeError && (
            <View style={{ marginTop: spacing.sm }}>
              <Button
                label="Passer en mode client"
                variant="secondary"
                loading={switchingMode}
                onPress={() => void handleSwitchToClientMode()}
              />
            </View>
          )}

          <View style={{ marginTop: spacing.xl }}>
            <Button
              label="Envoyer la demande"
              loading={create.isPending}
              disabled={uploading || !repairerId || repairer.isError || Boolean(existingOpenDemande) || switchingMode}
              onPress={() => void submit()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12.5 },
  hint: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, lineHeight: 18 },
  error: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5 },
  link: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },
  sentTitle: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 19, textAlign: 'center' },
  tick: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
