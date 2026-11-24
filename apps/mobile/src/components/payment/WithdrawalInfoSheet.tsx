import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { Button } from '../Button';
import { IconDocument } from '../../icons';

const NBSP = '\u00A0';

export type WithdrawalInfoSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  isPro: boolean;
  onOpenWithdrawalForm: () => void;
};

/**
 * Mobile legal information bottom sheet displayed when the client taps « En savoir plus »
 * on the payment screen (`apps/mobile/app/demande/[id]/paiement.tsx`).
 *
 * Implements Page 4 of the client payment compliance mockup verbatim:
 * - Version Réparateur Professionnel (Mockup 04-1):
 *   Explains the 14-day statutory withdrawal period under French Consumer Code Art. L. 221-18,
 *   full refund before start, proportional refund while in progress, loss of withdrawal right
 *   once completed (Art. L. 221-28 1°), escrow security reassurance, how to withdraw (including
 *   a direct action to view the statutory form), and 14-day wait option.
 * - Version Réparateur Particulier (Mockup 04-2):
 *   Explains why withdrawal rights do not apply between private individuals (C2C), while
 *   reassuring the customer of escrow protection until validation.
 */
export function WithdrawalInfoSheet({
  visible,
  onDismiss,
  isPro,
  onOpenWithdrawalForm,
}: WithdrawalInfoSheetProps) {
  const { palette, radii, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <Pressable
        style={[styles.scrim, { backgroundColor: `${palette.ink}66` }]}
        onPress={onDismiss}
        accessible={false}
      >
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: palette.paper,
              borderTopLeftRadius: radii.card,
              borderTopRightRadius: radii.card,
              paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm),
            },
          ]}
          onPress={() => {}}
          accessible={false}
        >
          <View style={[styles.handle, { backgroundColor: palette.line }]} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {isPro ? (
              <>
                <Text
                  accessibilityRole="header"
                  style={[styles.title, { color: palette.ink }]}
                >
                  Version réparateur professionnel — Votre droit de rétractation
                </Text>

                <Text style={[styles.lead, { color: palette.ink2 }]}>
                  Vous disposez de 14{NBSP}jours à partir de votre commande pour changer d&apos;avis.
                </Text>

                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: palette.ink }]}>
                    Si la réparation n&apos;a pas commencé
                  </Text>
                  <Text style={[styles.sectionBody, { color: palette.ink2 }]}>
                    Vous êtes remboursé intégralement, y compris la livraison et la Protection REVIME.
                  </Text>
                </View>

                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: palette.ink }]}>
                    Si la réparation est en cours
                  </Text>
                  <Text style={[styles.sectionBody, { color: palette.ink2 }]}>
                    Vous pouvez toujours annuler. Vous payez seulement la partie déjà réalisée, en proportion du prix total.
                  </Text>
                </View>

                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: palette.ink }]}>
                    Une fois la réparation terminée
                  </Text>
                  <Text style={[styles.sectionBody, { color: palette.ink2 }]}>
                    Comme vous avez demandé qu&apos;elle commence tout de suite, vous ne pouvez plus vous rétracter.
                  </Text>
                </View>

                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: palette.ink }]}>
                    Votre paiement reste protégé
                  </Text>
                  <Text style={[styles.sectionBody, { color: palette.ink2 }]}>
                    Le réparateur n&apos;est payé qu&apos;après votre validation. Si la réparation ne vous convient pas, vous pouvez signaler un problème avant de la valider, et REVIME examine votre demande.
                  </Text>
                </View>

                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: palette.ink }]}>
                    Comment vous rétracter
                  </Text>
                  <Text style={[styles.sectionBody, { color: palette.ink2 }]}>
                    Depuis le détail de votre commande, avec le bouton «{NBSP}Annuler la commande{NBSP}», ou avec le formulaire de rétractation disponible dans l&apos;application.
                  </Text>
                  <View style={styles.formButtonWrapper}>
                    <Button
                      label="Consulter le formulaire type de rétractation"
                      onPress={onOpenWithdrawalForm}
                      variant="secondary"
                      icon={<IconDocument size={17} color={palette.ink} strokeWidth={1.8} />}
                    />
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: palette.ink }]}>
                    Vous préférez attendre{NBSP}?
                  </Text>
                  <Text style={[styles.sectionBody, { color: palette.ink2 }]}>
                    Choisissez «{NBSP}Je préfère attendre 14{NBSP}jours{NBSP}» : la réparation commencera à la fin de ce délai.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text
                  accessibilityRole="header"
                  style={[styles.title, { color: palette.ink }]}
                >
                  Version réparateur particulier — Pourquoi pas de droit de rétractation{NBSP}?
                </Text>

                <Text style={[styles.lead, { color: palette.ink2 }]}>
                  Ce réparateur est un particulier. Le droit de rétractation ne s&apos;applique qu&apos;aux achats auprès d&apos;un professionnel.
                </Text>

                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: palette.ink }]}>
                    Votre paiement reste protégé
                  </Text>
                  <Text style={[styles.sectionBody, { color: palette.ink2 }]}>
                    Le réparateur n&apos;est payé qu&apos;après votre validation. Si la réparation ne vous convient pas, vous pouvez signaler un problème avant de la valider, et REVIME examine votre demande.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Button label="Fermer" onPress={onDismiss} variant="secondary" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  title: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 17,
    lineHeight: 23,
    marginBottom: 12,
  },
  lead: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 14.5,
    lineHeight: 20,
    marginBottom: 4,
  },
  sectionBody: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13.5,
    lineHeight: 19.5,
  },
  formButtonWrapper: {
    marginTop: 12,
  },
  footer: {
    paddingTop: 12,
  },
});
