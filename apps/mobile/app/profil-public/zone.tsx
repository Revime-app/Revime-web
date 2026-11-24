import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { AddressInput } from '../../src/components/AddressInput';
import { Chip } from '../../src/components/Chip';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useSessionContext } from '../../src/lib/session';
import { ApiError, api } from '../../src/lib/api';
import type { MeResponse } from '@revime/shared';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

/**
 * `CF-51`. « Zone d'intervention » - his own heading, from mockup `04`'s checklist.
 *
 * ONE editor for the postal code, and this screen is it. `profil.tsx`'s ZONE D'INTERVENTION row
 * used to hold an inline `Field` and now pushes here, because two editors for one field is the
 * « écrans qui font doublon » the client reported. That row could NOT simply be deleted:
 * `DemandeFeed.tsx` sends a réparateur with no postal code there, and removing it re-creates the
 * six-day production defect `AGENTS.md` records twice.
 *
 * The radius is DISPLAY ONLY - it renders on his fiche and filters nothing. See the spec §9.
 */

/** Chips are a quick-fill row over the free field, the shape `CF-29` used for the délai. */
const RADIUS_PRESETS = [5, 10, 20, 50] as const;
const RADIUS_MIN = 1;
const RADIUS_MAX = 150;

export default function ProfilPublicZone() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const { me, refresh } = useSessionContext();

  const [postalCode, setPostalCode] = useState('');
  const [addressLabel, setAddressLabel] = useState('');
  const [radius, setRadius] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const seeded = useRef(false);

  // One-shot seeding, the rule the description editor's comment states: a continuous-sync
  // effect resets the fields if the user types between a save resolving and the session
  // refetch landing, which destroys their work.
  useEffect(() => {
    if (!seeded.current && me) {
      setPostalCode(me.repairer?.postalCode ?? '');
      setAddressLabel(me.repairer?.postalCode ?? '');
      // `?? null` at entry on a NEW DTO field, then String(): an app newer than the API receives
      // this as `undefined`, and interpolating that would put « undefined » in the input.
      const km = me.repairer?.serviceRadiusKm ?? null;
      setRadius(km === null ? '' : String(km));
      seeded.current = true;
    }
  }, [me]);

  const parsedRadius = radius.trim() === '' ? null : Number(radius.trim());
  const radiusValid =
    parsedRadius === null ||
    (Number.isInteger(parsedRadius) && parsedRadius >= RADIUS_MIN && parsedRadius <= RADIUS_MAX);
  const canSave = postalCode.trim().length === 5 && radiusValid && !saving;

  const save = async (): Promise<void> => {
    if (!canSave) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      // Both fields in ONE call. The route derives lat/lng/serviceAreaLabel from the postal
      // code and rewrites them every time, and sending the radius alongside is what keeps the
      // « absent means leave alone » rule from ever being exercised by this screen.
      await api.patch<MeResponse>('/users/me/repairer', {
        postalCode: postalCode.trim(),
        serviceRadiusKm: parsedRadius,
      });
      // 🛑 MANDATORY. invalidateQueries({ queryKey: ['me'] }) is inert in this app - the session
      // is useState in SessionProvider and only refresh() updates it.
      await refresh();
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.fields?.postalCode ?? e.fields?.serviceRadiusKm ?? e.message)
          : "La zone n'a pas pu être enregistrée.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!me) return null;
  if (me.profile.repairerEnabled !== true) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenHeader title="Zone d'intervention" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg }}>
          <Text style={[styles.hint, { color: palette.muted }]}>
            Activez le mode réparateur pour définir votre zone.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenHeader title="Zone d'intervention" onBack={() => router.back()} />
      <KeyboardAvoider>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card>
          <AddressInput
            label="Localisation (Recherche)"
            value={addressLabel}
            onChangeText={(t) => {
              setAddressLabel(t);
              const pcMatch = t.trim().match(/\b\d{5}\b/);
              if (pcMatch) {
                setPostalCode(pcMatch[0]);
              } else {
                setPostalCode('');
              }
              setError(null);
              setSaved(false);
            }}
            onSelect={(res) => {
              setAddressLabel(res.label);
              setPostalCode(res.postcode);
              setError(null);
              setSaved(false);
            }}
            error={error?.includes('Code postal') ? error : null}
            placeholder="Saisissez une adresse ou une ville"
            editable={!saving}
          />
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13, color: palette.ink, marginBottom: 4 }}>
            Code postal sélectionné : {postalCode || 'Aucun'}
          </Text>
          <Text style={[styles.hint, { color: palette.muted, marginBottom: spacing.md }]}>
            Sert à calculer la distance affichée au client et à classer les demandes les plus
            proches en premier.
          </Text>

          <Text style={[styles.label, { color: palette.muted }]}>RAYON D'INTERVENTION</Text>
          <View style={styles.chipRow}>
            {RADIUS_PRESETS.map((km) => (
              <Chip
                key={km}
                label={`${km} km`}
                active={parsedRadius === km}
                onPress={() => {
                  setRadius(String(km));
                  setError(null);
                  setSaved(false);
                }}
              />
            ))}
          </View>
          <Field
            label="Autre rayon (km)"
            value={radius}
            onChangeText={(t) => {
              // Digits only, so a stray character cannot produce NaN on save.
              setRadius(t.replace(/[^0-9]/g, ''));
              setError(null);
              setSaved(false);
            }}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="Non renseigné"
            editable={!saving}
          />
          <Text style={[styles.hint, { color: palette.muted }]}>
            {parsedRadius === null
              ? "Laissez vide si vous ne souhaitez pas indiquer de rayon."
              : `Le client verra : intervient dans un rayon de ${parsedRadius} km.`}
          </Text>
          {!radiusValid && (
            <Text style={[styles.error, { color: palette.red }]}>
              Indiquez un rayon entre {RADIUS_MIN} et {RADIUS_MAX} km.
            </Text>
          )}

          {error !== null && <Text style={[styles.error, { color: palette.red }]}>{error}</Text>}
          {saved && (
            <Text style={[styles.error, { color: palette.greenDeep }]}>Zone enregistrée.</Text>
          )}

          <View style={{ marginTop: spacing.md }}>
            <Button label="Enregistrer" onPress={() => void save()} loading={saving} disabled={!canSave} />
          </View>
        </Card>
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  label: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 12, letterSpacing: 0.6, marginBottom: 8 },
  hint: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, lineHeight: 17.4, marginTop: 4 },
  error: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, marginTop: 8 },
  // 12 is `spacing.md` inlined: the theme is a hook and is not reachable at module scope, which
  // is why this whole workspace hardcodes spacing at the call site - 359 `fontSize` literals in
  // 52 files, per `packages/tokens`' own header. Do not import the token here.
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
});
