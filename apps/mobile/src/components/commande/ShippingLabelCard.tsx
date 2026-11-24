import { Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { CommandeDto, CommandeRole, ParcelStage } from '@revime/shared';
import { useTheme } from '../../theme';
import { Card } from '../Card';
import { Button } from '../Button';
import { useLabelUrl } from '../../lib/queries';

type Props = {
  commandeId: string;
  data: CommandeDto;
  role: CommandeRole;
  /** Livraison Boxtal (spec §9.2): the server's flag gates every Boxtal surface. */
  quoting: boolean;
  stage: ParcelStage;
};

/**
 * Shipping-label surfaces for a PARCEL delivery, unchanged from `commande/[id].tsx`
 * (extraction only - Task 5 commit 1):
 * - the manual driver's two informational states (labels pending / issued by e-mail);
 * - the Boxtal driver's re-downloadable label button for the leg the caller owns
 *   (CF3-18).
 *
 * Renders nothing outside a PARCEL delivery or when neither branch applies - same
 * conditions the screen evaluated inline before this extraction.
 */
export function ShippingLabelCard({ commandeId, data, role, quoting, stage }: Props) {
  const { palette, spacing } = useTheme();
  const labelUrl = useLabelUrl(commandeId);

  if (!quoting && stage === 'AWAITING_LABELS') {
    return (
      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, color: palette.muted }}>
          Les deux adresses sont enregistrées. Vos bordereaux d'expédition arrivent par e-mail.
        </Text>
      </Card>
    );
  }

  if (!quoting && stage === 'LABELS_ISSUED') {
    return (
      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, color: palette.muted }}>
          Votre bordereau d'expédition vous a été envoyé par e-mail.
        </Text>
      </Card>
    );
  }

  // Livraison Boxtal (CF3-18): le bordereau d'expédition reste accessible et re-téléchargeable
  if (quoting && data.delivery === 'PARCEL') {
    const myLeg = role === 'CLIENT' ? 'OUTBOUND' : 'RETURN';
    const mine = data.shipments.find((s) => s.leg === myLeg);
    const relevant =
      mine !== undefined &&
      mine.status !== 'CANCELLED' &&
      (myLeg === 'OUTBOUND'
        ? stage === 'AWAITING_LABELS' ||
          stage === 'LABELS_ISSUED' ||
          data.outboundTrackingNumber !== null ||
          mine.labelReady
        : mine.status !== 'PENDING');
    if (!mine || !relevant) return null;
    if (mine.status === 'FAILED') {
      return (
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, color: palette.muted }}>
            Bordereau indisponible pour le moment. Notre équipe s'en occupe et vous prévient.
          </Text>
        </Card>
      );
    }
    if (!mine.labelReady) {
      return (
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, color: palette.muted }}>
            Votre bordereau d'expédition est en cours de préparation.
          </Text>
        </Card>
      );
    }
    return (
      <Card style={{ marginBottom: spacing.md }}>
        <Button
          label={
            myLeg === 'RETURN'
              ? 'Télécharger le bordereau retour'
              : "Télécharger le bordereau d'expédition"
          }
          variant="secondary"
          loading={labelUrl.isPending}
          onPress={() =>
            labelUrl.mutate(myLeg, { onSuccess: ({ url }) => void WebBrowser.openBrowserAsync(url) })
          }
        />
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 12,
            color: palette.muted,
            textAlign: 'center',
            marginTop: spacing.xs,
          }}
        >
          Le bordereau d'expédition a également été envoyé par e-mail.
        </Text>
      </Card>
    );
  }

  return null;
}
