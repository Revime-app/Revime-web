import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { MeResponse } from '@revime/shared';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Field } from '../../src/components/Field';
import { Button } from '../../src/components/Button';
import { authClient } from '../../src/lib/auth-client';
import { useSessionContext } from '../../src/lib/session';
import { useTheme } from '../../src/theme';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

/**
 * `CF-47` task 10. Informations personnelles: prénom and nom.
 *
 * 🛑 These are the LEGAL identity fields that level 2 verification checks against an ID
 * document. `schema.prisma`'s User header says so explicitly, and they are deliberately
 * distinct from `name` (display name). Changing them after verification may require
 * verifying again - we say so on the screen and do NOT touch `verificationLevel`.
 *
 * 🛑 Réparateur presentation (displayName, bio) does NOT belong here. It lives on
 * `profil-public.tsx` behind `PATCH /users/me/repairer-profile`. Duplicating it is
 * exactly the « écrans qui font doublon » the client complained about in `CF-22`.
 */
export default function PersonnelScreen() {
  const { palette, spacing, type } = useTheme();
  const { me, refresh } = useSessionContext();

  /**
   * Normalize at entry: a new field from a stale API arrives `undefined`, and
   * `undefined !== null` passes every null guard. Give absence one representation.
   */
  const firstName = me?.firstName ?? null;
  const lastName = me?.lastName ?? null;

  const [firstNameDraft, setFirstNameDraft] = useState('');
  const [lastNameDraft, setLastNameDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const seededRef = useRef(false);

  /**
   * Seed the form once when me first loads. One-shot seeding eliminates the data-loss
   * window where a user types after a save's mutation resolves but before the session
   * refetch lands. Pattern from `profil-public.tsx`.
   */
  useEffect(() => {
    if (!seededRef.current && me) {
      setFirstNameDraft(firstName ?? '');
      setLastNameDraft(lastName ?? '');
      seededRef.current = true;
    }
  }, [me, firstName, lastName]);

  const changed =
    firstNameDraft.trim() !== (firstName ?? '') || lastNameDraft.trim() !== (lastName ?? '');

  const onSave = async () => {
    if (!changed || saving) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      /**
       * `authClient.updateUser` writes through Better Auth's update hook, which normalises
       * and duplicate-checks phone and username on that path (auth.ts:193-211). We do not
       * add validation for firstName/lastName here - the server owns it.
       */
      await authClient.updateUser({
        firstName: firstNameDraft.trim(),
        lastName: lastNameDraft.trim(),
      });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      /**
       * 🛑 Log but do not surface the library error. Better Auth's messages are English,
       * and only ApiError messages (from our own API) are guaranteed French. The distinction
       * is that ApiError comes from routes we control, while authClient is a third-party
       * library.
       */
      console.error('[personnel] updateUser failed', e);
      setError("Les informations n'ont pas pu être enregistrées.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
      <ScreenHeader title="Informations personnelles" onBack={() => router.back()} />
      <KeyboardAvoider>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* 🛑 Legal identity warning: these fields are checked against an ID document at
            level 2 verification. Editing them after verification may require re-verifying. */}
        <View
          style={{
            backgroundColor: palette.mist,
            borderRadius: 12,
            padding: spacing.lg,
            marginBottom: spacing.lg,
          }}
        >
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.muted,
              lineHeight: type.body.size * 1.5,
            }}
          >
            Ces informations correspondent à votre identité légale. Si vous les modifiez après
            vérification, une nouvelle vérification pourrait être nécessaire.
          </Text>
        </View>

        <Field
          label="Prénom"
          value={firstNameDraft}
          onChangeText={(t) => {
            setFirstNameDraft(t);
            setError(null);
            setSaved(false);
          }}
          placeholder="Votre prénom"
          autoCapitalize="words"
          autoComplete="given-name"
        />

        <Field
          label="Nom"
          value={lastNameDraft}
          onChangeText={(t) => {
            setLastNameDraft(t);
            setError(null);
            setSaved(false);
          }}
          placeholder="Votre nom"
          autoCapitalize="words"
          autoComplete="family-name"
        />

        {error && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.red,
              marginTop: -spacing.xs,
              marginBottom: spacing.md,
            }}
          >
            {error}
          </Text>
        )}

        {saved && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.green,
              marginTop: -spacing.xs,
              marginBottom: spacing.md,
            }}
          >
            Enregistré avec succès
          </Text>
        )}

        <Button label="Enregistrer" onPress={onSave} loading={saving} disabled={!changed} />
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
