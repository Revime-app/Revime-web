import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { CommandeDto } from '@revime/shared';
import { useTheme } from '../../theme';
import { Card } from '../Card';
import { Button } from '../Button';
import { Initials } from '../Initials';
import { useOpenConversation } from '../../lib/queries';
import { ApiError } from '../../lib/api';

type Props = {
  data: CommandeDto;
};

/**
 * Spec §4.4 item 2 - « Client » and « Réparateur » rows. The counterpart's row carries a
 * « Contacter » button: with `conversationId` set it opens that thread directly; otherwise
 * it gets one via `useOpenConversation()` (get-or-create) and pushes once it resolves. For
 * the client, the réparateur row also opens `/reparateur/[userId]`.
 */
export function CommandePartiesCard({ data }: Props) {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const openConversation = useOpenConversation();
  const [error, setError] = useState<string | null>(null);

  const isClient = data.viewerRole === 'CLIENT';

  const onContact = () => {
    if (data.conversationId) {
      router.push(`/conversation/${data.conversationId}`);
      return;
    }
    if (openConversation.isPending) return;
    setError(null);
    openConversation.mutate(
      { demandeId: data.demandeId, repairerUserId: data.repairer.userId },
      {
        onSuccess: ({ id }) => router.push(`/conversation/${id}`),
        onError: (e) =>
          setError(e instanceof ApiError ? e.message : "La conversation n'a pas pu être ouverte."),
      },
    );
  };

  const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm };
  const labelStyle = { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, color: palette.muted } as const;
  const nameStyle = { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink } as const;

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={[rowStyle, { justifyContent: 'space-between', paddingBottom: spacing.md }]}>
        <View style={[rowStyle, { flex: 1, marginRight: spacing.sm }]}>
          <Initials name={data.client.name} uri={data.client.avatarUrl} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Client</Text>
            <Text style={nameStyle} numberOfLines={1}>{data.client.name}</Text>
          </View>
        </View>
        {!isClient && (
          <Button label="Contacter" variant="secondary" onPress={onContact} loading={openConversation.isPending} />
        )}
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: palette.line,
          paddingTop: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable
          onPress={isClient ? () => router.push(`/reparateur/${data.repairer.userId}`) : undefined}
          disabled={!isClient}
          style={[rowStyle, { flex: 1, marginRight: spacing.sm }]}
        >
          <Initials name={data.repairer.name} uri={data.repairer.avatarUrl} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>Réparateur</Text>
            <Text style={nameStyle} numberOfLines={1}>{data.repairer.name}</Text>
          </View>
        </Pressable>
        {isClient && (
          <Button label="Contacter" variant="secondary" onPress={onContact} loading={openConversation.isPending} />
        )}
      </View>

      {error && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 12.5,
            color: palette.redDeep,
            marginTop: spacing.sm,
          }}
        >
          {error}
        </Text>
      )}
    </Card>
  );
}
