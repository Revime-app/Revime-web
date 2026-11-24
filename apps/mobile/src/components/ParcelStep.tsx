import { useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import {
  INSURABLE_VALUE_MAX_CENTS,
  PARCEL_PRESETS,
  euros,
  parcelDetailsSchema,
  presetForCategory,
  type ParcelOption,
  type ParcelPresetKey,
  type ShippingLegPrices,
  type ShippingQuoteDto,
  type ShippingQuoteOptionDto,
} from '@revime/shared';
import { optionLegLines } from '../lib/shipping-legs-view';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Chip } from './Chip';
import { Field } from './Field';
import { useShippingQuote } from '../lib/queries';
import { ApiError } from '../lib/api';
import { RevimeLoader } from './lottie/RevimeLoader';

/** What the payment screen needs from a settled quote: the id, the choice, and the two amounts to total. */
export type ParcelQuoteState = {
  quoteId: string;
  parcelOption: ParcelOption;
  insured: boolean;
  quoted: { shippingCents: number; insuranceCents: number };
  /**
   * V7 A9: the chosen pair's price per leg, for the payment summary. Kept OUT of `quoted`, which
   * `computeAmounts` checks entry by entry as integers. Absent from an API older than U8.
   */
  legPrices?: ShippingLegPrices;
};

type Props = {
  offerId: string;
  demandeCategory: { slug: string; parentSlug: string | null } | null;
  onQuote: (state: ParcelQuoteState | null) => void;
};

const PRESET_ORDER: ParcelPresetKey[] = ['PHONE', 'TABLET', 'LAPTOP', 'APPLIANCE', 'OTHER'];
const OPTION_ORDER = ['RELAY', 'HOME'] as const;
const OPTION_LABEL: Record<ParcelOption, string> = { RELAY: 'Point relais', HOME: 'À domicile' };
const UNAVAILABLE = 'Envoi par colis indisponible pour le moment.';

const kg = (grams: number | null) => (grams === null ? '' : String(grams / 1000).replace('.', ','));
/** Whole euros with the French thousands separator: `euros(100_000)` renders « 1000 € », the spec says « 1 000 € ». */
const wholeEuros = (cents: number) => `${String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')} €`;
const cm = (v: number | null) => (v === null ? '' : String(v));

/**
 * The pair the client is actually buying (spec « Amendment, 2026-09-04 »): insurance is per offer
 * AND declared value, so the insured variant may be a DEARER carrier than the uninsured cheapest
 * pair. With the toggle on, price and carriers follow the insured pair; off, the uninsured one.
 */
function pairFor(opt: ShippingQuoteOptionDto, insured: boolean) {
  return insured && opt.insured ? opt.insured : opt;
}

function carriers(pair: { carrierLabels: { OUTBOUND: string; RETURN: string } }): string {
  const { OUTBOUND, RETURN } = pair.carrierLabels;
  return OUTBOUND === RETURN ? OUTBOUND : `${OUTBOUND} / ${RETURN}`;
}

/**
 * Livraison Boxtal, spec §9.1. Renders under the « Envoi par colis » card once it is selected and
 * quoting is enabled. Every edit to a parcel field invalidates the shown quote: the button returns
 * to « Calculer le prix » and `onQuote(null)` tells the screen the total is no longer known, which
 * disables « Payer » until a fresh quote lands.
 */
