import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  DEMANDE_FIELD_CLASS,
  categoryTree,
  DEMANDE_DESCRIPTION_MIN,
  DEMANDE_TITLE_MIN,
  demandeEditPolicy,
  euros,
  normalisePriceInput,
  type CategoryDto,
  type DemandeStatus,
  type EditableDemandeField,
  type PublicBrandDto,
  type PublicDeviceModelDto,
  type UpdateDemandeInput,
} from '@revime/shared';
import { useTheme } from '../../../src/theme';
import { ScreenMotif } from '../../../src/components/ScreenMotif';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { Field } from '../../../src/components/Field';
import { RevimeLoader } from '../../../src/components/lottie/RevimeLoader';
import { SelectField } from '../../../src/components/SelectField';
import { CatalogPickerSheet } from '../../../src/components/CatalogPickerSheet';
import { Button } from '../../../src/components/Button';
import { Chip } from '../../../src/components/Chip';
import { PhotoPicker, type PickedPhoto } from '../../../src/components/PhotoPicker';
import {
  useCategories,
  useCatalogBrands,
  useCatalogModels,
  useDeleteDemande,
  useDemande,
  useUpdateDemande,
} from '../../../src/lib/queries';
import { ApiError } from '../../../src/lib/api';
import { currentDraftId, initDraftId, resetDraftId } from '../../../src/lib/photo-upload';
import { IconCancel, IconImage } from '../../../src/icons';
import { KeyboardAvoider } from '../../../src/components/KeyboardAvoider';

/**
 * `CF-16` / `CF-17`. « Modifier la demande » - the ONLY surface a client ever sees for editing or
 * deleting their own demande. `PATCH /demandes/:id` and `DELETE /demandes/:id` behind it, with
 * `demandeEditPolicy` and `DEMANDE_FIELD_CLASS` imported from the package that declares them
 * rather than restated, so this screen cannot offer a control the server refuses.
 *
 * The controls are BORROWED from `app/(tabs)/publier.tsx` - `Field`, the parts chips, the
 * category drill-in, `PhotoPicker`, the two mode cards - and that wizard is deliberately
 * untouched: spec §6.3 rejected reusing it, and `CF-D7`'s descriptive/contract split cuts across
 * its four steps, so a shared component would have to take the split as a prop on every field.
 *
 * 🛑 FIELD ORDER DIFFERS FROM THE WIZARD ON PURPOSE. The six descriptive fields come first and
 * the five contract fields sit together at the end, because a contract lock needs ONE explanation
 * for the group; interleaved, it would need five, or one line floating away from what it
 * explains.
 *
 * 🛑 EVERY FUNCTIONAL COLOUR HERE IS `palette.red*`, NEVER `accent.*`. `app/_layout.tsx` picks the
 * theme from `activeMode` and `accents.pro` maps `accent → palette.navy`, so a warning painted
 * with `accent.accentDeep` is body ink in réparateur mode. This is a client screen and every live
 * account is a réparateur sitting in client mode, but hardcoding the functional colour removes
 * the trap rather than depending on the mode.
 */

/** First-person, matching the wizard: the CLIENT is choosing here, not reading a réparateur's. */
const PARTS_OPTIONS: { value: UpdateDemandeInput['parts']; label: string }[] = [
  { value: 'UNKNOWN', label: 'Je ne sais pas' },
  { value: 'ORIGINAL', label: "Pièce d'origine" },
  { value: 'COMPATIBLE', label: 'Pièce compatible' },
  { value: 'CLIENT_SUPPLIED', label: 'Je fournis la pièce' },
];

/**
 * Why this demande is no longer editable, one line per status.
 *
 * TOTAL over `DemandeStatus`, so a fifth status is `TS2741` here rather than a blank refusal
 * screen - the mechanism `DEMANDE_FIELD_CLASS` and `ICON_FOR` already earn their keep with.
 *
 * `OPEN` is unreachable while `demandeEditPolicy` keys `canEdit` on `status === 'OPEN'`, and it
 * carries a real sentence anyway rather than an empty string: if that policy ever gains a second
 * condition, this row is what the client reads, and « » would render as a blank screen.
 */
const NOT_EDITABLE_REASON: Record<DemandeStatus, string> = {
  OPEN: 'Cette demande ne peut plus être modifiée.',
  IN_PROGRESS: 'Une offre a été acceptée : cette demande ne peut plus être modifiée.',
  DONE: 'Cette demande est terminée : elle ne peut plus être modifiée.',
  CANCELLED: 'Cette demande a été annulée : elle ne peut plus être modifiée.',
};

