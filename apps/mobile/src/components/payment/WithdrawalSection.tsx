import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LEGAL_WITHDRAWAL_WAIVER_TEXT, type ExecutionDelayPreference } from '@revime/shared';
import { useTheme } from '../../theme';
import { IconInfo, IconTick } from '../../icons';
import { Card } from '../Card';

export type WithdrawalSectionProps = {
  isPro: boolean;
  waiverAccepted: boolean;
  onToggleWaiver: () => void;
  delayPreference: ExecutionDelayPreference;
  onSelectDelayPreference: (pref: ExecutionDelayPreference) => void;
  onOpenInfoSheet: () => void;
  showFootnote?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Mobile right of withdrawal (droit de rétractation) compliance section
 * rendered on the checkout screen (`apps/mobile/app/demande/[id]/paiement.tsx`).
 *
 * Implements mockups 02-1, 02-2, 03-1:
 * - Professional repairer (`isPro === true`):
 *   - Checkbox with express waiver text (`LEGAL_WITHDRAWAL_WAIVER_TEXT`), unticked by default.
 *   - « En savoir plus » link opening statutory information bottom sheet.
 *   - « Je préfère attendre 14 jours avant le début de la réparation » toggle.
 *   - When in 14-day delay mode: displays selected delay card with « Revenir au démarrage immédiat ».
 *   - Footnote prompting the client when unticked.
 * - Private repairer (`isPro === false`):
 *   - Informational callout stating statutory withdrawal does not apply to C2C repairs,
 *     with escrow security reassurance and « En savoir plus » link.
 */
export function WithdrawalSection({
  isPro,
  waiverAccepted,
  onToggleWaiver,
  delayPreference,
  onSelectDelayPreference,
  onOpenInfoSheet,
  showFootnote = true,
  style,
}: WithdrawalSectionProps) {
  const { palette, accent, radii } = useTheme();

  // Particulier mode (Mockup 03-1): no checkbox, clear informational notice
  if (!isPro) {
    return (
      <View
        style={[
          styles.particulierCard,
          {
            backgroundColor: palette.paper,
            borderRadius: radii.card,
            borderColor: palette.line,
            shadowColor: palette.ink,
          },
          style,
        ]}
        accessibilityRole="summary"
      >
        <View style={styles.particulierRow}>
          <View style={styles.infoIconWrapper}>
            <IconInfo size={18} color={palette.ink} strokeWidth={2} />
          </View>
          <Text style={[styles.particulierText, { color: palette.ink }]}>
            <Text style={styles.particulierBold}>
              Réparateur particulier{'\u00A0'}:{' '}
            </Text>
            le droit de rétractation ne s'applique pas. Votre paiement reste protégé par REVIME jusqu'à votre validation.{' '}
            <Text
              accessibilityRole="button"
              onPress={onOpenInfoSheet}
              style={[styles.linkRedInline, { color: accent.accent }]}
            >
              En savoir plus
            </Text>
          </Text>
        </View>
      </View>
    );
  }

  // Professional mode (Mockup 02-1 & 02-2)
  const isWait14Days = delayPreference === 'WAIT_14_DAYS';

  return (
    <View style={style}>
      <Card>
        <Text style={[styles.sectionTitle, { color: palette.ink }]}>
          Démarrage de la réparation
        </Text>

        {isWait14Days ? (
          <View style={styles.delayContainer}>
            <Text style={[styles.delayBadgeTitle, { color: palette.ink }]}>
              Délai de rétractation de 14 jours sélectionné
            </Text>
            <Text style={[styles.delayExplanation, { color: palette.muted }]}>
              La réparation débutera à la fin du délai légal de rétractation de 14 jours. Votre paiement reste protégé par REVIME jusqu'à la fin de la prestation.
            </Text>
            <View style={styles.delayLinksContainer}>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenInfoSheet}
                hitSlop={8}
              >
                <Text style={[styles.linkRed, { color: accent.accent }]}>
                  En savoir plus
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onSelectDelayPreference('IMMEDIATE')}
                hitSlop={8}
                style={{ marginTop: 8 }}
              >
                <Text style={[styles.linkActive, { color: accent.accent }]}>
                  Revenir au démarrage immédiat
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.immediateContainer}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: waiverAccepted }}
              onPress={onToggleWaiver}
              style={styles.checkboxRow}
            >
              <View
                style={[
                  styles.checkboxBox,
                  {
                    // CF6-06: the ticked box was the last filled black shape on the payment
                    // screen. Brand navy, like the Escrow card and the Protection sheet band.
                    borderColor: waiverAccepted ? palette.navy : palette.line,
                    backgroundColor: waiverAccepted ? palette.navy : palette.paper,
                    borderRadius: 5,
                  },
                ]}
              >
                {waiverAccepted && (
                  <IconTick size={13} color={palette.paper} strokeWidth={2.5} />
                )}
              </View>
              <Text style={[styles.waiverText, { color: palette.ink }]}>
                {LEGAL_WITHDRAWAL_WAIVER_TEXT}
              </Text>
            </Pressable>

            <View style={styles.linksContainer}>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenInfoSheet}
                hitSlop={8}
              >
                <Text style={[styles.linkRed, { color: accent.accent }]}>
                  En savoir plus
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onSelectDelayPreference('WAIT_14_DAYS')}
                hitSlop={8}
                style={{ marginTop: 8 }}
              >
                <Text style={[styles.linkDelay, { color: palette.muted }]}>
                  Je préfère attendre 14 jours avant le début de la réparation
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </Card>

      {showFootnote && !isWait14Days && !waiverAccepted && (
        <Text style={[styles.footnote, { color: palette.muted }]}>
          Cochez la case ou choisissez d'attendre 14 jours pour continuer.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  particulierCard: {
    borderWidth: 1,
    padding: 14,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  particulierRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoIconWrapper: {
    marginTop: 2,
  },
  particulierText: {
    flex: 1,
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  particulierBold: {
    fontFamily: 'GoogleSansFlex_700Bold',
  },
  linkRedInline: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    textDecorationLine: 'underline',
  },
  sectionTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 15,
    marginBottom: 12,
  },
  immediateContainer: {
    gap: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  waiverText: {
    flex: 1,
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
  },
  linksContainer: {
    marginLeft: 34,
    marginTop: 4,
  },
  linkRed: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  linkDelay: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12.5,
    textDecorationLine: 'underline',
  },
  delayContainer: {
    gap: 8,
  },
  delayBadgeTitle: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 14,
  },
  delayExplanation: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  delayLinksContainer: {
    marginTop: 6,
  },
  linkActive: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  footnote: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 10,
  },
});
