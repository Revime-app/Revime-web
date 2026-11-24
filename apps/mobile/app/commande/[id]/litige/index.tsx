import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../../src/theme';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import { DisputeSpace } from '../../../../src/components/dispute/DisputeSpace';
import { useCommande } from '../../../../src/lib/queries';

export default function CommandeLitigeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const commandeId = id ?? '';
  const { palette } = useTheme();
  const router = useRouter();
  const commande = useCommande(commandeId);

  const counterpartName =
    commande.data?.viewerRole === 'CLIENT'
      ? commande.data?.repairer.name
      : commande.data?.client.name;
  const counterpartRole =
    commande.data?.viewerRole === 'CLIENT' ? 'repairer' : 'client';

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: palette.page }}
      edges={['top']}
    >
      <ScreenHeader title="Litige" onBack={() => router.back()} />
      <DisputeSpace
        commandeId={commandeId}
        counterpartName={counterpartName}
        counterpartRole={counterpartRole}
      />
    </SafeAreaView>
  );
}
