import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import { categoryTree, isCompletePostalCode } from '@revime/shared';
import { KeyboardAvoider } from './KeyboardAvoider';
import type { CategoryDto } from '@revime/shared';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Chip } from './Chip';

export type DirectoryFilters = {
  /** '' means no location. Five digits otherwise - the server refuses anything else with a 400. */
  near: string;
  radiusKm: '10' | '25' | '50' | null;
  minRating: '3' | '4' | null;
  categoryId: string | null;
  sort: 'note' | 'az' | 'distance';
};

export const NO_FILTERS: DirectoryFilters = {
  near: '',
  radiusKm: null,
  minRating: null,
  categoryId: null,
  sort: 'az',
};

/**
 * 🛑 **THE `near` TEST NOW LIVES IN `@revime/shared` AS `isCompletePostalCode`.** ~~`hasCompleteNear`
 * was declared here and copied the schema's regex~~ - corrected 2026-09-02 by the whole-branch
 * review. It duplicated `directoryQuerySchema.near`'s `/^\d{5}$/` in the one workspace with **no
 * test harness**, so nothing could gate the agreement its own comment demanded. Both sides now read
 * `FR_POSTAL_CODE`, and `apps/api/test/postal-code-predicate.spec.ts` asserts the schema and the
 * predicate agree case by case.
 *
 * Why it is a named predicate at all, restated because it is easy to "simplify" away: THREE digits
 * is not « no location » - it is a **400 `VALIDATION_FAILED`**, and `ZodValidationPipe` puts the
 * specific « Code postal invalide. » into `AppException.fields` while the top-level message stays
 * the generic « Les informations envoyées sont invalides. ». No screen prints `fields`. So a
 * `near.length > 0` test LOOKS like a guard and is not one: it empties the directory behind a
 * sentence that names nothing.
 *
 * Every mobile site that asks « is there a usable location » calls it: this sheet's hint and its
 * distance group, `setNear`, `normalisedForApply`, `activeFilterCount`, and the directory's query,
 * chip row and empty-state hint.
 */

/**
 * How many facets the « Filtres » button should report. `sort` is deliberately NOT counted: a
 * list is always in some order, so « A → Z » is not a filter the user applied. 🆕 It is no longer
 * INVISIBLE either - `RepairerDirectory`'s count line names the applied order in words.
 *
 * 🆕 `near` is counted through `isCompletePostalCode`, not by length: an incomplete code is a facet
 * the query is obliged to OMIT, so counting it would make the button and the chip row advertise a
 * filter that is not applied.
 */
export function activeFilterCount(f: DirectoryFilters): number {
  return (
    (isCompletePostalCode(f.near) ? 1 : 0) +
    (f.radiusKm !== null ? 1 : 0) +
    (f.minRating !== null ? 1 : 0) +
    (f.categoryId !== null ? 1 : 0)
  );
}

/**
 * What « Appliquer » actually hands back.
 *
 * 🛑 An INCOMPLETE postal code is dropped HERE rather than downstream, so a `DirectoryFilters` that
 * leaves this sheet always has `near` either `''` or exactly five digits. Without that invariant
 * the parent's chip row would advertise « Autour de 750  × » for a facet its query must omit - a
 * control claiming a filter that was never applied.
 *
 * `radiusKm` and `sort` are re-cleared even though `setNear` already nulls the radius and demotes a
 * `distance` sort on every keystroke that leaves the code incomplete. Restating them costs nothing
 * and means a reader of this function does not have to prove that to trust its result.
 */
function normalisedForApply(draft: DirectoryFilters): DirectoryFilters {
  if (isCompletePostalCode(draft.near)) return draft;
  return {
    ...draft,
    near: '',
    radiusKm: null,
    sort: draft.sort === 'distance' ? 'az' : draft.sort,
  };
}

const RADIUS_OPTIONS = ['10', '25', '50'] as const;
const RATING_OPTIONS = ['3', '4'] as const;

type Props = {
  visible: boolean;
  onDismiss: () => void;
  /** Called only from « Appliquer ». Dismissing discards the draft. */
  onApply: (next: DirectoryFilters) => void;
  initial: DirectoryFilters;
  categories: CategoryDto[];
};