/**
 * The remedy for a stored photo whose signed url is missing, in ONE place because it is rendered
 * twice - in the notice beside the placeholder tiles, and appended to a `photoPaths` error for the
 * author who hits the refusal anyway.
 *
 * 🛑 THIS SENTENCE IS THE CORRECTION OF A FALSE GUARANTEE, so do not soften it back. The notice
 * used to say the photo « est conservée si vous enregistrez », full stop. That is true only while
 * the photo set is left alone, and false in exactly the case this screen invites:
 *
 *   - `DemandesService.update` runs `assertPhotosAttachable` only when `photoPaths` MOVED, so a
 *     text-only edit resubmits the same paths, skips the check and preserves the row. ✅
 *   - The moment a photo is added or removed, that check lists each draft prefix in storage and
 *     refuses the WHOLE save with « Photo introuvable. » for any submitted path it cannot find.
 *   - A null url is what a missing object looks like: `createSignedReadUrls` keeps a path only
 *     when Supabase returns no per-path error.
 *
 * So the entry must still be submitted - nothing may delete a photo the author did not remove -
 * and the only way through is to remove it deliberately first. Saying « conservée » unconditionally
 * left the author with an error naming a file they cannot see and no idea what to do about it.
 */
function removeUnavailableFirst(count: number): string {
  return count === 1
    ? "Pour ajouter ou retirer une photo, supprimez d'abord la vignette grisée ci-dessous."
    : "Pour ajouter ou retirer une photo, supprimez d'abord les vignettes grisées ci-dessous.";
}

/**
 * Which server field errors this screen has somewhere to render.
 *
 * TOTAL over `EditableDemandeField` for the same reason as the map above, and it does real work:
 * a 422 naming a field the installed binary does not render would otherwise change nothing and
 * show nothing - the failure `publier.tsx` guards with `steps.length === 0`. Anything absent from
 * this map falls back to the envelope's own French message.
 */
const RENDERS_FIELD_ERROR: Record<EditableDemandeField, true> = {
  title: true,
  description: true,
  brand: true,
  model: true,
  parts: true,
  photoPaths: true,
  categoryId: true,
  mode: true,
  budgetCents: true,
  locationLabel: true,
  postalCode: true,
};

