import { Text } from 'react-native';
import type { CommandeRole } from '@revime/shared';
import { useTheme } from '../../theme';
import { Card } from '../Card';

type Props = {
  role: CommandeRole;
};

/**
 * « Adresse enregistrée. En attente de l'adresse … » - unchanged from
 * `commande/[id].tsx` (extraction only - Task 5 commit 1). Renders while
 * `parcelStage(data) === 'AWAITING_OTHER_ADDRESS'` - the caller decides that.
 */
export function AwaitingOtherAddressCard({ role }: Props) {
  const { palette, spacing } = useTheme();

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, color: palette.muted }}>
        Adresse enregistrée. En attente de l'adresse{' '}
        {role === 'CLIENT' ? 'du réparateur' : 'du client'}.
      </Text>
    </Card>
  );
}
