import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  DELAY_HOURS_MAX,
  DELAY_OPTIONS,
  DELAY_UNITS,
  PARTS_OPTIONS,
  WARRANTY_NONE,
  WARRANTY_OPTIONS,
  delayHoursFrom,
  delayInputFor,
  delayLabel,
  euros,
  mayOfferWarranty,
  normaliseDelayInput,
  normalisePriceInput,
  type CreateOfferInput,
  type DelayUnit,
  type MeResponse,
} from '@revime/shared';
import { useTheme } from '../../../src/theme';
import { isPrivateDemandeItem } from '../../../src/components/demande/demande-filter';
import { Field } from '../../../src/components/Field';
import { Button } from '../../../src/components/Button';
import { Chip } from '../../../src/components/Chip';
import { useCreateOffer, useDemande, useMyParticularQuota } from '../../../src/lib/queries';
import { api, ApiError } from '../../../src/lib/api';
import { useSessionContext } from '../../../src/lib/session';
import { KeyboardAvoider } from '../../../src/components/KeyboardAvoider';
import { OfferCapNotice } from '../../../src/components/OfferCapNotice';
import { offerCapNotice } from '../../../src/lib/particular-quota-view';

export default function FaireOffre() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const demandeId = id ?? '';
  const { palette, radii, spacing, type } = useTheme();
  const router = useRouter();
  const demande = useDemande(demandeId);
  const createOffer = useCreateOffer(demandeId);
  const { me, refresh } = useSessionContext();
  // Piece D's fallback. A réparateur who has never opened Profil is still
  // asked here, so the client never sees an offer with no distance.
  const needsPostalCode = me?.repairer?.postalCode == null;
  /**
   * CF-31 - « La garantie doit être réservée aux professionnels. »
   *
   * The SAME predicate the server refuses on, imported rather than restated, so this
   * screen cannot offer a choice `POST /offers` would answer 403 to. Keyed on the
   * verified level and NOT on `me.repairer.kind`: `kind` is self-declared, which is
   * exactly what a client reading « Garantie 12 mois » must not be able to be fooled
   * by, and it is `INDIVIDUAL` on every account anyway.
   *
   * `me` is undefined on the first render, and `mayOfferWarranty` answers false for
   * that - so the block starts locked and opens once the session lands, never the
   * other way round.
   */
  const canWarrant = mayOfferWarranty(me?.profile.verificationLevel);

  /**
   * V7 A10 (U7, `DEC7-22` Q5, Q7). CGU art. 53's cap on a private individual: a warning from 80 %,
   * and at the cap the send button gives way to « Mon entreprise ». `capRefusal` holds the server's
   * own `PARTICULAR_CAP_REACHED` answer to a submit, which wins over a counter fetched before the
   * payment that reached the cap.
   */
  const myQuota = useMyParticularQuota(me != null);
  const [capRefusal, setCapRefusal] = useState<string | null>(null);
  const capNotice = offerCapNotice(myQuota.data, capRefusal);

  /**
   * CF4-25 (H3). A private request's budget is « éventuel » - indicative - so the réparateur
   * quotes his own price there; only a PUBLIC budget demande locks the amount. Privacy goes
   * through `isPrivateDemandeItem`, which tolerates a stale API that omits the newer `isPrivate`.
   * The server applies the same rule (`offers.service.ts`, fixed-budget check).
   */
  const isPrivate = demande.data ? isPrivateDemandeItem(demande.data) : false;
  const isBudgetMode = demande.data?.mode === 'BUDGET' && !isPrivate;
  const indicativeBudgetCents =
    isPrivate && demande.data?.mode === 'BUDGET' ? demande.data.budgetCents ?? null : null;
  const fixedBudgetCents = isBudgetMode ? demande.data?.budgetCents ?? null : null;
  const fixedBudgetEuros = fixedBudgetCents != null ? (fixedBudgetCents / 100).toString() : null;

  const [price, setPrice] = useState('');

  useEffect(() => {
    if (isBudgetMode && fixedBudgetEuros !== null) {
      setPrice(fixedBudgetEuros);
    }
  }, [isBudgetMode, fixedBudgetEuros]);
  /**
   * CF-29 - « le délai de réparation, avec la possibilité de choisir/modifier
   * lui-même le délai ».
   *
   * The stored value is still an integer number of hours (see `offer.schemas.ts`), but
   * the réparateur no longer picks from a closed list. He types a number and picks a
   * unit, and `DELAY_OPTIONS` survives as a quick-fill row.
   *
   * Seeded from `delayInputFor(DELAY_OPTIONS[0].hours)` rather than from a literal, so
   * the form opens on exactly the delay it used to default to - 24 h. Unlike CF-31's
   * warranty default, this one is still valid under the new rule, so nothing about an
   * untouched form changed.
   */
  const [delayValue, setDelayValue] = useState<string>(
    () => delayInputFor(DELAY_OPTIONS[0].hours).value,
  );
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(
    () => delayInputFor(DELAY_OPTIONS[0].hours).unit,
  );
  // « Aucune » rather than the old « 3 mois », and the change is required rather than
  // tidier: a seeded warranty is one a réparateur never chose, and for anyone below
  // BUSINESS the server now refuses it - so the previous default would have made the
  // submit button fail on a form he had not touched.
  const [warrantyLabel, setWarrantyLabel] =
    useState<CreateOfferInput['warrantyLabel']>(WARRANTY_NONE);
  const [partsLabel, setPartsLabel] = useState<CreateOfferInput['partsLabel']>(PARTS_OPTIONS[0]);
  const [travel, setTravel] = useState<CreateOfferInput['travel']>('WORKSHOP');
  const [acceptsParcel, setAcceptsParcel] = useState(false);
  const [comment, setComment] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const MIN_PRICE_EUROS = 0.01;
  const MAX_PRICE_EUROS = 100_000; // 10_000_000 cents, the server's cap

  const priceValue = Number(isBudgetMode && fixedBudgetEuros !== null ? fixedBudgetEuros : price);
  /**
   * The single question the screen asks about the typed delay: `null` means "not a
   * delay", for any reason - empty, zero, or past the 90-day cap. The same call feeds
   * `canSubmit`, the chips' active state, the border colour and the echo, so those four
   * cannot disagree.
   */
  const delayHours = delayHoursFrom(delayValue, delayUnit);
  // Only a value he actually typed is worth reddening. An empty field mid-edit is not
  // an error yet, and a control that flashes red between two keystrokes reads as broken.
  const delayInvalid = delayValue !== '' && delayHours === null;
  const canSubmit =
    priceValue >= MIN_PRICE_EUROS &&
    priceValue <= MAX_PRICE_EUROS &&
    // 🆕 CF-29. This term is NEW rather than newly-correct: until this slice the delay
    // came from a chip, so it could not be invalid and `canSubmit` had no reason to ask.
    delayHours !== null &&
    (!needsPostalCode || postalCode.trim().length === 5);

  const submit = async () => {
    setFields({});
    setFormError(null);

    // Unreachable through the button, which `canSubmit` disables - but it is what
    // narrows `number | null` to `number` for the payload below, and saying so in
    // French beats a non-null assertion that would ship an empty delay if the
    // button's condition ever loosened.
    if (delayHours === null) {
      setFields({ delayHours: 'Délai invalide.' });
      return;
    }

    const priceCents = isBudgetMode && fixedBudgetCents !== null
      ? fixedBudgetCents
      : Math.round(priceValue * 100);

    const input: CreateOfferInput = {
      priceCents,
      delayHours,
      // Derived at submit rather than trusted from state. The chips are unreachable
      // below BUSINESS, so state should already hold « Aucune » - but this makes the
      // request match what the server will accept by construction, instead of by the
      // render path having stayed correct.
      warrantyLabel: canWarrant ? warrantyLabel : WARRANTY_NONE,
      partsLabel,
      travel,
      acceptsParcel,
      comment: comment.trim() || undefined,
    };

    try {
      if (needsPostalCode) {
        await api.patch<MeResponse>('/users/me/repairer', { postalCode: postalCode.trim() });
      }
      await createOffer.mutateAsync(input);
      if (needsPostalCode) {
        await refresh();
      }
      router.replace('/(tabs)');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'PARTICULAR_CAP_REACHED') {
          setCapRefusal(error.message);
          void myQuota.refetch();
          return;
        }
        setFields(error.fields ?? {});
        // Any error without field detail - 409 already offered, 422 own demande,
        // 404 gone - must still be readable, or the button looks dead.
        if (!error.fields) setFormError(error.message);
        return;
      }
      setFormError('Une erreur est survenue. Merci de réessayer.');
    }
  };

  /**
   * Same gate as the publish wizard, and keyed the same way: on the server's own
   * `verificationRequired`, never on the level alone. See publier.tsx.
   */
  if (me?.verificationRequired === true && me.profile.verificationLevel === 'NONE') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: spacing.md }}>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.muted }}>
              Retour
            </Text>
          </Pressable>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_700Bold',
              fontSize: type.screenTitle.size,
              color: palette.ink,
              marginBottom: spacing.md,
            }}
          >
            Proposer une offre
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 13.5,
              color: palette.muted,
              lineHeight: 19,
            }}
          >
            Pour envoyer une offre, confirmez votre adresse e-mail ou votre numéro de mobile. Cela
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
      {/* Price, warranty and the comment box are all below the fold on this form,
          and « Envoyer mon offre » is the last element, so without this the
          keyboard covers both the field and the submit. */}
      <KeyboardAvoider style={styles.avoid}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: spacing.md }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.muted }}>
            Retour
          </Text>
        </Pressable>

        <Text
          style={{
            fontFamily: 'GoogleSansFlex_700Bold',
            fontSize: type.screenTitle.size,
            color: palette.ink,
          }}
        >
          Proposer une offre
        </Text>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13.5,
            color: palette.muted,
            marginBottom: spacing.lg,
          }}
          numberOfLines={2}
        >
          {demande.data?.title ?? ''}
        </Text>

        <Field
          label={isBudgetMode ? "Montant fixé par le client (€)" : "Prix proposé (€)"}
          value={isBudgetMode && fixedBudgetEuros !== null ? fixedBudgetEuros : price}
          onChangeText={(t) => {
            if (!isBudgetMode) {
              setPrice(normalisePriceInput(t));
            }
          }}
          editable={!isBudgetMode}
          helperText={
            isBudgetMode
              ? "Budget fixé par le client : montant non modifiable."
              : indicativeBudgetCents !== null
                ? `Budget indicatif du client : ${euros(indicativeBudgetCents)}`
                : undefined
          }
          error={fields.priceCents}
          keyboardType="decimal-pad"
          placeholder="ex. 89"
        />

        {/*
          * CF-29. The five chips STAY and become a quick-fill row rather than the only
          * way in - the same « reshape the control, keep the field » move CF-31 made on
          * Garantie, for the opposite reason: that slice narrowed a choice, this one
          * widens it, and in both cases deleting the old control would have read as a
          * form that lost something.
          *
          * The client's two verbs map onto the two affordances: « choisir » is the chip
          * row, « modifier » is the field under it. A chip lights up whenever the typed
          * value equals it, so typing « 7 jours » by hand highlights « 1 semaine » -
          * honest, because the value IS that preset.
          */}
        <Text style={label(palette, spacing)}>Délai estimé</Text>
        <View style={styles.chips}>
          {DELAY_OPTIONS.map((o) => (
            <Chip
              key={o.hours}
              label={o.label}
              active={delayHours === o.hours}
              onPress={() => {
                const filled = delayInputFor(o.hours);
                setDelayValue(filled.value);
                setDelayUnit(filled.unit);
              }}
            />
          ))}
        </View>
        <View style={styles.delayRow}>
          {/*
            * Not a `Field`, deliberately. `Field` owns its own label and takes the full
            * width, and this input has to sit ON THE ROW with the unit chips, because
            * « 5 » and « jours » are one value read left to right - split across two
            * rows they read as two unrelated controls. The styling below mirrors
            * `Field`'s input exactly; keep them in step if that component changes.
            */}
          <TextInput
            value={delayValue}
            onChangeText={(t) => setDelayValue(normaliseDelayInput(t))}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="ex. 5"
            placeholderTextColor={palette.faint}
            accessibilityLabel="Délai estimé"
            style={{
              width: 76,
              paddingVertical: 15,
              paddingHorizontal: 14,
              borderWidth: 1.5,
              borderColor: delayInvalid ? palette.red : palette.line,
              borderRadius: radii.field,
              backgroundColor: palette.mist,
              fontFamily: 'GoogleSansFlex_500Medium',
              fontSize: type.body.size,
              color: palette.ink,
              textAlign: 'center',
            }}
          />
          {DELAY_UNITS.map((u) => (
            <Chip key={u} label={u} active={delayUnit === u} onPress={() => setDelayUnit(u)} />
          ))}
        </View>
        {/*
          * The echo renders the delay through the SAME `delayLabel` the client's offer
          * card uses, so the réparateur cannot ship a string he has not seen. That is
          * CF-30's defect closed by construction rather than by remembering: a value he
          * chose used to reach five client-facing surfaces with nobody having looked at
          * how it reads.
          */}
        {fields.delayHours ? (
          <Text style={{ ...err(palette), marginTop: spacing.xs }}>{fields.delayHours}</Text>
        ) : (
          <Text style={{ ...hint(palette), marginTop: spacing.xs }}>
            {delayHours === null
              ? `Indiquez un délai, jusqu'à ${DELAY_HOURS_MAX / 24} jours.`
              : `Le client verra : ${delayLabel(delayHours)}`}
          </Text>
        )}

        <View style={{ height: spacing.lg }} />
        <Text style={label(palette, spacing)}>Garantie</Text>
        {canWarrant ? (
          <View style={styles.chips}>
            {WARRANTY_OPTIONS.map((w) => (
              <Chip
                key={w}
                label={w}
                active={warrantyLabel === w}
                onPress={() => setWarrantyLabel(w)}
              />
            ))}
          </View>
        ) : (
          /*
           * CF-31. The label STAYS and only the control is replaced, deliberately -
           * removing the block outright would read as a field the app lost, and the
           * client asked for a restriction, not for a smaller form.
           *
           * No « Vérifiez votre entreprise » link, and that absence is the considered
           * part. `business.service.ts` refuses the SIRET check below IDENTITY, and
           * IDENTITY is blocked on CF-08, so a button here would send a réparateur to a
           * screen that refuses him - the dead end AGENTS.md records under « A GATE YOU
           * TIGHTEN IS NOT LOCAL TO THE SCREEN YOU TIGHTEN IT ON ». This states the rule
           * and asks him for nothing, which is honest at every level.
           */
          <Text style={hint(palette)}>
            Réservée aux professionnels avec une entreprise vérifiée.
          </Text>
        )}

        <View style={{ height: spacing.lg }} />
        <Text style={label(palette, spacing)}>Type de pièces</Text>
        <View style={styles.chips}>
          {PARTS_OPTIONS.map((p) => (
            <Chip key={p} label={p} active={partsLabel === p} onPress={() => setPartsLabel(p)} />
          ))}
        </View>

        <View style={{ height: spacing.lg }} />
        <Text style={label(palette, spacing)}>Mode de réparation</Text>
        <View style={styles.chips}>
          <Chip
            label="En atelier"
            active={travel === 'WORKSHOP'}
            onPress={() => setTravel('WORKSHOP')}
          />
          <Chip label="À domicile" active={travel === 'HOME'} onPress={() => setTravel('HOME')} />
        </View>

        <View style={{ height: spacing.lg }} />
        <Text style={label(palette, spacing)}>Envoi par colis</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          <Chip
            label="J'accepte l'envoi par colis"
            active={acceptsParcel}
            onPress={() => setAcceptsParcel((v) => !v)}
          />
        </View>
        {/* Livraison Boxtal: the weight limit is the carrier's, quoted per object at payment, so the
            chip no longer promises the old two-kilo cap. */}
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 12,
            color: palette.muted,
            marginTop: -spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          Le client renseigne le poids et les dimensions au paiement.
        </Text>
        {needsPostalCode && (
          <>
            <Field
              label="Votre code postal"
              value={postalCode}
              onChangeText={setPostalCode}
              error={fields.postalCode}
              keyboardType="number-pad"
              maxLength={5}
              placeholder="ex. 69003"
            />
            <Text style={{ ...hint(palette), marginTop: -spacing.md, marginBottom: spacing.lg }}>
              Sert à calculer la distance affichée au client. Enregistré sur votre profil.
            </Text>
          </>
        )}

        <Field
          label="Commentaire"
          value={comment}
          onChangeText={setComment}
          error={fields.comment}
          multiline
          minHeight={100}
          placeholder="Précisez les pièces, la méthode, ce qui est inclus."
        />

        {formError && <Text style={{ ...err(palette), marginTop: spacing.sm }}>{formError}</Text>}

        <View style={{ marginTop: spacing.xl }}>
          <OfferCapNotice notice={capNotice} onOpenBusiness={() => router.push('/entreprise')} />
          {capNotice.kind !== 'blocked' && (
            <Button
              label={isBudgetMode ? "Envoyer une demande" : isPrivate ? "Envoyer mon devis" : "Envoyer mon offre"}
              disabled={!canSubmit}
              loading={createOffer.isPending}
              onPress={submit}
            />
          )}
        </View>
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const label = (palette: { ink2: string }, spacing: { xs: number }) => ({
  fontFamily: 'GoogleSansFlex_600SemiBold' as const,
  fontSize: 12.5,
  color: palette.ink2,
  marginBottom: spacing.xs,
});

const hint = (palette: { muted: string }) => ({
  fontFamily: 'GoogleSansFlex_400Regular' as const,
  fontSize: 12,
  color: palette.muted,
});

const err = (palette: { red: string }) => ({
  fontFamily: 'GoogleSansFlex_500Medium' as const,
  fontSize: 12.5,
  color: palette.red,
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  avoid: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // CF-29. `alignItems: 'center'` is load-bearing: the input is taller than a Chip
  // (15pt vertical padding against 9), so without it the two units hang off the top.
  delayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
});
