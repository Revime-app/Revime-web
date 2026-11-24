import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  DAYS_IN_WEEK,
  DAY_LABELS_FR,
  MINUTES_MAX,
  formatMinutes,
  type AvailabilityDay,
  type DayOfWeek,
} from '@revime/shared';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useSessionContext } from '../../src/lib/session';
import { useSetAvailability } from '../../src/lib/queries';
import { ApiError } from '../../src/lib/api';

/**
 * `CF-52`. « Disponibilités » - seven rows, one per day.
 *
 * SEVEN OR NONE is the server's rule, so this form always submits all seven. A day is either
 * closed or carries both times; the Zod schema and migration 29's CHECK both enforce that, and
 * the toggle below is what makes the two states mutually exclusive in the UI.
 *
 * DISPLAY ONLY on the fiche - nothing filters on these hours. See the spec §9.
 */

/** Quick-fill presets in minutes from midnight. The free entry is the two chips' fallback. */
const OPEN_PRESETS = [
  { label: '08h – 18h', opensAt: 480, closesAt: 1080 },
  { label: '09h – 18h', opensAt: 540, closesAt: 1080 },
  { label: '09h – 19h', opensAt: 540, closesAt: 1140 },
] as const;

const DEFAULT_OPEN = { opensAt: 540, closesAt: 1080 };
const DAYS: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

/** Seven closed days: what an unanswered week seeds to, so the form starts from a legal shape. */
const emptyWeek = (): AvailabilityDay[] =>
  DAYS.map((d) => ({ dayOfWeek: d, closed: true, opensAt: null, closesAt: null }));

export default function ProfilPublicDisponibilites() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const { me, refresh } = useSessionContext();
  const save = useSetAvailability();

  const [days, setDays] = useState<AvailabilityDay[]>(emptyWeek());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (!seeded.current && me) {
      // `?? []` is MANDATORY on this new field: an app newer than the API receives it as
      // `undefined`, and `.length` on that throws during render, which unwinds the whole tree.
      const existing = me.repairer?.availability ?? [];
      setDays(existing.length === DAYS_IN_WEEK ? [...existing] : emptyWeek());
      seeded.current = true;
    }
  }, [me]);

  const setDay = (dayOfWeek: number, patch: Partial<AvailabilityDay>): void => {
    setError(null);
    setSaved(false);
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)));
  };

  const toggleClosed = (d: AvailabilityDay): void =>
    setDay(
      d.dayOfWeek,
      d.closed
        ? { closed: false, ...DEFAULT_OPEN }
        : { closed: true, opensAt: null, closesAt: null },
    );

  /** Mirrors the Zod refinement, so the button cannot submit a body the server will refuse. */
  const valid = days.every((d) =>
    d.closed
      ? d.opensAt === null && d.closesAt === null
      : d.opensAt !== null && d.closesAt !== null && d.opensAt < d.closesAt,
  );

  const submit = (): void => {
    if (!valid) return;
    setError(null);
    setSaved(false);
    save.mutate(
      { days },
      {
        onSuccess: async () => {
          // 🛑 MANDATORY, and the hook cannot do it: invalidating `queryKeys.me` is inert.
          await refresh();
          setSaved(true);
        },
        onError: (e) =>
          setError(
            e instanceof ApiError
              ? (e.fields?.days ?? e.message)
              : "Vos horaires n'ont pas pu être enregistrés.",
          ),
      },
    );
  };

  const clearAll = (): void => {
    setError(null);
    setSaved(false);
    save.mutate(
      { days: [] },
      {
        onSuccess: async () => {
          await refresh();
          setDays(emptyWeek());
          seeded.current = true;
          setSaved(true);
        },
        onError: (e) =>
          setError(e instanceof ApiError ? e.message : "Vos horaires n'ont pas pu être effacés."),
      },
    );
  };

  if (!me) return null;
  if (me.profile.repairerEnabled !== true) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenHeader title="Disponibilités" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg }}>
          <Text style={[styles.hint, { color: palette.muted }]}>
            Activez le mode réparateur pour indiquer vos horaires.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenHeader title="Disponibilités" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={[styles.hint, { color: palette.muted, marginBottom: spacing.md }]}>
          Ces horaires apparaissent sur votre fiche publique. Ils n'empêchent pas un client de
          vous écrire en dehors.
        </Text>

        {days.map((d) => (
          <Card key={d.dayOfWeek} style={{ marginBottom: spacing.sm }}>
            <View style={styles.dayHead}>
              {/* Safe: migration 29 enforces CHECK ("dayOfWeek" BETWEEN 1 AND 7) */}
              <Text style={[styles.dayLabel, { color: palette.ink }]}>
                {DAY_LABELS_FR[d.dayOfWeek as DayOfWeek]}
              </Text>
              <View style={styles.dayHead}>
                <Text style={[styles.hint, { color: palette.muted, marginRight: 8 }]}>
                  {d.closed ? 'Fermé' : 'Ouvert'}
                </Text>
                <Switch value={!d.closed} onValueChange={() => toggleClosed(d)} />
              </View>
            </View>

            {!d.closed && (
              <>
                <View style={styles.chipRow}>
                  {OPEN_PRESETS.map((p) => (
                    <Chip
                      key={p.label}
                      label={p.label}
                      active={d.opensAt === p.opensAt && d.closesAt === p.closesAt}
                      onPress={() => setDay(d.dayOfWeek, { opensAt: p.opensAt, closesAt: p.closesAt })}
                    />
                  ))}
                </View>
                <Text style={[styles.hint, { color: palette.muted }]}>
                  {d.opensAt !== null && d.closesAt !== null
                    ? `Le client verra : ${formatMinutes(d.opensAt)} – ${formatMinutes(d.closesAt)}`
                    : 'Choisissez un horaire.'}
                </Text>
                <View style={styles.chipRow}>
                  <Chip
                    label="− 30 min à l'ouverture"
                    active={false}
                    onPress={() =>
                      setDay(d.dayOfWeek, { opensAt: Math.max(0, (d.opensAt ?? DEFAULT_OPEN.opensAt) - 30) })
                    }
                  />
                  <Chip
                    label="+ 30 min à la fermeture"
                    active={false}
                    onPress={() =>
                      setDay(d.dayOfWeek, {
                        closesAt: Math.min(MINUTES_MAX, (d.closesAt ?? DEFAULT_OPEN.closesAt) + 30),
                      })
                    }
                  />
                </View>
              </>
            )}
          </Card>
        ))}

        {!valid && (
          <Text style={[styles.error, { color: palette.red }]}>
            Une journée ouverte doit avoir une heure d'ouverture avant l'heure de fermeture.
          </Text>
        )}
        {error !== null && <Text style={[styles.error, { color: palette.red }]}>{error}</Text>}
        {saved && <Text style={[styles.error, { color: palette.greenDeep }]}>Horaires enregistrés.</Text>}

        <View style={{ marginTop: spacing.md, gap: 4 }}>
          <Button
            label="Enregistrer"
            onPress={submit}
            loading={save.isPending}
            disabled={!valid || save.isPending}
          />
          <Button
            label="Ne pas indiquer d'horaires"
            variant="text"
            onPress={clearAll}
            disabled={save.isPending}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayLabel: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  hint: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, lineHeight: 17.4, marginTop: 4 },
  error: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, marginTop: 8 },
});