export function ParcelStep({ offerId, demandeCategory, onQuote }: Props) {
  const { palette, accent, spacing, radii } = useTheme();
  const initial = demandeCategory ? presetForCategory(demandeCategory.slug, demandeCategory.parentSlug) : 'OTHER';
  const p = PARCEL_PRESETS[initial];
  const [preset, setPreset] = useState<ParcelPresetKey>(initial);
  const [weightKg, setWeightKg] = useState(kg(p.weightGrams));
  const [length, setLength] = useState(cm(p.lengthCm));
  const [width, setWidth] = useState(cm(p.widthCm));
  const [height, setHeight] = useState(cm(p.heightCm));
  const [valueEur, setValueEur] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<ShippingQuoteDto | null>(null);
  const [option, setOption] = useState<ParcelOption | null>(null);
  const [insured, setInsured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useShippingQuote(offerId);

  function invalidate() {
    if (quote) {
      setQuote(null);
      setOption(null);
      onQuote(null);
    }
  }
  function applyPreset(key: ParcelPresetKey) {
    const q = PARCEL_PRESETS[key];
    setPreset(key);
    setWeightKg(kg(q.weightGrams));
    setLength(cm(q.lengthCm));
    setWidth(cm(q.widthCm));
    setHeight(cm(q.heightCm));
    invalidate();
  }
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    invalidate();
  };

  const parsed = useMemo(
    () =>
      parcelDetailsSchema.safeParse({
        weightGrams: Math.round(Number(weightKg.replace(',', '.')) * 1000),
        lengthCm: Number(length),
        widthCm: Number(width),
        heightCm: Number(height),
        valueCents: Math.round(Number(valueEur.replace(',', '.')) * 100),
      }),
    [weightKg, length, width, height, valueEur],
  );

  function publish(dto: ShippingQuoteDto, o: ParcelOption, ins: boolean) {
    const opt = dto.options[o];
    if (!opt) return;
    const insuredOn = ins && opt.insured !== null;
    const pair = pairFor(opt, insuredOn);
    onQuote({
      quoteId: dto.id,
      parcelOption: o,
      insured: insuredOn,
      quoted: {
        shippingCents: pair.shippingCents,
        insuranceCents: insuredOn && opt.insured ? opt.insured.insuranceCents : 0,
      },
      legPrices: pair.legPrices,
    });
  }

  async function calculate() {
    setError(null);
    setFields({});
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const issue of parsed.error.issues) f[String(issue.path[0])] = issue.message;
      setFields(f);
      return;
    }
    try {
      const dto = await request.mutateAsync({ parcel: parsed.data });
      const first = OPTION_ORDER.find((o) => dto.options[o]) ?? null;
      setQuote(dto);
      setOption(first);
      if (first) publish(dto, first, insured);
      else setError(UNAVAILABLE);
    } catch (e) {
      // A 503 (Boxtal down) reads as the spec's sentence; a 422 (« ne peut pas être expédié ») is
      // the server's own message. Either way the two local modes above stay selectable.
      setError(e instanceof ApiError && e.code !== 'SERVICE_UNAVAILABLE' ? e.message : UNAVAILABLE);
    }
  }

  const chosen = quote && option ? (quote.options[option] ?? null) : null;
  const sectionLabel = { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13, color: palette.muted } as const;
  const body = { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, color: palette.muted } as const;

  return (
    <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
      <Text style={sectionLabel}>Votre objet</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {PRESET_ORDER.map((k) => (
          <Chip key={k} label={PARCEL_PRESETS[k].label} active={preset === k} onPress={() => applyPreset(k)} />
        ))}
      </View>
      <Field
        label="Poids (kg)"
        value={weightKg}
        onChangeText={edit(setWeightKg)}
        keyboardType="decimal-pad"
        error={fields.weightGrams}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Longueur (cm)" value={length} onChangeText={edit(setLength)} keyboardType="number-pad" error={fields.lengthCm} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Largeur (cm)" value={width} onChangeText={edit(setWidth)} keyboardType="number-pad" error={fields.widthCm} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Hauteur (cm)" value={height} onChangeText={edit(setHeight)} keyboardType="number-pad" error={fields.heightCm} />
        </View>
      </View>
      <Field
        label="Valeur de l’objet (€)"
        value={valueEur}
        onChangeText={edit(setValueEur)}
        keyboardType="decimal-pad"
        error={fields.valueCents}
      />

      {!quote && (
        <Button label="Calculer le prix" onPress={() => void calculate()} loading={request.isPending} variant="secondary" />
      )}
      {request.isPending && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <RevimeLoader variant="fill" size={28} centered={false} />
          <Text style={body}>Quelques secondes…</Text>
        </View>
      )}
      {error && (
        <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, color: palette.red }}>{error}</Text>
      )}

      {quote && (
        <>
          <Text style={[sectionLabel, { marginTop: spacing.sm }]}>Mode de livraison</Text>
          {OPTION_ORDER.map((o) => {
            const opt = quote.options[o];
            if (!opt) return null;
            const active = option === o;
            const pair = pairFor(opt, insured);
            // V7 A9: one line per leg (« Aller · Chronopost · 3,85 € »), else the old « aller-retour » line.
            const legLines = optionLegLines(pair);
            return (
              <Pressable
                key={o}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setOption(o);
                  publish(quote, o, insured);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: radii.field,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? accent.accent : palette.line,
                  backgroundColor: palette.paper,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.ink }}>
                    {OPTION_LABEL[o]}
                  </Text>
                  {legLines ? (
                    legLines.map((line) => (
                      <Text key={line} style={body}>
                        {line}
                      </Text>
                    ))
                  ) : (
                    <Text style={body}>aller-retour · {carriers(pair)}</Text>
                  )}
                </View>
                <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 13, color: palette.ink }}>
                  {euros(pair.shippingCents)}
                </Text>
              </Pressable>
            );
          })}
          {chosen && chosen.insured ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.ink }}>
                  Assurer mon objet pendant le transport (aller et retour) · +{euros(chosen.insured.insuranceCents)}
                </Text>
                <Text style={body}>
                  Couvre la perte ou la casse jusqu’à la valeur déclarée. Distinct de la Protection Revime.
                  {chosen.insured.shippingCents !== chosen.shippingCents
                    ? ` Avec un transporteur assurable, la livraison passe à ${euros(chosen.insured.shippingCents)}.`
                    : ''}
                </Text>
              </View>
              <Switch
                value={insured}
                onValueChange={(v) => {
                  setInsured(v);
                  if (option) publish(quote, option, v);
                }}
              />
            </View>
          ) : (
            <Text style={body}>Assurance disponible jusqu’à {wholeEuros(INSURABLE_VALUE_MAX_CENTS)} de valeur déclarée.</Text>
          )}
        </>
      )}
    </View>
  );
}
