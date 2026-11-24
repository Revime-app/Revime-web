import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { Field } from '../../src/components/Field';
import { SelectField } from '../../src/components/SelectField';
import { CatalogPickerSheet } from '../../src/components/CatalogPickerSheet';
import { AddressInput } from '../../src/components/AddressInput';
import { Button } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { Card } from '../../src/components/Card';
import { WizardProgress } from '../../src/components/WizardProgress';
import { DemandeFeed } from '../../src/components/DemandeFeed';
import { useTourPage, useTourTarget } from '../../src/tour/use-tour';
import { PhotoPicker, type PickedPhoto } from '../../src/components/PhotoPicker';
import { useSessionContext } from '../../src/lib/session';
import {
  useCategories,
  useCatalogBrands,
  useCatalogModels,
  useCreateDemande,
} from '../../src/lib/queries';
import { useTabBarSpace } from '../../src/lib/use-tab-bar-space';
import { api, ApiError } from '../../src/lib/api';
import { initDraftId, resetDraftId } from '../../src/lib/photo-upload';
import { DEMANDE_DESCRIPTION_MIN, DEMANDE_TITLE_MIN, categoryTree, normalisePriceInput } from '@revime/shared';
import { canContinueStep } from '../../src/lib/publish-wizard';
import type { CategoryDto, CreateDemandeInput, MeResponse, PublicBrandDto, PublicDeviceModelDto } from '@revime/shared';
import { RevimeLoader } from '../../src/components/lottie/RevimeLoader';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

const TOTAL_STEPS = 4;