export default function ModifierDemande() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const demandeId = id ?? '';
  const { palette, radii, spacing } = useTheme();
  const router = useRouter();

  const demande = useDemande(demandeId);
  const categories = useCategories();
  const update = useUpdateDemande(demandeId);
  const remove = useDeleteDemande(demandeId);

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
  const [parts, setParts] = useState<UpdateDemandeInput['parts']>('UNKNOWN');
  const [mode, setMode] = useState<UpdateDemandeInput['mode']>('OFFERS');
  const [budget, setBudget] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [postalCode, setPostalCode] = useState('');
  /**
   * The photo grid, existing and newly picked in ONE array so `PhotoPicker` owns the whole of it
   * - its « Photos · n/10 » counter, its cap, its remove buttons and the display order. An
   * existing photo is a `PickedPhoto` with `state: 'done'`, its storage `path` already set and
   * its signed `url` standing in for `localUri`, which is what the tile renders.
   */
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  /**
   * 🛑 Stored photos whose signed url came back NULL, held apart from the grid above and rendered
   * as their own placeholder tiles below it.
   *
   * `DemandeDto.photos` keeps an unsignable entry with `url: null` precisely so its length always
   * equals the number of stored rows - dropping one here would omit its path from the next save,
   * and the server replaces the whole set, so it would DELETE a photo the author never chose to
   * remove.
   *
   * They are not fed to `PhotoPicker` because it renders `<Image source={{ uri: localUri }}>`
   * unconditionally, and React Native's own `Image` warns « source.uri should not be an empty
   * string » (`Libraries/Image/Image.ios.js:131`) on every render for a placeholder with no url.
   * The cost of keeping them out is that the picker's counter and its ten-photo cap understate
   * the total by however many are unavailable - normally ZERO, since a null url means the storage
   * object behind a row is gone. The notice beside the tiles says so, and the server's own
   * « Dix photos au maximum. » lands on `photoPaths`, which this screen renders.
   */
  const [unavailable, setUnavailable] = useState<string[]>([]);
  /**
   * The stored paths in their stored order, captured at seed time.
   *
   * Load-bearing for two reasons. `changedDemandeFields` compares the submitted array against
   * `sortOrder` INDEX BY INDEX, so resubmitting the same photos in a different order counts as a
   * change and churns every photo row; and it is how a newly added path is told apart from a
   * surviving one when the payload is assembled.
   */
  const [storedPaths, setStoredPaths] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  /**
   * Whether the prefill has landed. STATE and not a ref, because the form is gated on it: an
   * effect runs after the paint, so a form rendered before it would show one frame of EMPTY
   * inputs - and that frame is the common case, not an edge one, since the demande detail screen
   * queries this same key and hands the cache over warm. A ref would not re-render when it
   * flipped; this does.
   */
  const [seeded, setSeeded] = useState(false);

  /**
   * 🛑 `?? null` AT ENTRY, and it is a gate rather than tidiness.
   *
   * `photos` is author-only: `[]` for an author with none, `null` for anybody else. It is also
   * NEW in this slice, so an app newer than the API it is pointed at receives `undefined` - and
   * `undefined !== null` would read as « the author, with no photos », prefill an empty grid, and
   * the next save would delete every photo on the demande. Collapsing absent and null into one
   * representation makes that case refuse the form instead, which is the safe direction: the
   * PATCH route ships in the same deploy as this field, so an API without one has neither.
   *
   * `[]` and `null` stay distinct. Only `undefined` joins `null`.
   */
  const d = demande.data;
  const photosField = d ? (d.photos ?? null) : null;
  const isAuthor = photosField !== null;

  /**
   * Fail-safe for the same stale-API case: a missing `offerCount` would make `contractLocked`
   * false and unlock fields an offer has already been quoted against. The `photosField` gate
   * above is the primary defence - both fields landed in one deploy - so this is defence in
   * depth, and `1` is not a count, it is « assume at least one offer ».
   */
  const offerCount = d ? (d.offerCount ?? 1) : 0;
  const policy = d
    ? demandeEditPolicy(d.status, offerCount)
    : { canEdit: false, contractLocked: false, canDelete: false };

  /**
   * True when the field may not move, asked through `DEMANDE_FIELD_CLASS` rather than against a
   * hand-written list of five names, so `CF-D7`'s split is not restated in a second place the
   * server could come to disagree with.
   *
   * 🛑 BE PRECISE ABOUT WHAT THAT BUYS, because the obvious sentence overstates it: the six
   * DESCRIPTIVE controls below are rendered unconditionally and never ask this function. So
   * reclassifying an existing field descriptive → contract in the package would NOT lock it here -
   * it needs a branch adding, exactly like the five below. What the package's total `Record` does
   * gate is a TWELFTH field, which is `TS2741` there before it can reach this screen at all.
   */
  const locked = (field: EditableDemandeField): boolean =>
    policy.contractLocked && DEMANDE_FIELD_CLASS[field] === 'contract';

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
   * Seeded ONCE, then the form is the source of truth - the pattern
   * `profil-public/description.tsx` documents. A continuous-sync effect would reset the fields
   * when `useUpdateDemande` invalidates this very query, destroying whatever the client had typed
   * since. `categoryId` comes from `demande.category.id`; there is no top-level field for it.
   */
  useEffect(() => {
    // `photosField === null` and NOT `!photosField`: `[]` is truthy in JS so both happen to work,
    // but only one of them SAYS that an author with zero photos must still be seeded.
    if (seeded || !d || photosField === null) return;
    setSeeded(true);
    setCategoryId(d.category.id);
    setBrand(d.brand ?? '');
    setModel(d.model ?? '');
    setTitle(d.title);
    setDescription(d.description);
    setParts(d.parts);
    setMode(d.mode);
    // Cents to the dot-decimal string `normalisePriceInput` produces, so an untouched budget
    // round-trips to the same integer and the diff sees no change.
    setBudget(d.budgetCents != null ? String(d.budgetCents / 100) : '');
    setLocationLabel(d.locationLabel);
    setPostalCode(d.postalCode);
    setStoredPaths(photosField.map((p) => p.path));
    setPhotos(
      photosField
        .filter((p): p is { path: string; url: string } => p.url !== null)
        .map((p) => ({ key: p.path, localUri: p.url, path: p.path, state: 'done' as const })),
    );
    setUnavailable(photosField.filter((p) => p.url === null).map((p) => p.path));
  }, [d, photosField, seeded]);

  /** Auto-match existing brand string to catalog brand */
  useEffect(() => {
    if (!seeded || !brand || selectedBrandId || brandIsCustom || !brandsQuery.data) return;
    const matchingBrand = brandsQuery.data.find(
      (b) => b.name.toLowerCase() === brand.trim().toLowerCase(),
    );
    if (matchingBrand) {
      setSelectedBrandId(matchingBrand.id);
    } else {
      setBrandIsCustom(true);
      setModelIsCustom(true);
    }
  }, [seeded, brand, selectedBrandId, brandIsCustom, brandsQuery.data]);

  /** Auto-match existing model string to catalog model */
  useEffect(() => {
    if (!seeded || !model || selectedModelId || modelIsCustom || !modelsQuery.data) return;
    const matchingModel = modelsQuery.data.find(
      (m) => m.name.toLowerCase() === model.trim().toLowerCase(),
    );
    if (matchingModel) {
      setSelectedModelId(matchingModel.id);
    } else {
      setModelIsCustom(true);
    }
  }, [seeded, model, selectedModelId, modelIsCustom, modelsQuery.data]);

  /**
   * 🛑 A DRAFT ID IS REQUIRED TO ADD A PHOTO, AND IT IS MODULE-LEVEL STATE SHARED WITH THE
   * WIZARD. `uploadPhoto` calls `currentDraftId()`, which THROWS when none is set, so without
   * this every « Ajouter » would fail its tile.
   *
   * The probe is why this is not a copy of the wizard's effect. Expo Router keeps tab screens
   * mounted, so a client can leave a half-filled Publier wizard, reach this screen, and come
   * back: calling `initDraftId()` unconditionally would move the wizard's next upload into this
   * screen's prefix, and `resetDraftId()` on unmount would make it throw instead. So this adopts
   * a live draft id and only owns - and clears - one it created itself. Sharing a prefix costs
   * nothing: `assertPhotosAttachable` already tolerates several, and the cleanup job checks every
   * object against `DemandePhoto` rather than by prefix.
   */
  useEffect(() => {
    let owned = false;
    try {
      currentDraftId();
    } catch {
      initDraftId();
      owned = true;
    }
    return () => {
      if (owned) resetDraftId();
    };
  }, []);

  const uploading = photos.some((p) => p.state === 'uploading');

  /**
   * The full `photoPaths` to submit: the stored survivors FIRST, in their stored order, then
   * whatever was added, in the order it was picked. See `storedPaths` for why the order matters.
   */
  const submittedPhotoPaths = (): string[] => {
    // `flatMap` rather than filter-then-cast: an uploading or failed tile has `path === null`, and
    // this narrows it away without a non-null assertion the compiler cannot check.
    const done = photos.flatMap((p) => (p.state === 'done' && p.path !== null ? [p.path] : []));
    const kept = new Set<string>([...done, ...unavailable]);
    const survivors = storedPaths.filter((path) => kept.has(path));
    const added = done.filter((path) => !storedPaths.includes(path));
    return [...survivors, ...added];
  };

  const submit = async () => {
    setFields({});
    setFormError(null);

    /**
     * The FULL editable set, including the fields nobody touched and the ones the lock disables.
     * `PATCH` is a full replace by contract and the server diffs it: `changedDemandeFields`
     * decides what moved, short-circuits an empty diff before any write, and only then applies
     * the contract lock. So resubmitting a locked field at its stored value is not a refusal -
     * sending a sparse body would be a second, disagreeing definition of « changed ».
     */
    const input: UpdateDemandeInput = {
      categoryId,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      title: title.trim(),
      description: description.trim(),
      parts,
      mode,
      // `undefined` rather than `Math.round(Number('') * 100)` - that is `NaN`, which the schema
      // refuses with « Budget invalide. » where an empty field deserves « Indiquez votre
      // budget. » from the cross-field rule.
      budgetCents:
        mode === 'BUDGET' && budget.trim() !== '' ? Math.round(Number(budget) * 100) : undefined,
      locationLabel: locationLabel.trim(),
      postalCode: postalCode.trim(),
      photoPaths: submittedPhotoPaths(),
    };

    try {
      await update.mutateAsync(input);
      // Back to the demande, whose query this mutation has already invalidated, so the client
      // reads their own change rather than the row they just left.
      router.back();
    } catch (error) {
      if (error instanceof ApiError) {
        const returned = error.fields ?? null;
        setFields(returned ?? {});
        /**
         * A field this binary renders nowhere would otherwise change nothing and show nothing -
         * the failure the wizard's `FIELD_STEP` guards. It is not hypothetical: the validation
         * pipe keys `fields` by `issue.path.join('.')`, so a per-ELEMENT photo issue arrives as
         * `photoPaths.3` and matches nothing here.
         *
         * One rendered key can still be off screen - `budgetCents`, whose control only exists
         * while `mode === 'BUDGET'`. Every route to that error runs through the schema's
         * budget rules, which fire only for `mode: 'BUDGET'`, and the form submits the mode it
         * is displaying, so the control is on screen whenever the error can arrive.
         */
        const unrendered =
          returned === null ||
          Object.keys(returned).some((key) => !(key in RENDERS_FIELD_ERROR));
        setFormError(unrendered ? error.message : null);
        return;
      }
      setFormError('Une erreur est survenue. Merci de réessayer.');
    }
  };

  /** Mirrors `confirmWithdraw` in `mes-propositions.tsx`, destructive style included. */
  const confirmDelete = () => {
    Alert.alert(
      'Supprimer cette demande ?',
      'Les réparateurs qui ont chiffré seront prévenus. Cette action est définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            remove.mutate(undefined, {
              // ONE call landing somewhere guaranteed to exist. Popping back would land on this
              // demande's own screen, whose query now 404s.
              onSuccess: () => router.replace('/mes-demandes'),
              onError: () =>
                Alert.alert('Impossible de supprimer cette demande', 'Merci de réessayer.'),
            });
          },
        },
      ],
    );
  };

  const labelStyle = {
    fontFamily: 'GoogleSansFlex_600SemiBold' as const,
    fontSize: 12.5,
    color: palette.ink2,
    marginBottom: spacing.xs,
  };
  const hintStyle = {
    fontFamily: 'GoogleSansFlex_400Regular' as const,
    fontSize: 12,
    color: palette.muted,
  };
  const errStyle = {
    fontFamily: 'GoogleSansFlex_500Medium' as const,
    fontSize: 12.5,
    color: palette.red,
  };

  /** « Retour » on every branch that renders no form. A pushed screen must never be a dead end. */
  const backButton = (
    <View style={{ marginTop: spacing.lg }}>
      <Button label="Retour" variant="secondary" onPress={() => router.back()} />
    </View>
  );

  const shell = (children: ReactNode) => (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={2} variant="accent" />
      {/* onBack is REQUIRED, not optional polish: this is a pushed screen and ScreenHeader
          renders an empty spacer without it, which would strand the client here. */}
      <ScreenHeader title="Modifier la demande" onBack={() => router.back()} />
      {children}
    </SafeAreaView>
  );

  if (demande.isPending) {
    return shell(
      <View style={styles.loaderContainer}>
        <RevimeLoader variant="fill" size={72} />
      </View>,
    );
  }

  if (demande.isError || !d) {
    return shell(
      <View style={{ padding: spacing.lg }}>
        <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14, color: palette.red }}>
          Impossible de charger cette demande.
        </Text>
        {backButton}
      </View>,
    );
  }

  /**
   * Not the author. `photos` is null for every other viewer, which is the same signal the API
   * uses - no second field to disagree with it - and a réparateur really can reach a demande
   * detail, so this route is reachable by anyone who edits a URL.
   */
  if (!isAuthor) {
    return shell(
      <View style={{ padding: spacing.lg }}>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 14,
            color: palette.ink,
            lineHeight: 20,
          }}
        >
          Vous ne pouvez modifier que vos propres demandes.
        </Text>
        {backButton}
      </View>,
    );
  }

  /**
   * 🛑 NO FORM AT ALL when the demande has left OPEN, rather than a form that fails on submit.
   * This route is reachable by URL, so it cannot rely on its entry point being hidden.
   */
  if (!policy.canEdit) {
    return shell(
      <View style={{ padding: spacing.lg }}>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 14,
            color: palette.ink,
            lineHeight: 20,
          }}
        >
          {NOT_EDITABLE_REASON[d.status]}
        </Text>
        {backButton}
      </View>,
    );
  }

  /**
   * 🛑 AFTER the three refusals above, deliberately: a non-author never seeds, so putting this
   * first would leave them on « Chargement… » for ever instead of reading why they are refused.
   * An author always seeds - the effect's only other conditions are the ones already checked.
   */
  if (!seeded) {
    return shell(
      <View style={styles.loaderContainer}>
        <RevimeLoader variant="fill" size={72} />
      </View>,
    );
  }

  const contractLocked = policy.contractLocked;

  return shell(
    <>
      <KeyboardAvoider style={styles.avoid}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
        {/* ------------------------------------------------------------------ *
         * Descriptive fields. Editable at every offer count - `CF-D7`, and the
         * `DEMANDE_UPDATED` notification is what covers the réparateur's side.
         * ------------------------------------------------------------------ */}
        <Field
          label="Titre de la demande"
          value={title}
          onChangeText={setTitle}
          error={fields.title}
          helperText={`Au moins ${DEMANDE_TITLE_MIN} caractères`}
          counter={{ current: title.length, min: DEMANDE_TITLE_MIN, max: 120 }}
          editable={!update.isPending}
          placeholder="ex. Écran iPhone 13 fissuré"
        />
        <Field
          label="Description du problème"
          value={description}
          onChangeText={setDescription}
          error={fields.description}
          helperText={`Au moins ${DEMANDE_DESCRIPTION_MIN} caractères`}
          counter={{ current: description.length, min: DEMANDE_DESCRIPTION_MIN, max: 2000 }}
          editable={!update.isPending}
          multiline
          minHeight={120}
          placeholder="Décrivez la panne, quand elle est apparue, ce que vous avez déjà tenté."
        />
        {/* Marque */}
        {brandIsCustom ? (
          <View>
            <Field
              label="Marque"
              value={brand}
              onChangeText={setBrand}
              placeholder="ex. Apple"
              error={fields.brand}
              editable={!update.isPending}
            />
            <Pressable
              disabled={update.isPending}
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
                  color: palette.red,
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
            disabled={update.isPending}
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
              editable={!update.isPending}
            />
            {!brandIsCustom && (
              <Pressable
                disabled={update.isPending}
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
                    color: palette.red,
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
            disabled={!selectedBrandId || update.isPending}
            error={fields.model}
            onPress={() => {
              if (selectedBrandId) {
                setModelModalVisible(true);
              }
            }}
          />
        )}

        <Text style={labelStyle}>Pièces / matériel</Text>
        <View style={styles.chips}>
          {PARTS_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              active={parts === o.value}
              onPress={() => setParts(o.value)}
            />
          ))}
        </View>
        {fields.parts !== undefined && (
          <Text style={{ ...errStyle, marginTop: spacing.xs }}>{fields.parts}</Text>
        )}

        <View style={{ height: spacing.lg }} />
        <PhotoPicker photos={photos} onChange={setPhotos} />
        {fields.photoPaths !== undefined && (
          <Text style={{ ...errStyle, marginTop: spacing.xs }}>
            {fields.photoPaths}
            {/* The server's photo message names a file the author cannot see, so on its own it is a
                dead end. Appending the remedy whenever an unavailable entry exists closes the loop
                - and the remedy is the SAME sentence the notice below carries, so the two cannot
                drift.

                Appended for ANY `photoPaths` error rather than only « Photo introuvable. », which
                would mean keying the UI on a server message string. Every error reachable here is
                answered by the same action: « Photo introuvable. » IS this case; « Dix photos au
                maximum. » is relieved by removing the tile too; « Cette photo est en double. » and
                « Photo invalide. » cannot occur, since stored paths passed the shape check when
                they were created and every new path comes from the server itself. */}
            {unavailable.length > 0 ? ` ${removeUnavailableFirst(unavailable.length)}` : ''}
          </Text>
        )}

        {/* The stored photos with no signed url. Kept, removable, and submitted - see the
            `unavailable` state for why dropping one would delete a photo silently. */}
        {unavailable.length > 0 && (
          <View style={{ marginTop: spacing.sm }}>
            <Text style={{ ...hintStyle, marginBottom: spacing.xs }}>
              {unavailable.length === 1
                ? 'Une photo enregistrée ne peut pas être affichée pour le moment. Elle est conservée tant que vous ne modifiez aucune photo.'
                : `${unavailable.length} photos enregistrées ne peuvent pas être affichées pour le moment. Elles sont conservées tant que vous ne modifiez aucune photo.`}{' '}
              {removeUnavailableFirst(unavailable.length)}
            </Text>
            <View style={styles.chips}>
              {unavailable.map((path) => (
                <View key={path} style={styles.tileBox}>
                  <View
                    style={[
                      styles.tile,
                      { backgroundColor: palette.mist, borderColor: palette.line },
                    ]}
                  >
                    <IconImage size={20} color={palette.faint} strokeWidth={1.8} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Supprimer cette photo"
                    onPress={() => setUnavailable((prev) => prev.filter((p) => p !== path))}
                    style={styles.removeButton}
                  >
                    <IconCancel size={13} color="#FFFFFF" strokeWidth={2.5} />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ------------------------------------------------------------------ *
         * Contract fields. Frozen as a GROUP once an offer exists, with one
         * explanation beneath the five rather than one per row.
         * ------------------------------------------------------------------ */}
        <View style={{ height: spacing.xl }} />

        {locked('categoryId') ? (
          // Same expression as the unlocked branch's « Sélection » line, so a locked category
          // reads « Électronique · Smartphones » too - and the DTO's own label is the fallback,
          // which means this renders correctly even if `useCategories` failed entirely.
          <LockedValue
            label="Catégorie"
            value={categoryLabel(categories.data, categoryId) || d.category.labelFr}
            error={fields.categoryId}
          />
        ) : (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={labelStyle}>Catégorie</Text>

            {categories.isPending && <RevimeLoader variant="fill" size={32} centered={false} text="Chargement…" />}

            {categories.isError && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={errStyle}>Impossible de charger les catégories.</Text>
                {/* Without this there is no way back: `useCategories` has `staleTime: Infinity`
                    and this screen has no pull-to-refresh. Same reason as in the wizard. */}
                <Pressable onPress={() => void categories.refetch()} style={{ marginTop: 6 }}>
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_600SemiBold',
                      fontSize: 13,
                      color: palette.red,
                    }}
                  >
                    Réessayer
                  </Text>
                </Pressable>
              </View>
            )}

            {/* The current selection SPELLED OUT, which the wizard does not need and this screen
                does: a prefilled subcategory lights no chip in the top-level grid, so without
                this line an author cannot tell what their demande is filed under until they
                drill in. Falls back to the DTO's own label while the taxonomy is loading. */}
            <Text style={{ ...hintStyle, marginBottom: spacing.sm }}>
              Sélection : {categoryLabel(categories.data, categoryId) || d.category.labelFr}
            </Text>

            {/* Gated on !isError so a failed refetch cannot render stale chips under the error. */}
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
                      color: palette.ink2,
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

                {/* Secondary, so it never competes with the save button. This is where "any node
                    is selectable" reaches the client, exactly as in the wizard. */}
                <Button
                  label={`Choisir ${openParent.labelFr}`}
                  variant="secondary"
                  onPress={() => handleCategorySelect(openParent.id)}
                />
              </View>
            )}

            {fields.categoryId !== undefined && (
              <Text style={{ ...errStyle, marginTop: spacing.xs }}>{fields.categoryId}</Text>
            )}
          </View>
        )}

        {locked('mode') ? (
          // « Mode », the label the wizard's own recap uses for this value, and the two card
          // titles verbatim as the value - a client should read back the words they picked.
          <LockedValue
            label="Mode"
            value={mode === 'BUDGET' ? 'Fixer mon budget' : 'Recevoir des offres'}
            error={fields.mode}
          />
        ) : (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={labelStyle}>Comment souhaitez-vous procéder ?</Text>
            <View style={{ gap: spacing.sm }}>
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
            {fields.mode !== undefined && (
              <Text style={{ ...errStyle, marginTop: spacing.xs }}>{fields.mode}</Text>
            )}
          </View>
        )}

        {/* Only ever shown for a BUDGET demande. `OFFERS` clears the stored amount server-side
            (`effectiveBudgetCents`), so there is nothing to display or to protect. */}
        {mode === 'BUDGET' &&
          (locked('budgetCents') ? (
            <LockedValue
              label="Votre budget"
              value={d.budgetCents != null ? euros(d.budgetCents) : '-'}
              error={fields.budgetCents}
            />
          ) : (
            <Field
              label="Votre budget (€)"
              value={budget}
              onChangeText={(t) => setBudget(normalisePriceInput(t))}
              error={fields.budgetCents}
              editable={!update.isPending}
              keyboardType="decimal-pad"
              placeholder="ex. 80"
            />
          ))}

        {locked('locationLabel') ? (
          <LockedValue
            label="Localisation"
            value={locationLabel}
            error={fields.locationLabel}
          />
        ) : (
          <Field
            label="Localisation"
            value={locationLabel}
            onChangeText={setLocationLabel}
            error={fields.locationLabel}
            editable={!update.isPending}
            placeholder="ex. Lyon 3e"
          />
        )}

        {locked('postalCode') ? (
          <LockedValue label="Code postal" value={postalCode} error={fields.postalCode} />
        ) : (
          <Field
            label="Code postal"
            value={postalCode}
            onChangeText={setPostalCode}
            error={fields.postalCode}
            editable={!update.isPending}
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={5}
            placeholder="ex. 69003"
          />
        )}

        {/* ONE line for the whole group. Red family HARDCODED - see this file's header note on
            `accent.*` in réparateur mode - and it is the same sentence the server answers with
            when a locked field does move, so the two surfaces cannot drift. */}
        {contractLocked && (
          <View
            style={{
              backgroundColor: palette.redSoft,
              padding: spacing.md,
              borderRadius: radii.field,
            }}
          >
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_500Medium',
                fontSize: 12.5,
                color: palette.redDeep,
                lineHeight: 18,
              }}
            >
              Des offres ont été reçues, ces informations ne peuvent plus être modifiées.
            </Text>
          </View>
        )}

        {formError !== null && (
          <Text style={{ ...errStyle, marginTop: spacing.md }}>{formError}</Text>
        )}

        {/* A photo still uploading has no `path` yet, so saving now would submit the demande
            without it and the tile would finish into a form nobody is going to send again. */}
        {uploading && (
          <Text style={{ ...hintStyle, marginTop: spacing.md }}>
            Envoi des photos en cours…
          </Text>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <Button
            label="Enregistrer les modifications"
            disabled={uploading || remove.isPending}
            // `loading` is what makes a double tap harmless: `Button` sets `disabled` on the
            // Pressable whenever it is loading, so the second tap never reaches `onPress`.
            loading={update.isPending}
            onPress={submit}
          />
        </View>

        {/* ------------------------------------------------------------------ *
         * Delete, at the FOOT of the form and not in the header: it must be
         * reached deliberately, past everything above it.
         * ------------------------------------------------------------------ */}
        {policy.canDelete && (
          <View
            style={{
              marginTop: spacing.xl,
              paddingTop: spacing.lg,
              borderTopWidth: 1,
              borderTopColor: palette.line,
            }}
          >
            <Text style={{ ...hintStyle, marginBottom: spacing.sm }}>
              La suppression est définitive et ne peut pas être annulée.
            </Text>
            <Button
              label="Supprimer cette demande"
              variant="secondary"
              disabled={update.isPending}
              loading={remove.isPending}
              onPress={confirmDelete}
            />
          </View>
        )}
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
  </>,
);
}

