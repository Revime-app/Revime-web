import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { SettingsRow, SettingsSection } from '../../src/components/SettingsRow';
import { IconBack, IconUser, IconImage, IconEdit, IconGrid, IconLocation, IconCalendar } from '../../src/icons';
import { useSessionContext } from '../../src/lib/session';
import { ApiError, api } from '../../src/lib/api';
import type { MeResponse, ChecklistKey } from '@revime/shared';
import { CHECKLIST_KEYS } from '@revime/shared';
import { useIdentityStatus, useBusinessStatus } from '../../src/lib/queries';
import { verificationRows } from '../../src/lib/verification-rows';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

type ChecklistRow = {
  label: string;
  todoSub: string;
  doneSub: string;
  route: '/profil-public/photo' | '/profil-public/banniere' | '/profil-public/description'
    | '/mes-categories' | '/profil-public/zone' | '/profil-public/disponibilites';
  /**
   * 🛑 THE COMPONENT, NOT A RENDERED ELEMENT. This table is at module scope, where `useTheme()`
   * is unreachable - and `make()` in `src/icons.ts` defaults `color` to `'#141414'`, so a
   * pre-rendered `<IconUser size={20} />` here would draw near-black against a row whose text is
   * `palette.muted`. The row renders it and supplies the themed colour.
   */
  icon: (p: { size?: number; color?: string; strokeWidth?: number }) => React.ReactElement;
};

/**
 * 🛑 `satisfies Record<ChecklistKey, ChecklistRow>` IS THE GATE, and it is why this is a keyed map
 * rather than an array. An array of `{ key: ChecklistKey, … }` compiles with a key missing, so the
 * row would silently never render - the vacuous-gate shape `DAY_LABELS_FR` and `profile-completion`'s
 * `items` both avoid. `satisfies` rather than a type annotation so the literal's own key types survive.
 *
 * 🛑 « Catégories » ROUTES OUTSIDE THIS DIRECTORY, to `/mes-categories`. That is deliberate:
 * that screen already ships with exactly one entry point, and renaming a live route is churn
 * this slice was not asked for. It is not an oversight.
 */
const CHECKLIST_ROWS = {
  photo: { label: 'Photo de profil', todoSub: 'Ajoutez votre photo', doneSub: 'Ajoutée', route: '/profil-public/photo', icon: IconUser },
  banner: { label: 'Bannière', todoSub: 'Ajoutez une bannière', doneSub: 'Ajoutée', route: '/profil-public/banniere', icon: IconImage },
  description: { label: 'Description', todoSub: 'Présentez votre activité', doneSub: 'Renseignée', route: '/profil-public/description', icon: IconEdit },
  categories: { label: 'Catégories', todoSub: 'Sélectionnez vos spécialités', doneSub: 'Sélectionnées', route: '/mes-categories', icon: IconGrid },
  zone: { label: "Zone d'intervention", todoSub: 'Définissez votre zone', doneSub: 'Définie', route: '/profil-public/zone', icon: IconLocation },
  availability: { label: 'Disponibilités', todoSub: 'Indiquez vos horaires', doneSub: 'Indiquées', route: '/profil-public/disponibilites', icon: IconCalendar },
} satisfies Record<ChecklistKey, ChecklistRow>;

/**
 * Order comes from `CHECKLIST_KEYS`, which `packages/shared` already exports in the order mockup `04`
 * panel 2 draws the rows - so the drawn order has ONE definition and this file cannot drift from the
 * count that is computed against it.
 */
const CHECKLIST = CHECKLIST_KEYS.map((key) => ({ key, ...CHECKLIST_ROWS[key] }));

/**
 * `CF-49`: split into a hub and three moved editors. The username card and categories row
 * stayed here; the photo/bannière/description editors moved to sibling files.
 *
 * A réparateur's own public profile, and the ONLY place anything can author it -
 * spec §7.5 and §4.6.
 */
