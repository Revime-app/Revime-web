import { useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../theme';
import { Button } from '../Button';
import { IconDocument, IconMail, IconTick } from '../../icons';
import { SUPPORT_EMAIL } from '../../lib/support';

const NBSP = '\u00A0';

function formatOrderDate(date: string | Date | null | undefined): string {
  if (!date) return 'À compléter';
  try {
    const parsed = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(parsed.getTime())) return typeof date === 'string' ? date : 'À compléter';
    return parsed.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return typeof date === 'string' ? date : 'À compléter';
  }
}

export type StatutoryWithdrawalModalProps = {
  visible: boolean;
  onDismiss: () => void;
  orderReference?: string | null;
  commandeId?: string | null;
  orderDate?: string | Date | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  repairerName?: string | null;
};

/**
 * Builds the official statutory withdrawal text under French Consumer Code Art. R. 221-1.
 */
export function buildStatutoryWithdrawalText({
  orderReference,
  commandeId,
  orderDate,
  clientName,
  clientEmail,
  clientAddress,
  repairerName,
}: {
  orderReference?: string | null;
  commandeId?: string | null;
  orderDate?: string | Date | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientAddress?: string | null;
  repairerName?: string | null;
} = {}): string {
  const ref = orderReference?.trim() || commandeId?.trim() || 'À compléter';
  const formattedOrderDate = formatOrderDate(orderDate);
  const client = clientName?.trim() || 'À compléter';
  const email = clientEmail?.trim() || 'À compléter';
  const address = clientAddress?.trim() || 'À compléter';
  const repairer = repairerName?.trim() || 'Le réparateur professionnel';
  const todayStr = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return [
    'MODÈLE DE FORMULAIRE DE RÉTRACTATION',
    '(Article R. 221-1 du Code de la consommation)',
    '',
    'Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.',
    '',
    'À l\'attention de :',
    `REVIME / ${repairer}`,
    `Adresse électronique : ${SUPPORT_EMAIL}`,
    '',
    'Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de services de réparation ci-dessous :',
    '',
    `- Référence de la commande : ${ref}`,
    `- Commandé le : ${formattedOrderDate}`,
    `- Nom du (des) consommateur(s) : ${client}`,
    `- Adresse du (des) consommateur(s) : ${address}`,
    `- Adresse électronique : ${email}`,
    '',
    `Date : ${todayStr}`,
    'Signature du (des) consommateur(s) (uniquement en cas de notification du présent formulaire sur papier) :',
    '',
    '(*) Rayez la mention inutile.',
  ].join('\n');
}

/**
 * Statutory French withdrawal modal (Formulaire type de rétractation)
 * per Article R. 221-1 of the French Consumer Code.
 *
 * Provides pre-filled template text with actions to copy to clipboard or
 * send directly via email to the platform support team.
 */
export function StatutoryWithdrawalModal({
  visible,
  onDismiss,
  orderReference,
  commandeId,
  orderDate,
  clientName,
  clientEmail,
  clientAddress,
  repairerName,
}: StatutoryWithdrawalModalProps) {
  const { palette, radii, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const formText = buildStatutoryWithdrawalText({
    orderReference,
    commandeId,
    orderDate,
    clientName,
    clientEmail,
    clientAddress,
    repairerName,
  });

  const handleCopy = async () => {
    await Clipboard.setStringAsync(formText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendEmail = async () => {
    const ref = orderReference?.trim() || commandeId?.trim();
    const subject = ref
      ? `Rétractation commande ${ref}`
      : 'Rétractation de commande REVIME';
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(formText)}`;

    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        await handleCopy();
      }
    } catch {
      await handleCopy();
    }
  };

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

          <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
            Formulaire type de rétractation
          </Text>

          <Text style={[styles.subtitle, { color: palette.muted }]}>
            Article R.{NBSP}221-1 du Code de la consommation
          </Text>

          <Text style={[styles.description, { color: palette.ink2 }]}>
            Veuillez compléter et renvoyer ce formulaire uniquement si vous souhaitez exercer votre droit de rétractation du contrat de réparation.
          </Text>

          <View
            style={[
              styles.textBox,
              {
                backgroundColor: palette.mist,
                borderColor: palette.line,
                borderRadius: radii.field,
              },
            ]}
          >
            <ScrollView
              style={styles.innerScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <Text
                selectable
                style={[styles.formText, { color: palette.ink }]}
              >
                {formText}
              </Text>
            </ScrollView>
          </View>

          <View style={styles.actions}>
            <Button
              label={copied ? 'Formulaire copié !' : 'Copier le formulaire'}
              onPress={handleCopy}
              variant="primary"
              icon={
                copied ? (
                  <IconTick size={18} color={palette.paper} strokeWidth={2.2} />
                ) : (
                  <IconDocument size={18} color={palette.paper} strokeWidth={2} />
                )
              }
            />

            <Button
              label="Envoyer par email"
              onPress={handleSendEmail}
              variant="secondary"
              icon={<IconMail size={18} color={palette.ink} strokeWidth={2} />}
            />

            <Button label="Fermer" onPress={onDismiss} variant="text" />
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
    maxHeight: '92%',
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
  title: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 17,
    lineHeight: 23,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 12.5,
    lineHeight: 17,
    marginBottom: 10,
  },
  description: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
    lineHeight: 18.5,
    marginBottom: 14,
  },
  textBox: {
    borderWidth: 1,
    padding: 12,
    maxHeight: 260,
    marginBottom: 16,
  },
  innerScroll: {
    maxHeight: 236,
  },
  formText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12,
    lineHeight: 17.5,
  },
  actions: {
    gap: 10,
  },
});