/**
 * `CF-34`. The directory's five facets, in one sheet - design §3.3 and §6.1.
 *
 * 🛑 WHY A SHEET AND NOT MORE CHIP ROWS, and it is arithmetic rather than taste. Measured with
 * PIL at 13pt `600SemiBold` (`Chip.tsx:88`) against a 375pt iPhone SE, **inside the DIRECTORY's
 * own 343pt `ScrollView` and not inside this sheet** - that screen is the one being ruled out:
 * its control stack was ALREADY ~324pt tall before the first result row, of which ~172pt is
 * `CF-33`'s category chips wrapping to FOUR lines. A postal field plus two more chip rows costs
 * ~164pt more, which on a 667pt SE leaves roughly 26pt of results. So inline was not an option.
 *
 * A `Modal` with a tinted scrim rather than a real blur: `expo-blur` is a native module and
 * would break the installed client on the next reload. Same choice as `BlockingOverlay` and
 * CF-10's `IdentityGateSheet` (V8 E1: `OfferGateSheet`), which is this file's structural precedent.
 *
 * IT HOLDS A DRAFT. State lives in `RepairerDirectory`, which owns the query key; this sheet
 * edits a copy and hands it back on « Appliquer ». So an abandoned sheet changes nothing, and
 * no individual chip tap triggers a refetch.
 *
 * ROW WIDTHS, measured against the labels this file renders.
 *
 * 🛑 **THE CONTAINER IS THIS SHEET'S OWN `card`, AND NAMING IT IS THE POINT OF THIS SENTENCE.**
 * ~~311pt of inner width on a 375pt screen (326pt at 390pt)~~ was **the DIRECTORY ROW's width**
 * imported into a component that shares nothing with it: a row sits in a `ScrollView` with 16pt
 * of padding each side *plus* a `Card` with another 16pt each side, i.e. **64pt of chrome**. This
 * sheet is a `transparent` `Modal` with no safe-area inset and no `SafeAreaView`; `scrim` is
 * `flex: 1`, `card` is `width: '100%'` with `padding: 16`, and the inner `ScrollView` adds only
 * `gap`. So this sheet has **32pt of chrome, not 64pt**, and its usable inner width is
 *
 *   **343pt on a 375pt iPhone SE, and 358pt on a 390pt iPhone** (screen − 16 × 2).
 *
 * Every verdict below is re-derived against those two numbers. **Nothing was reflowed to fit** -
 * there is MORE room than the old figure claimed, so read a wider margin as « the old number was
 * wrong », never as « the layout changed ». Measure any new row against the card you can see in
 * `styles` at the bottom of this file, and say which container the figure is for.
 *
 *   « Partout » 10 km 25 km 50 km            313.5pt - ONE line at BOTH widths. ~~"ONE line at
 *                                            390pt, TWO on a 375pt SE"~~ was the 311pt error
 *   « Toutes » « ★3 et plus » « ★4 et plus »  276.5pt - one line at both
 *   « Distance » « Mieux notés » « A → Z »    275.8pt - one line at both
 *   footer « Tout effacer » « Appliquer »     250.2pt - one line at both; see `styles.footer`
 *
 * 🛑 The spelled-out « 3 étoiles et plus » form measures **351.0pt**, which still **WRAPS on a
 * 375pt SE** (against 343pt) and only just clears a 390pt screen (358pt). The device this repo
 * treats as the floor is the SE, so that form costs a second line. That is why the labels use the
 * star glyph; do not "clarify" them back to words without re-measuring.
 *
 * 🛑 **A FIGURE CONTAINING « ★ » OR « → » IS A LOWER BOUND, NOT AN EXACT WIDTH.** Google Sans
 * Flex contains NEITHER glyph - checked 2026-09-02 rather than assumed: U+2605, U+2192 and an
 * arbitrary CJK codepoint all return the SAME `.notdef` box at the same 7.5pt advance. So PIL
 * measures the substitute box and iOS renders a system fallback whose advance is nearer a full em
 * (~13pt at 13pt). Adding ~5.5pt per such glyph gives the honest worst case: the note row
 * ~287.5pt and the sort row ~281.3pt, **both still one line against 343pt**. The verdicts hold;
 * the numbers are floors.
 *
 * 🛑 THE CATEGORY CHIPS MOVED HERE AND ARE STILL NOT EXTRACTED INTO A SHARED COMPONENT.
 * `publier.tsx` holds the first copy of this drill-in pattern and `RepairerDirectory` held the
 * second; the annuaire design says extraction waits for a THIRD consumer. Relocating the second
 * is not a third, and `publier.tsx` is untouched by this slice.
 *
 * Two facts that came WITH those chips from `RepairerDirectory` and have nowhere else to live:
 *
 * - **Root chips alone were rejected.** 8 of 44 nodes cannot express « Smartphones », and the
 *   client's stated objective is that he « puisse vraiment trouver le réparateur adapté ». So the
 *   drill-in is the requirement, not an elaboration of it.
 * - **The widest category chip fits this sheet**, re-measured 2026-09-02 against this card's real
 *   **343pt**. 🛑 An intermediate correction pushed this to « the 311pt card » and that was the
 *   wrong direction - see the container paragraph above; 343pt is right for this sheet, though the
 *   original derivation reached it from the directory's `ScrollView` rather than from `styles.card`.
 *   🛑 Both units are given on every line, because mixing a LABEL width with a CHIP width is this
 *   repo's recurring measurement error - a chip is its label plus 15pt padding each side and a
 *   1.5pt border, i.e. **+33pt**:
 *     « Autres appareils électroniques »  191.0pt label / **224.0pt chip**  (widest active child)
 *     « Tout Mode & accessoires »         155.8pt label / **188.8pt chip**  (widest composable)
 *   224.0pt leaves **119pt** of margin in the card at 375pt (134pt at 390pt). ~~87pt~~ was the
 *   311pt figure. `flexWrap` puts each chip on its own line when it must, so the constraint is a
 *   SINGLE chip exceeding the card, not the row filling up. The « Tout {root} » branch only ever
 *   receives ROOT labels, so do not re-derive it from a child.
 */
