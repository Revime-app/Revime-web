import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useSessionContext } from '../../src/lib/session';
import { useUpdateRepairerProfile } from '../../src/lib/queries';
import { ApiError } from '../../src/lib/api';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

const BIO_MAX = 600;

/**
 * `CF-49`: the displayName + bio editor, moved out of `profil-public/index.tsx`. The one-shot
 * seeding effect and the mutation handler are the originals, comments included.
 */
export default function ProfilPublicDescription() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const { me, refresh } = useSessionContext();
  const update = useUpdateRepairerProfile();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const seededRef = useRef(false);

  // Seed the form once when me first loads, then never again. After
  // the initial seed, the form is the source of truth. This prevents data loss:
  // if the user typed after a save's mutation resolved but before the session
  // refetch landed, a continuous-sync effect would reset the fields and destroy
  // their work. One-shot seeding eliminates the window entirely.
  useEffect(() => {
    if (!seededRef.current && me) {
      if (me.repairer) {
        setDisplayName(me.repairer.displayName ?? '');
        setBio(me.repairer.bio ?? '');
      }
      seededRef.current = true;
    }
  }, [me]);

  const onSave = () => {
    setProfileError(null);
    setSaved(false);
    update.mutate(
      // Only what changed is sent, so an untouched field is not rewritten. The route
      // treats an absent key as « leave alone ».
      {
        ...(displayName.trim() === (me?.repairer?.displayName ?? '')
          ? {}
          : { displayName: displayName.trim() }),
        ...(bio.trim() === (me?.repairer?.bio ?? '') ? {} : { bio: bio.trim() }),
      },
      {
        onSuccess: async () => {
          // 🛑 MANDATORY, and `useUpdateRepairerProfile`'s own invalidation cannot do it:
          // `invalidateQueries({ queryKey: queryKeys.me })` is INERT here - nothing registers a
          // `useQuery` on `['me']`, and the session lives in `SessionProvider`'s `useState`. Without
          // this, saving a bio leaves `completion.items.description` false and the checklist above
          // stuck at the old count. Same rule `mes-categories.tsx` follows.
          await refresh();
          setSaved(true);
        },
        onError: (e) => {
          if (e instanceof ApiError) {
            setProfileError(e.fields?.displayName ?? e.fields?.bio ?? e.message);
          } else {
            setProfileError("Le profil n'a pas pu être enregistré.");
          }
        },
      },
    );
  };

  if (!me) return null;
  if (me.profile.repairerEnabled !== true) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenHeader title="Description" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, color: palette.muted }}>
            Activez le mode réparateur pour présenter votre activité.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenHeader title="Description" onBack={() => router.back()} />
      <KeyboardAvoider>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Card>
          <Field
            label="Nom affiché"
            value={displayName}
            onChangeText={(text) => {
              setDisplayName(text);
              setProfileError(null);
            }}
            editable={!update.isPending}
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
            Ce nom apparaît sur vos offres et dans l'annuaire.
          </Text>

          <Field
            label="À propos"
            value={bio}
            onChangeText={(text) => {
              setBio(text.slice(0, BIO_MAX));
              setProfileError(null);
            }}
            multiline
            minHeight={110}
            editable={!update.isPending}
          />
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 12,
              color: bio.length >= BIO_MAX ? palette.red : palette.muted,
              marginTop: 4,
              marginBottom: spacing.md,
            }}
          >
            {bio.length} / {BIO_MAX}
          </Text>

          {profileError !== null && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_500Medium',
                fontSize: 13,
                color: palette.red,
                marginBottom: spacing.sm,
              }}
            >
              {profileError}
            </Text>
          )}

          {saved && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_500Medium',
                fontSize: 13,
                color: palette.greenDeep,
                marginBottom: spacing.sm,
              }}
            >
              Profil enregistré.
            </Text>
          )}

          <Button label="Enregistrer" onPress={onSave} loading={update.isPending} />
        </Card>
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