export default function ProfilPublic() {
  const { palette, spacing, type, accent } = useTheme();
  const router = useRouter();
  const { me, refresh, refreshIfStale } = useSessionContext();
  const identityStatus = useIdentityStatus(Boolean(me?.connectEnabled));
  const businessStatus = useBusinessStatus(Boolean(me?.repairer?.kind === 'PRO'));

  useFocusEffect(
    useCallback(() => {
      void refreshIfStale();
      if (me?.connectEnabled) {
        void identityStatus.refetch();
      }
      if (me?.repairer?.kind === 'PRO') {
        void businessStatus.refetch();
      }
    }, [refreshIfStale, me?.connectEnabled, me?.repairer?.kind, identityStatus.refetch, businessStatus.refetch]),
  );

  const scrollViewRef = useRef<ScrollView>(null);
  const checklistYRef = useRef(0);

  const handleVerificationRowPress = (key: 'identity' | 'business' | 'repairer') => {
    if (key === 'identity') {
      router.push('/statut-verification');
    } else if (key === 'business') {
      router.push('/entreprise');
    } else if (key === 'repairer') {
      if (completion !== null && checklistYRef.current > 0) {
        scrollViewRef.current?.scrollTo({ y: Math.max(checklistYRef.current - 16, 0), animated: true });
      } else {
        router.push('/statut-verification');
      }
    }
  };

  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [savingUsername, setSavingUsername] = useState(false);
  const seededRef = useRef(false);

  // Seed the username once when me first loads.
  useEffect(() => {
    if (!seededRef.current && me) {
      // Normalize newly added field: me.username arrives undefined from a stale API.
      // See apps/mobile/AGENTS.md.
      setUsernameDraft(me.username ?? '');
      seededRef.current = true;
    }
  }, [me]);

  const saveUsername = async () => {
    if (savingUsername || usernameDraft.trim() === me?.username) return;
    setUsernameError(null);
    setSavingUsername(true);
    try {
      await api.patch<MeResponse>('/users/me/username', { username: usernameDraft.trim() });
      await refresh();
    } catch (e) {
      // Same shape as the displayName/bio handler at :68. The service throws
      // AppException('CONFLICT', …) with a `fields.username`, so a taken handle
      // lands on the field rather than in a banner.
      setUsernameError(e instanceof ApiError ? (e.fields?.username ?? e.message) : 'Une erreur est survenue.');
    } finally {
      setSavingUsername(false);
    }
  };

  // Was `if (!me?.profile.repairerEnabled) return <…/>` - the whole screen.
  // A client now HAS a public identity (their handle), so the screen is theirs
  // too; only the trade-name half is réparateur business. Reusing this screen
  // rather than adding one is CF-22's « sans multiplier inutilement les écrans ».
  const showRepairerPresentation = me?.profile.repairerEnabled === true;

  // `?? null` on a NEW DTO field: an app newer than the API receives `completion` as
  // `undefined`, and reading `.completed` off it would throw during render.
  const completion = me?.repairer?.completion ?? null;
  const complete = completion !== null && completion.completed === completion.total;

  if (!me) return null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <KeyboardAvoider>
      <ScrollView ref={scrollViewRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Pressable
          onPress={() => router.back()}
          style={{ marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center' }}
          accessibilityLabel="Retour"
        >
          <IconBack size={18} color={palette.muted} strokeWidth={2.2} />
          <Text
            style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.muted, marginLeft: 4 }}
          >
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
          Mon profil public
        </Text>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13.5,
            color: palette.muted,
            marginTop: 4,
            marginBottom: spacing.lg,
          }}
        >
          {/* This sentence used to promise « votre nom d'utilisateur, votre nom affiché et votre
              description », which described the screen BEFORE `CF-49` split it. Only the username
              is still inline; the other two moved behind the « Description » chevron, so the old
              wording was a false statement shown to the user about the screen he is looking at. */}
          Modifiez votre nom d’utilisateur.{showRepairerPresentation ? " Votre nom affiché et votre description sont dans « Description ». Consultez votre fiche publique ci-dessous." : ""}
        </Text>

        {showRepairerPresentation && (
          <SettingsSection title="Statut de vérification">
            {verificationRows(
              me,
              identityStatus.data?.status ?? null,
              identityStatus.data?.decision ?? null,
              businessStatus.data?.status ?? null,
            ).map((r) => (
              <SettingsRow
                key={r.key}
                label={r.label}
                sub={r.status}
                subTone={r.tone}
                onPress={() => handleVerificationRowPress(r.key)}
              />
            ))}
            <SettingsRow
              label="Voir le statut détaillé"
              onPress={() => router.push('/statut-verification')}
              last
            />
          </SettingsSection>
        )}

        {showRepairerPresentation && completion !== null && (
          <View
            style={{ marginBottom: spacing.lg }}
            onLayout={(e) => {
              checklistYRef.current = e.nativeEvent.layout.y;
            }}
          >
            {/* `CF-49`. Mockup `04` panel 2. The heading and the bar switch on state; the ROWS
                DO NOT - see the comment on `CHECKLIST` below. */}
            <View style={styles.checklistHead}>
              <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                {complete ? 'MON PROFIL' : 'COMPLÉTEZ VOTRE PROFIL'}
              </Text>
              {!complete && (
                <Text style={[styles.checklistCount, { color: palette.muted }]}>
                  {completion.completed} / {completion.total} complétées
                </Text>
              )}
            </View>

            {!complete && (
              <View style={[styles.track, { backgroundColor: palette.mist }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: accent.accent,
                      // Percentage width, so the bar needs no measured container.
                      width: `${Math.round((completion.completed / completion.total) * 100)}%`,
                    },
                  ]}
                />
              </View>
            )}

            <SettingsSection title={null}>
              {CHECKLIST.map((item, i) => (
                <SettingsRow
                  key={item.key}
                  label={item.label}
                  sub={completion.items[item.key] ? item.doneSub : item.todoSub}
                  subTone={completion.items[item.key] ? 'ok' : 'muted'}
                  icon={<item.icon size={20} color={palette.muted} />}
                  onPress={() => router.push(item.route)}
                  last={i === CHECKLIST.length - 1}
                />
              ))}
            </SettingsSection>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: palette.muted }]}>Nom d’utilisateur</Text>
        <Card>
          <Field
            label="Nom d'utilisateur"
            value={usernameDraft}
            onChangeText={(text) => {
              setUsernameDraft(text);
              setUsernameError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!savingUsername}
          />
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 12,
              color: palette.muted,
              marginTop: 4,
              marginBottom: spacing.md,
            }}
          >
            C'est ce que les autres utilisateurs voient. Votre nom et votre prénom restent privés.
          </Text>

          {usernameError !== null && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_500Medium',
                fontSize: 13,
                color: palette.red,
                marginBottom: spacing.sm,
              }}
            >
              {usernameError}
            </Text>
          )}

          <Button label="Enregistrer" onPress={saveUsername} loading={savingUsername} />
        </Card>

        {showRepairerPresentation && (
          <Card style={{ marginTop: spacing.md }}>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_600SemiBold',
                fontSize: 14,
                color: palette.ink,
                marginBottom: 4,
              }}
            >
              Voir ma fiche publique
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginBottom: spacing.md,
              }}
            >
              Ce que voient les clients dans l'annuaire
            </Text>
            <Button
              label="Voir ma fiche"
              variant="secondary"
              onPress={() => router.push(`/reparateur/${me!.id}`)}
            />
            {/* The profile is NOT re-rendered here on purpose: a second rendering of the
                same profile could drift from the first, which is a hazard this repo has
                been bitten by. Push the real route instead. */}
          </Card>
        )}
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  sectionLabel: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  checklistHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  checklistCount: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', marginBottom: 12 },
  // No shadow anywhere on the track, which keeps `overflow: 'hidden'` safe here - the pairing
  // AGENTS.md records clipping a card's own shadow three times.
  fill: { height: 6, borderRadius: 999 },
});
