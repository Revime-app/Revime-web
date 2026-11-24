import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../../src/theme';
import { Button } from '../../../../src/components/Button';
import { useCommande } from '../../../../src/lib/queries';

export default function LitigeOuvertScreen() {
  const { id, ref } = useLocalSearchParams<{ id: string; ref?: string }>();
  const commandeId = id ?? '';
  const { palette, spacing, radii } = useTheme();
  const router = useRouter();

  const commande = useCommande(commandeId);
  const conversationId = commande.data?.conversationId;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.paper }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.content, { padding: spacing.xl }]}>
        {/* Shield / Alert icon */}
        <View
          style={[
            styles.iconWrapper,
            {
              backgroundColor: '#fef3f2',
              borderColor: '#fecdca',
            },
          ]}
        >
          <Text style={styles.icon}>🛡️</Text>
        </View>

        <Text style={[styles.title, { color: palette.ink }]}>
          Votre litige est ouvert
        </Text>

        {ref ? (
          <View
            style={[
              styles.refBadge,
              {
                backgroundColor: palette.mist,
                borderRadius: radii.pill,
                marginTop: spacing.xs,
              },
            ]}
          >
            <Text style={[styles.refText, { color: palette.ink }]}>
              Référence {ref}
            </Text>
          </View>
        ) : null}

        {/* Escrow banner */}
        <View
          style={[
            styles.escrowCard,
            {
              backgroundColor: '#fffcf5',
              borderColor: '#fedf89',
              borderRadius: radii.card,
              marginTop: spacing.xl,
            },
          ]}
        >
          <Text style={styles.escrowIcon}>🔒</Text>
          <Text style={[styles.escrowText, { color: '#b54708' }]}>
            Les fonds sont conservés par REVIME jusqu'à la résolution du litige.
          </Text>
        </View>

        {/* Explanation */}
        <Text
          style={[
            styles.explanation,
            { color: palette.muted, marginTop: spacing.lg },
          ]}
        >
          REVIME va examiner votre demande et pourra revenir vers vous si des
          informations complémentaires sont nécessaires.
        </Text>

        <View style={styles.spacer} />

        {/* Actions */}
        <View style={{ gap: spacing.md, width: '100%' }}>
          <Button
            label="Voir le suivi du litige"
            variant="primary"
            onPress={() => router.replace(`/commande/${commandeId}/litige`)}
          />

          <Button
            label="Retourner à la conversation"
            variant="secondary"
            onPress={() => {
              if (conversationId) {
                router.replace(`/conversation/${conversationId}`);
              } else {
                router.replace(`/commande/${commandeId}`);
              }
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 34,
  },
  title: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 22,
    textAlign: 'center',
  },
  refBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  refText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
  },
  escrowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    gap: 10,
    width: '100%',
  },
  escrowIcon: {
    fontSize: 18,
  },
  escrowText: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  explanation: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  spacer: {
    flex: 1,
  },
});