export function DirectoryFilterSheet({ visible, onDismiss, onApply, initial, categories }: Props) {
  // `accent` is deliberately NOT destructured: nothing here is brand-accented - `Chip` owns its
  // own active fill. 🛑 NOT because `tsc` would object: `noUnusedLocals` is NOT enabled anywhere in
  // this repo (`tsconfig.base.json` sets only `strict`, which does not imply it), so an unused
  // binding compiles silently. The reason is that a destructured `accent` nobody reads is a
  // standing invitation to tint something that must stay neutral.
  const { palette, spacing, radii } = useTheme();

  const [draft, setDraft] = useState<DirectoryFilters>(initial);
  const [openParentId, setOpenParentId] = useState<string | null>(null);

  /**
   * Re-seed whenever the sheet opens, so reopening it never shows a stale draft from a session
   * the user dismissed. Keyed on `visible` rather than on `initial`, because `initial` is a new
   * object identity on every parent render and would fight the user's typing.
   */
  useEffect(() => {
    if (visible) {
      setDraft(initial);
      setOpenParentId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const tree = useMemo(() => categoryTree(categories), [categories]);
  const openParent = useMemo(
    () => (openParentId === null ? null : (tree.find((r) => r.id === openParentId) ?? null)),
    [tree, openParentId],
  );

  /**
   * 🛑 The distance controls are ABSENT, not disabled, until a postal code is present. The
   * schema refuses `radiusKm` and `sort=distance` without `near` with a 400, and `AGENTS.md`'s
   * test for a control is « will the server the button lands on say yes today ». When the answer
   * is no, French prose beats a dead control - so the hint below explains the absence.
   */
  const hasNear = isCompletePostalCode(draft.near);

  /**
   * Clearing the postal code must clear what depends on it, or « Appliquer » would send a
   * `radiusKm` with no `near` and collect a 400 the user cannot act on.
   */
  const setNear = (next: string) => {
    const digits = next.replace(/\D/g, '').slice(0, 5);
    setDraft((d) => ({
      ...d,
      near: digits,
      radiusKm: isCompletePostalCode(digits) ? d.radiusKm : null,
      sort: d.sort === 'distance' && !isCompletePostalCode(digits) ? 'az' : d.sort,
    }));
  };

  const label = (text: string) => (
    <Text style={[styles.group, { color: palette.muted }]}>{text}</Text>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      // Confines iOS VoiceOver to this subtree, so the directory underneath is not still
      // swipeable while the sheet covers it. CF-10's `IdentityGateSheet` (V8 E1: `OfferGateSheet`) sets this and is the precedent.
      accessibilityViewIsModal
    >
      {/* Tapping the scrim dismisses, discarding the draft. The card swallows taps because its
          own `Pressable` claims the touch responder first - nothing "stops propagation" in RN.
          🛑 `accessible={false}` on BOTH this and the card: `Pressable` is an accessibility
          element by default, and on iOS that collapses the whole subtree into ONE button, which
          made every control inside CF-10's `IdentityGateSheet` (V8 E1: `OfferGateSheet`) unfocusable. That defect is the reason
          these two props exist. */}
      <KeyboardAvoider>
      <Pressable
        style={[styles.scrim, { backgroundColor: `${palette.ink}8C` }]}
        onPress={onDismiss}
        accessible={false}
      >
        <Pressable
          style={[
            styles.card,
            { backgroundColor: palette.paper, borderRadius: radii.card, borderCurve: 'continuous' },
          ]}
          onPress={() => {}}
          accessible={false}
        >
          <Text style={[styles.title, { color: palette.ink }]}>Filtres</Text>

          <ScrollView
            contentContainerStyle={{ gap: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            {/* ---- Autour de ---------------------------------------------------- */}
            <View>
              {label('AUTOUR DE')}
              <View
                style={[
                  styles.input,
                  { backgroundColor: palette.mist, borderColor: palette.line },
                ]}
              >
                <TextInput
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: 14,
                    color: palette.ink,
                  }}
                  placeholder="Code postal"
                  placeholderTextColor={palette.faint}
                  value={draft.near}
                  onChangeText={setNear}
                  keyboardType="number-pad"
                  maxLength={5}
                  returnKeyType="done"
                  accessibilityLabel="Code postal autour duquel chercher"
                />
                {draft.near.length > 0 && (
                  <Pressable onPress={() => setNear('')} accessibilityLabel="Effacer le code postal">
                    <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16, color: palette.muted }}>
                      ×
                    </Text>
                  </Pressable>
                )}
              </View>
              {!hasNear && (
                <Text style={[styles.hint, { color: palette.muted }]}>
                  {/* 🆕 TWO absences share this slot, not one, and conflating them was a live
                      defect. A code that is PRESENT but INCOMPLETE used to show « Indiquez un code
                      postal », which reads as « you have not typed one » to somebody who just
                      typed « 750 » - and « Appliquer » then dropped it, so the control appeared to
                      do nothing, which `AGENTS.md` defines as reading broken. Same slot, same
                      `palette.muted`: only the sentence changes. */}
                  {draft.near.length > 0
                    ? 'Un code postal compte cinq chiffres.'
                    : 'Indiquez un code postal pour filtrer et trier par distance.'}
                </Text>
              )}
            </View>

            {/* ---- Distance maximale ------------------------------------------- */}
            {hasNear && (
              <View>
                {label('DISTANCE MAXIMALE')}
                <View style={styles.row}>
                  <Chip
                    label="Partout"
                    active={draft.radiusKm === null}
                    onPress={() => setDraft((d) => ({ ...d, radiusKm: null }))}
                  />
                  {RADIUS_OPTIONS.map((km) => (
                    <Chip
                      key={km}
                      label={`${km} km`}
                      active={draft.radiusKm === km}
                      onPress={() => setDraft((d) => ({ ...d, radiusKm: km }))}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* ---- Note -------------------------------------------------------- */}
            <View>
              {label('NOTE')}
              <View style={styles.row}>
                <Chip
                  label="Toutes"
                  active={draft.minRating === null}
                  onPress={() => setDraft((d) => ({ ...d, minRating: null }))}
                />
                {RATING_OPTIONS.map((n) => (
                  <Chip
                    key={n}
                    label={`★${n} et plus`}
                    active={draft.minRating === n}
                    onPress={() => setDraft((d) => ({ ...d, minRating: n }))}
                  />
                ))}
              </View>
            </View>

            {/* ---- Catégorie --------------------------------------------------- */}
            <View>
              {label('CATÉGORIE')}
              <View style={styles.row}>
                {openParent === null ? (
                  <>
                    <Chip
                      label="Toutes"
                      active={draft.categoryId === null}
                      onPress={() => {
                        setDraft((d) => ({ ...d, categoryId: null }));
                        setOpenParentId(null);
                      }}
                    />
                    {tree.map((r) => (
                      <Chip
                        key={r.id}
                        label={r.labelFr}
                        active={draft.categoryId === r.id}
                        // A root WITH children opens; `Autres`, which has none, selects directly.
                        // The chevron is the affordance that tells them apart, so it is
                        // conditional on the same test.
                        chevron={r.children.length > 0}
                        onPress={() =>
                          r.children.length > 0
                            ? setOpenParentId(r.id)
                            : setDraft((d) => ({ ...d, categoryId: r.id }))
                        }
                      />
                    ))}
                  </>
                ) : (
                  <>
                    <Chip label="‹ Retour" onPress={() => setOpenParentId(null)} />
                    <Chip
                      label={`Tout ${openParent.labelFr}`}
                      active={draft.categoryId === openParent.id}
                      onPress={() => setDraft((d) => ({ ...d, categoryId: openParent.id }))}
                    />
                    {openParent.children.map((c) => (
                      <Chip
                        key={c.id}
                        label={c.labelFr}
                        active={draft.categoryId === c.id}
                        onPress={() => setDraft((d) => ({ ...d, categoryId: c.id }))}
                      />
                    ))}
                  </>
                )}
              </View>
            </View>

            {/* ---- Trier par --------------------------------------------------- */}
            <View>
              {label('TRIER PAR')}
              <View style={styles.row}>
                {hasNear && (
                  <Chip
                    label="Distance"
                    active={draft.sort === 'distance'}
                    onPress={() => setDraft((d) => ({ ...d, sort: 'distance' }))}
                  />
                )}
                <Chip
                  label="Mieux notés"
                  active={draft.sort === 'note'}
                  onPress={() => setDraft((d) => ({ ...d, sort: 'note' }))}
                />
                <Chip
                  label="A → Z"
                  active={draft.sort === 'az'}
                  onPress={() => setDraft((d) => ({ ...d, sort: 'az' }))}
                />
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { gap: spacing.sm }]}>
            {/* 🛑 « Tout effacer », NOT « Réinitialiser », and the two words are load-bearing.
                The directory's empty state carries a « Réinitialiser les filtres » chip that
                calls `setFilters(NO_FILTERS)` and therefore APPLIES IMMEDIATELY. This button
                only clears the DRAFT - nothing reaches the query until « Appliquer » beside it
                is tapped. Labelled « Réinitialiser » the two read as one action, and a user who
                taps this and dismisses the sheet reasonably believes his filters are gone. A
                different verb, sitting next to the commit button, is what makes the two-step
                shape legible. Do not "harmonise" the two labels. */}
            <Button label="Tout effacer" variant="secondary" onPress={() => setDraft(NO_FILTERS)} />
            {/* `normalisedForApply`, not the raw draft: an incomplete postal code must not leave
                this sheet as though it were a filter. See that function. */}
            <Button label="Appliquer" onPress={() => onApply(normalisedForApply(draft))} />
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  // Bottom sheet rather than centred: five groups are taller than a centred card, and a sheet
  // keeps the « Appliquer » footer within thumb reach.
  card: { width: '100%', maxHeight: '85%', padding: 16, gap: 12 },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 17 },
  group: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  hint: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  /**
   * 🆕 MEASURED 2026-09-02, because this is the one row `CF-34` added that nobody had measured and
   * **React Native's default `flexShrink` is 0** - so two `Button`s that do not fit would overflow
   * the card rather than compressing to it, and `Button`'s own `Text` carries no `numberOfLines`.
   *
   * `Button` renders its label at `type.body.size` = **15pt `600SemiBold`** with
   * `paddingHorizontal: 20` each side; the `secondary` variant adds `borderWidth: 1` each side.
   * Against this sheet's **343pt** card (see the component header for why it is 343 and not 311):
   *
   *   « Tout effacer »  secondary  89.0pt label + 40 padding + 2 border = **131.0pt**
   *   « Appliquer »     primary    71.2pt label + 40 padding           = **111.2pt**
   *   + the 8pt `spacing.sm` gap                                       = **250.2pt**
   *
   * **93pt of margin at 375pt and 108pt at 390pt** - the widest of the sheet's five rows by
   * margin, so this is the row least at risk. Re-measure if either label changes: the empty
   * state's « Réinitialiser les filtres » in this slot would be **313.5pt** of footer (152.2 + 42
   * + 111.2 + 8), which still fits at 29.5pt of margin - so the reason it is not reused here is
   * semantic and not arithmetical. See the buttons themselves.
   */
  footer: { flexDirection: 'row', justifyContent: 'flex-end' },
});