export default function Publier() {
  const { palette, spacing, type, accent } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const { me, refresh } = useSessionContext();
  const router = useRouter();
  const categories = useCategories();
  const createDemande = useCreateDemande();

  // Destructured to a string on purpose. useLocalSearchParams returns a NEW
  // object every render, so an effect depending on the object itself would
  // loop forever.
  const { categoryId: preselect, matching: matchingParam } = useLocalSearchParams<{
    categoryId?: string;
    /** CF4-26: the dashboard's MATCHING line opens this feed with « Pour moi » on. */
    matching?: string;
  }>();

  const [step, setStep] = useState(1);
  const [categoryId, setCategoryId] = useState('');
  const [openParentId, setOpenParentId] = useState<string | null>(null);

  // CF5-05: Catalog-driven Brand and Model selection with free-text fallback
  const [brand, setBrand] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [brandIsCustom, setBrandIsCustom] = useState(false);
  const [brandModalVisible, setBrandModalVisible] = useState(false);

  const [model, setModel] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelIsCustom, setModelIsCustom] = useState(false);
  const [modelModalVisible, setModelModalVisible] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [parts, setParts] = useState<CreateDemandeInput['parts']>('UNKNOWN');
  const [mode, setMode] = useState<'OFFERS' | 'BUDGET'>('OFFERS');
  const [budget, setBudget] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [switchingMode, setSwitchingMode] = useState(false);

  const activeMode = me?.profile.activeMode ?? 'CLIENT';

  const tree = useMemo(() => categoryTree(categories.data ?? []), [categories.data]);
  const openParent = tree.find((p) => p.id === openParentId) ?? null;

  const brandsQuery = useCatalogBrands(categoryId || null);
  const modelsQuery = useCatalogModels(selectedBrandId, categoryId || null);

  const handleCategorySelect = (newCatId: string) => {
    if (newCatId !== categoryId) {
      setCategoryId(newCatId);
      setBrand('');
      setSelectedBrandId(null);
      setBrandIsCustom(false);
      setModel('');
      setSelectedModelId(null);
      setModelIsCustom(false);
    }
  };

  /**
   * Initialize draft ID on mount and reset on unmount. One wizard session is one
   * prefix in storage.
   */
  useEffect(() => {
    initDraftId();
    return () => resetDraftId();
  }, []);

  /**
   * A category chosen on the Recherche tab. Expo Router keeps tab screens
   * mounted, so this must key on the param VALUE - keying on anything that
   * changes per render would clobber an in-progress draft continuously.
   *
   * `useLocalSearchParams` is the right hook here rather than the global one:
   * it updates whenever the URL conforms to this route, which it does, and it
   * leaves other screens alone.
   *
   * Only the category and the step are touched. Title, description, budget and
   * location are the user's work and are never reset.
   */
  useEffect(() => {
    if (!preselect) return;
    if (preselect !== categoryId) {
      setCategoryId(preselect);
      setBrand('');
      setSelectedBrandId(null);
      setBrandIsCustom(false);
      setModel('');
      setSelectedModelId(null);
      setModelIsCustom(false);
    }
    const parentOf = tree.find((p) => p.children.some((c) => c.id === preselect));
    setOpenParentId(parentOf?.id ?? null);
    setStep(1);
  }, [preselect, tree]);

  /** Which wizard step owns each field the server can reject. Used to send the
   *  user back to the step that holds the offending input rather than leaving
   *  them on the recap reading about a field three screens back. */
  const FIELD_STEP: Record<string, number> = {
    categoryId: 1, brand: 1, model: 1, title: 1, photoPaths: 1,
    description: 2, parts: 2,
    mode: 3, budgetCents: 3, locationLabel: 3, postalCode: 3,
  };

  // V8 E2: one tab, two pages. The client's bubbles show on the wizard's first step only, once the
  // categories are in; the repairer's « Demandes » feed has its title and « Pour moi » chip at once.
  useTourPage(activeMode === 'REPAIRER' ? 'demandes' : 'publier', activeMode === 'REPAIRER' || (!categories.isPending && step === 1));
  const progressTarget = useTourTarget('publierProgress');
  const categoryTarget = useTourTarget('publierCategory');

  // Réparateur mode gets the demande feed in part 2, not the publish wizard.
  if (activeMode === 'REPAIRER') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenMotif v={3} variant="navy" />
        <DemandeFeed matchingRequest={matchingParam === '1'} />
      </SafeAreaView>
    );
  }

  const submit = async () => {
    setFields({});
    setFormError(null);

    const input = {
      categoryId,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      title: title.trim(),
      description: description.trim(),
      parts,
      mode,
      budgetCents: mode === 'BUDGET' ? Math.round(Number(budget) * 100) : undefined,
      locationLabel: locationLabel.trim(),
      postalCode: postalCode.trim(),
      photoPaths: photos.filter((p) => p.state === 'done').map((p) => p.path!),
    } as CreateDemandeInput;

    try {
      await createDemande.mutateAsync(input);
      // Reset the draft ID so the next wizard session gets a fresh prefix. Without
      // this, Expo Router's tab screen mounting means one app launch = one prefix
      // instead of one wizard session = one prefix.
      resetDraftId();
      initDraftId();
      // Clear the wizard state for the next use
      setCategoryId('');
      setOpenParentId(null);
      setBrand('');
      setSelectedBrandId(null);
      setBrandIsCustom(false);
      setModel('');
      setSelectedModelId(null);
      setModelIsCustom(false);
      setTitle('');
      setDescription('');
      setParts('UNKNOWN');
      setMode('OFFERS');
      setBudget('');
      setLocationLabel('');
      setPostalCode('');
      setPhotos([]);
      setStep(1);
      router.replace('/(tabs)');
    } catch (error) {
      if (error instanceof ApiError) {
        setFields(error.fields ?? {});
        setFormError(error.fields ? null : error.message);
        const steps = Object.keys(error.fields ?? {}).map((f) => FIELD_STEP[f]).filter((s): s is number => s !== undefined);
        if (steps.length > 0) setStep(Math.min(...steps));
        // A field the client bundle does not know about (older app, newer server)
        // would otherwise change nothing and show nothing.
        if (steps.length === 0) setFormError(error.message);
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

  // V7 FND7-074: the minimums live in @revime/shared, never here (see publish-wizard.ts).
  const canContinue = canContinueStep(step, {
    categoryId,
    title,
    photosUploading: photos.some((p) => p.state === 'uploading'),
    description,
    postalCode,
    locationLabel,
    mode,
    budget,
  });

  /**
   * Gated BEFORE the wizard rather than at submit, so nobody fills four steps only
   * to be refused.
   *
   * Keyed on the server's own `verificationRequired`, never on the level alone.
   * The gate ships OFF, so a client gating on level would refuse to publish while
   * the server was still happily accepting it - and would block the client on the
   * next build even though nothing on the server had changed.
   */
  if (me?.verificationRequired === true && me.profile.verificationLevel === 'NONE') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenMotif v={3} variant="accent" />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: tabBarSpace }}>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_700Bold',
              fontSize: type.screenTitle.size,
              color: palette.ink,
              marginBottom: spacing.md,
            }}
          >
            Publier une demande
          </Text>
          <Text style={hintStyle(palette)}>
            Pour publier une demande, confirmez votre adresse e-mail ou votre numéro de mobile. Cela
            prend moins d&apos;une minute.
          </Text>
          <View style={{ marginTop: spacing.lg }}>
            <Button label="Confirmer mon compte" onPress={() => router.push('/verification')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={3} variant="accent" />
      {/* Steps 1 to 3 all carry text inputs - title, description, postal code,
          budget - and the wizard's buttons sit at the very bottom, so without this
          the keyboard covers whichever field is being filled. */}
      <KeyboardAvoider style={styles.avoid}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: tabBarSpace }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_700Bold',
            fontSize: type.screenTitle.size,
            color: palette.ink,
            marginBottom: spacing.md,
          }}
        >
          Publier une demande
        </Text>
        <View {...progressTarget}>
          <WizardProgress step={step} total={TOTAL_STEPS} />
        </View>

        {step === 1 && (
          <View>
            <Text {...categoryTarget} style={labelStyle(palette, spacing)}>Catégorie</Text>

            {categories.isPending && <RevimeLoader variant="fill" size={32} centered={false} text="Chargement…" />}

            {categories.isError && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={{ color: palette.red }}>Impossible de charger les catégories.</Text>
                {/* Without this there is no way back: the wizard has no
                    pull-to-refresh and useCategories has staleTime Infinity, so
                    a failed load stranded the user on step 1. */}
                <Pressable onPress={() => void categories.refetch()} style={{ marginTop: 6 }}>
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_600SemiBold',
                      fontSize: 13,
                      color: accent.accent,
                    }}
                  >
                    Réessayer
                  </Text>
                </Pressable>
              </View>
            )}

            {/* 🆕 `CF-33`, 2026-08-31: there is a SECOND drill-in category selector following this
                pattern. It was deliberately NOT extracted into a shared component - the two
                differ in kind (this one is single-select inside a wizard step with a preselect handoff from
                the Recherche tab; that one is a filter with an « all » state) and this file is the client's
                demande-creation path in a workspace with no tests. See the design doc §15.

                🛑 CORRECTED 2026-09-02 by `CF-34`: that second copy is now in
                `src/components/DirectoryFilterSheet.tsx`, NOT in `RepairerDirectory.tsx` where this
                comment used to point - the chips moved off the screen and into its filter sheet.

                🛑 So if you change the interaction here, read that file too. If a THIRD consumer appears,
                that is the point to extract rather than to copy again. */}

            {/* Gated on !isError so a failed refetch cannot render stale chips
                under the error banner. */}
            {!categories.isError && openParent === null && (
              <View style={styles.chips}>
                {tree.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.labelFr}
                    chevron={p.children.length > 0}
                    active={categoryId === p.id}
                    onPress={() =>
                      p.children.length > 0 ? setOpenParentId(p.id) : handleCategorySelect(p.id)
                    }
                  />
                ))}
              </View>
            )}

            {!categories.isError && openParent !== null && (
              <View>
                <Pressable onPress={() => setOpenParentId(null)}>
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_600SemiBold',
                      fontSize: 13,
                      color: accent.accent,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {'←'} Toutes les catégories
                  </Text>
                </Pressable>

                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_700Bold',
                    fontSize: 15,
                    color: palette.ink,
                    marginBottom: spacing.sm,
                  }}
                >
                  {openParent.labelFr}
                </Text>

                <View style={styles.chips}>
                  {openParent.children.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.labelFr}
                      active={categoryId === c.id}
                      onPress={() => handleCategorySelect(c.id)}
                    />
                  ))}
                </View>

                <View style={{ height: spacing.md }} />

                {/* Secondary, so it never competes with Continuer. This is where
                    "any node is selectable" actually reaches the user. */}
                <Button
                  label={`Choisir ${openParent.labelFr}`}
                  variant="secondary"
                  onPress={() => handleCategorySelect(openParent.id)}
                />
              </View>
            )}

            {fields.categoryId && <Text style={errStyle(palette)}>{fields.categoryId}</Text>}

            <View style={{ height: spacing.lg }} />

            {/* Marque */}
            {brandIsCustom ? (
              <View>
                <Field
                  label="Marque"
                  value={brand}
                  onChangeText={setBrand}
                  placeholder="ex. Apple"
                  error={fields.brand}
                />
                <Pressable
                  onPress={() => {
                    setBrandIsCustom(false);
                    setBrand('');
                    setSelectedBrandId(null);
                    setModel('');
                    setSelectedModelId(null);
                    setModelIsCustom(false);
                  }}
                  style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}
                >
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_600SemiBold',
                      fontSize: 12.5,
                      color: accent.accent,
                    }}
                  >
                    ← Choisir dans le catalogue
                  </Text>
                </Pressable>
              </View>
            ) : (
              <SelectField
                label="Marque"
                value={brand}
                placeholder="Sélectionner une marque"
                error={fields.brand}
                onPress={() => setBrandModalVisible(true)}
              />
            )}

            {/* Modèle */}
            {brandIsCustom || modelIsCustom ? (
              <View>
                <Field
                  label="Modèle"
                  value={model}
                  onChangeText={setModel}
                  placeholder="ex. iPhone 13"
                  error={fields.model}
                />
                {!brandIsCustom && (
                  <Pressable
                    onPress={() => {
                      setModelIsCustom(false);
                      setModel('');
                      setSelectedModelId(null);
                    }}
                    style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}
                  >
                    <Text
                      style={{
                        fontFamily: 'GoogleSansFlex_600SemiBold',
                        fontSize: 12.5,
                        color: accent.accent,
                      }}
                    >
                      ← Choisir dans le catalogue
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <SelectField
                label="Modèle"
                value={model}
                placeholder={
                  !selectedBrandId
                    ? "Sélectionnez d'abord une marque"
                    : 'Sélectionner un modèle'
                }
                disabled={!selectedBrandId}
                error={fields.model}
                onPress={() => {
                  if (selectedBrandId) {
                    setModelModalVisible(true);
                  }
                }}
              />
            )}
            <Field
              label="Titre de la demande"
              value={title}
              onChangeText={setTitle}
              error={fields.title}
              helperText={`Au moins ${DEMANDE_TITLE_MIN} caractères`}
              counter={{ current: title.length, min: DEMANDE_TITLE_MIN, max: 120 }}
              placeholder="ex. Écran iPhone 13 fissuré"
            />
            <View style={{ height: spacing.lg }} />
            <PhotoPicker photos={photos} onChange={setPhotos} />
            {fields.photoPaths && <Text style={errStyle(palette)}>{fields.photoPaths}</Text>}
          </View>
        )}

        {step === 2 && (
          <View>
            <Field
              label="Description du problème"
              value={description}
              onChangeText={setDescription}
              error={fields.description}
              helperText={`Au moins ${DEMANDE_DESCRIPTION_MIN} caractères`}
              counter={{ current: description.length, min: DEMANDE_DESCRIPTION_MIN, max: 2000 }}
              multiline
              minHeight={120}
              placeholder="Décrivez la panne, quand elle est apparue, ce que vous avez déjà tenté."
            />
            <Text style={labelStyle(palette, spacing)}>Pièces / matériel</Text>
            <View style={styles.chips}>
              <Chip
                label="Je ne sais pas"
                active={parts === 'UNKNOWN'}
                onPress={() => setParts('UNKNOWN')}
              />
              <Chip
                label="Pièce d'origine"
                active={parts === 'ORIGINAL'}
                onPress={() => setParts('ORIGINAL')}
              />
              <Chip
                label="Pièce compatible"
                active={parts === 'COMPATIBLE'}
                onPress={() => setParts('COMPATIBLE')}
              />
              <Chip
                label="Je fournis la pièce"
                active={parts === 'CLIENT_SUPPLIED'}
                onPress={() => setParts('CLIENT_SUPPLIED')}
              />
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={labelStyle(palette, spacing)}>Comment souhaitez-vous procéder ?</Text>
            <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
              <ModeCard
                title="Recevoir des offres"
                body="Les réparateurs vous proposent un prix, un délai et une garantie. Vous comparez."
                active={mode === 'OFFERS'}
                onPress={() => setMode('OFFERS')}
              />
              <ModeCard
                title="Fixer mon budget"
                body="Vous annoncez le montant que vous souhaitez consacrer à la réparation."
                active={mode === 'BUDGET'}
                onPress={() => setMode('BUDGET')}
              />
            </View>

            {mode === 'BUDGET' && (
              <Field
                label="Votre budget (€)"
                value={budget}
                onChangeText={(t) => setBudget(normalisePriceInput(t))}
                error={fields.budgetCents}
                keyboardType="decimal-pad"
                placeholder="ex. 80"
              />
            )}

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
            {postalCode ? (
              <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, color: palette.muted, marginBottom: spacing.lg }}>
                Code postal : {postalCode}
              </Text>
            ) : null}
          </View>
        )}

        {step === 4 && (
          <Card>
            <RecapRow label="Catégorie" value={categoryLabel(categories.data, categoryId)} />
            <RecapRow label="Objet" value={[brand, model].filter(Boolean).join(' ') || ''} />
            <RecapRow label="Titre" value={title} />
            <RecapRow label="Problème" value={description} />
            <RecapRow label="Pièces" value={PARTS_LABELS[parts]} />
            <RecapRow
              label="Mode"
              value={mode === 'BUDGET' ? `Budget fixé · ${budget.replace('.', ',')} €` : 'Recevoir des offres'}
            />
            <RecapRow label="Localisation" value={`${locationLabel} · ${postalCode}`} />
            <RecapRow label="Photos" value={`${photos.filter((p) => p.state === 'done').length} photo(s)`} />
          </Card>
        )}

        {formError && (
          <Text style={{ ...errStyle(palette), marginTop: spacing.md }}>{formError}</Text>
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

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
          {step > 1 && (
            <View style={{ flex: 1 }}>
              <Button label="Retour" variant="secondary" onPress={() => setStep((s) => s - 1)} />
            </View>
          )}
          <View style={{ flex: 2 }}>
            {step < TOTAL_STEPS ? (
              <Button
                label="Continuer"
                disabled={!canContinue}
                onPress={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
              />
            ) : (
              <Button
                label="Publier ma demande"
                loading={createDemande.isPending}
                onPress={submit}
              />
            )}
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoider>

      {/* Catalog Brand Picker Sheet */}
      <CatalogPickerSheet<PublicBrandDto>
        visible={brandModalVisible}
        title="Choisir une marque"
        items={brandsQuery.data ?? []}
        selectedValue={selectedBrandId ?? undefined}
        isLoading={brandsQuery.isPending}
        onSelect={(b) => {
          setBrand(b.name);
          setSelectedBrandId(b.id);
          setBrandIsCustom(false);
          setBrandModalVisible(false);
          // Reset model on brand change
          setModel('');
          setSelectedModelId(null);
          setModelIsCustom(false);
        }}
        onSelectOther={() => {
          setBrand('');
          setSelectedBrandId(null);
          setBrandIsCustom(true);
          setBrandModalVisible(false);
          // When brand is custom, model is also custom
          setModel('');
          setSelectedModelId(null);
          setModelIsCustom(true);
        }}
        onClose={() => setBrandModalVisible(false)}
        otherLabel="Autre marque (saisie libre)"
      />

      {/* Catalog Model Picker Sheet */}
      <CatalogPickerSheet<PublicDeviceModelDto>
        visible={modelModalVisible}
        title={`Modèle ${brand ? `· ${brand}` : ''}`}
        items={modelsQuery.data ?? []}
        selectedValue={selectedModelId ?? undefined}
        isLoading={modelsQuery.isPending}
        onSelect={(m) => {
          setModel(m.name);
          setSelectedModelId(m.id);
          setModelIsCustom(false);
          setModelModalVisible(false);
        }}
        onSelectOther={() => {
          setModel('');
          setSelectedModelId(null);
          setModelIsCustom(true);
          setModelModalVisible(false);
        }}
        onClose={() => setModelModalVisible(false)}
        otherLabel="Autre modèle (saisie libre)"
      />
    </SafeAreaView>
  );
}

const PARTS_LABELS: Record<CreateDemandeInput['parts'], string> = {
  UNKNOWN: 'Je ne sais pas',
  ORIGINAL: "Pièce d'origine",
  COMPATIBLE: 'Pièce compatible',
  CLIENT_SUPPLIED: 'Je fournis la pièce',
};

/** « Électronique · Smartphones » for a subcategory, « Électronique » for a
 *  top-level one. With 36 leaves and two near-duplicates across parents
 *  ("Jouets" under Famille, "Jeux & jouets" under Loisirs), a bare leaf label
 *  is ambiguous on the recap. */
function categoryLabel(categories: CategoryDto[] | undefined, id: string): string {
  const found = categories?.find((c) => c.id === id);
  if (!found) return '';
  if (found.parentId === null) return found.labelFr;
  const parent = categories?.find((c) => c.id === found.parentId);
  return parent ? `${parent.labelFr} · ${found.labelFr}` : found.labelFr;
}

function ModeCard({
  title,
  body,
  active,
  onPress,
}: {
  title: string;
  body: string;
  active: boolean;
  onPress: () => void;
}) {
  const { accent, palette, radii, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: spacing.lg,
        borderRadius: radii.card,
        borderWidth: 1.5,
        borderColor: active ? accent.accent : palette.line,
        backgroundColor: active ? accent.accentSoft : palette.paper,
      }}
    >
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
        {title}
      </Text>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_400Regular',
          fontSize: 13,
          color: palette.muted,
          marginTop: 4,
        }}
      >
        {body}
      </Text>
    </Pressable>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  const { palette, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, color: palette.muted }}>
        {label}
      </Text>
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14.5, color: palette.ink }}>
        {value}
      </Text>
    </View>
  );
}

const labelStyle = (palette: { ink2: string }, spacing: { xs: number }) => ({
  fontFamily: 'GoogleSansFlex_600SemiBold' as const,
  fontSize: 12.5,
  color: palette.ink2,
  marginBottom: spacing.xs,
});

const hintStyle = (palette: { muted: string }) => ({
  fontFamily: 'GoogleSansFlex_400Regular' as const,
  fontSize: 13,
  color: palette.muted,
});

const errStyle = (palette: { red: string }) => ({
  fontFamily: 'GoogleSansFlex_500Medium' as const,
  fontSize: 12.5,
  color: palette.red,
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  avoid: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