/**
 * A contract field the lock has closed. The box mirrors `Field`'s input exactly - same paddings,
 * same 1.5pt border, same radius, same mist ground - with muted text in place of ink, so it reads
 * as this form's own field rather than as a sentence where a control used to be. Keep it in step
 * if `Field` changes, the way `offre.tsx`'s delay input is kept in step.
 *
 * The control is REPLACED rather than removed - the move `CF-31` made on the offer form's Garantie
 * - and it keeps an error slot, because a 422 naming a locked field still has to be readable.
 * `editable={false}` on a `Field` was the alternative and it renders identically to a working one.
 *
 * Declared at module scope, not inside the screen: a component defined during render is a new type
 * on every pass, so React would unmount and remount the whole subtree each time.
 */
function LockedValue({
  label,
  value,
  error,
}: {
  label: string;
  value: string;
  error?: string;
}) {
  const { palette, radii, spacing, type } = useTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_600SemiBold',
          fontSize: 12.5,
          color: palette.ink2,
          marginBottom: spacing.xs,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          paddingVertical: 15,
          paddingHorizontal: 14,
          borderWidth: 1.5,
          borderColor: palette.line,
          borderRadius: radii.field,
          backgroundColor: palette.mist,
        }}
      >
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: type.body.size,
            color: palette.muted,
          }}
        >
          {value}
        </Text>
      </View>
      {error !== undefined && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 12.5,
            color: palette.red,
            marginTop: spacing.xs,
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

/**
 * « Électronique · Smartphones » for a subcategory, « Électronique » for a top-level one. Copied
 * from the wizard rather than shared: 36 leaves include two near-duplicates across parents
 * (« Jouets » under Famille, « Jeux & jouets » under Loisirs), so a bare leaf label is ambiguous.
 * Returns '' when the taxonomy has not loaded, which the caller falls back on.
 */
function categoryLabel(categories: CategoryDto[] | undefined, id: string): string {
  const found = categories?.find((c) => c.id === id);
  if (!found) return '';
  if (found.parentId === null) return found.labelFr;
  const parent = categories?.find((c) => c.id === found.parentId);
  return parent ? `${parent.labelFr} · ${found.labelFr}` : found.labelFr;
}

/**
 * The wizard's step-3 mode card. Copied rather than imported - `publier.tsx` does not export it
 * and spec §6.3 rejected touching that file.
 *
 * 🛑 `palette.red*` and NOT `accent.*` for the selected state. The wizard can use the accent
 * because it is client-only by construction; this screen is reached from a demande a réparateur
 * account owns in client mode, and `accents.pro` maps `accent → palette.navy`, which would make
 * the selected card indistinguishable from the unselected one against ink text.
 */
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
  const { palette, radii, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        padding: spacing.lg,
        borderRadius: radii.card,
        borderWidth: 1.5,
        borderColor: active ? palette.red : palette.line,
        backgroundColor: active ? palette.redSoft : palette.paper,
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avoid: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  /** `PhotoPicker`'s tile geometry, so the placeholder row lines up with the grid above it. */
  tileBox: { position: 'relative', width: 76, height: 76 },
  tile: {
    width: 76,
    height: 76,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(20, 20, 20, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
