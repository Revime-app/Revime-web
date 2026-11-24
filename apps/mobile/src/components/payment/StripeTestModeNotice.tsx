import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { IconInfo, IconTick } from '../../icons';

/** Stripe's published test cards: https://docs.stripe.com/testing */
const SUCCESS_CARD = '4242 4242 4242 4242';
const THREE_D_SECURE_CARD = '4000 0027 6000 3184';
const DECLINED_CARD = '4000 0000 0000 0002';

const COPIED_MS = 2_500;

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * CF6-07. Shown on the payment screen exactly while the SERVER says Stripe is in test mode
 * (`shouldShowTestNotice`). It exists because the client's own first test payment was refused:
 * he typed a real card, and Stripe's decline code was `test_mode_live_card`. So the first thing it
 * says is that a real card will not work, then which cards do.
 *
 * Colours come from the palette as shipped: the badge is `amberDeep` on `amberSoft` (4.59:1),
 * because `amber` on `amberSoft` is 2.14:1 and fails.
 */
export function StripeTestModeNotice() {
  const { palette, radii, spacing } = useTheme();
  const [copy, setCopy] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The "copied" confirmation resets on a timer; it must not fire into an unmounted screen.
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopyCard = async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await Clipboard.setStringAsync(SUCCESS_CARD.replace(/ /g, ''));
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
    resetTimer.current = setTimeout(() => setCopy('idle'), COPIED_MS);
  };

  const label = copy === 'copied' ? 'Numéro copié' : copy === 'failed' ? 'Copie impossible' : 'Copier le numéro';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.paper,
          borderColor: palette.line,
          borderRadius: radii.card,
          padding: spacing.md,
          marginBottom: spacing.md,
        },
      ]}
      accessibilityRole="summary"
    >
      <View style={[styles.badge, { backgroundColor: palette.amberSoft, borderRadius: radii.field }]}>
        <IconInfo size={14} color={palette.amberDeep} />
        <Text style={[styles.badgeText, { color: palette.amberDeep }]}>Mode test actif</Text>
      </View>

      <Text style={[styles.description, { color: palette.ink, marginTop: spacing.xs }]}>
        Aucun débit réel ne sera effectué. N'utilisez pas votre vraie carte : elle serait refusée. Utilisez une carte de test.
      </Text>

      <View style={[styles.cardDetailsBox, { borderColor: palette.line, borderRadius: radii.field, marginTop: spacing.sm }]}>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardLabel, { color: palette.muted }]}>Paiement accepté</Text>
          <Text style={[styles.cardNumber, { color: palette.ink }]}>{SUCCESS_CARD}</Text>
          <Text style={[styles.cardMeta, { color: palette.muted }]}>Exp : 12/34 · CVC : 123</Text>
        </View>

        <Pressable
          style={[
            styles.copyButton,
            {
              backgroundColor: copy === 'copied' ? palette.navy : palette.paper,
              borderColor: palette.navy,
              borderRadius: radii.field,
            },
          ]}
          onPress={handleCopyCard}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityLiveRegion="polite"
        >
          {copy === 'copied' && <IconTick size={13} color={palette.paper} strokeWidth={2.5} />}
          <Text
            style={[
              styles.copyButtonText,
              { color: copy === 'copied' ? palette.paper : copy === 'failed' ? palette.redDeep : palette.navy },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.otherCards, { color: palette.muted, marginTop: spacing.sm }]}>
        Authentification 3D Secure : {THREE_D_SECURE_CARD} · Paiement refusé : {DECLINED_CARD}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  cardDetailsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderWidth: 1,
  },
  cardInfo: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  cardNumber: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex_700Bold',
    letterSpacing: 0.5,
  },
  cardMeta: {
    fontSize: 11,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  otherCards: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'GoogleSansFlex_400Regular',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    marginLeft: 8,
  },
  copyButtonText: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
