import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import type { CommandeDto, ShipmentLeg } from '@revime/shared';
import { useTheme } from '../../theme';
import { Card } from '../Card';
import { deliveryCardLegRows } from '../../lib/shipping-legs-view';

/** « 14 sept. 2026 - 10:14 », matching the timeline card's date format. */
function formatEventDate(isoString: string): string {
  const d = new Date(isoString);
  const datePart = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} - ${timePart}`;
}

function deliveryModeLabel(data: CommandeDto): string {
  if (data.delivery === 'HOME') return 'Intervention à domicile';
  if (data.delivery === 'WORKSHOP') return "Dépôt à l'atelier";
  const leg = data.viewerRole === 'CLIENT' ? 'OUTBOUND' : 'RETURN';
  const carrier = data.shipments.find((s) => s.leg === leg)?.carrierLabel;
  return carrier ?? 'Envoi par colis';
}

function CopyButton({ value }: { value: string }) {
  const { palette, radii } = useTheme();
  const [copied, setCopied] = useState(false);

  const onPress = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Copier le numéro de suivi"
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: radii.field,
        backgroundColor: palette.mist,
      }}
    >
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12, color: copied ? palette.greenDeep : palette.ink }}>
        {copied ? 'Copié' : 'Copier'}
      </Text>
    </Pressable>
  );
}

type Props = {
  data: CommandeDto;
};

/**
 * Spec §4.4 item 5 - « Mode de livraison », and PARCEL-only: « Colis déposé le »
 * (PARCEL_SENT event date) and « Numéro de suivi » with a copy button
 * (`expo-clipboard`, confirmation « Copié » for ~2s).
 *
 * Also keeps the carrier's latest tracking status, a link to its tracking page, and the
 * leg's earlier events behind a toggle (Livraison Boxtal, spec §9.2) - a working flow this
 * card absorbs from the pre-rebuild timeline rather than dropping.
 */
export function CommandeDeliveryCard({ data }: Props) {
  const { palette, spacing, accent } = useTheme();
  const [historyOpen, setHistoryOpen] = useState(false);

  const isParcel = data.delivery === 'PARCEL';
  const myLeg: ShipmentLeg = data.viewerRole === 'CLIENT' ? 'OUTBOUND' : 'RETURN';
  const trackingNumber = myLeg === 'OUTBOUND' ? data.outboundTrackingNumber : data.returnTrackingNumber;
  const parcelSentEvent = data.stepEvents.filter((e) => e.step === 'PARCEL_SENT').slice(-1)[0] ?? null;
  const ship = data.shipments.find((s) => s.leg === myLeg);

  const rowStyle = { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: spacing.sm };
  const labelStyle = { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, color: palette.muted } as const;
  const valueStyle = { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13, color: palette.ink } as const;

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink, marginBottom: spacing.md }}>
        Livraison
      </Text>

      <View style={rowStyle}>
        <Text style={labelStyle}>Mode de livraison</Text>
        <Text style={valueStyle}>{deliveryModeLabel(data)}</Text>
      </View>

      {/* V7 A9: both legs with carrier and price, for both parties (Q4, Q5); nothing without a quote (Q6). */}
      {deliveryCardLegRows(data.shippingLegs ?? null).map((row) => (
        <View key={row.label} style={rowStyle}>
          <Text style={labelStyle}>{row.label}</Text>
          <Text style={valueStyle}>{row.value}</Text>
        </View>
      ))}

      {isParcel && parcelSentEvent && (
        <View style={rowStyle}>
          <Text style={labelStyle}>Colis déposé le</Text>
          <Text style={valueStyle}>{formatEventDate(parcelSentEvent.at)}</Text>
        </View>
      )}

      {isParcel && trackingNumber && (
        <View style={rowStyle}>
          <Text style={labelStyle}>Numéro de suivi</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={valueStyle}>{trackingNumber}</Text>
            <CopyButton value={trackingNumber} />
          </View>
        </View>
      )}

      {isParcel && ship && ship.events.length > 0 && (
        <View style={{ marginTop: spacing.xs }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, color: palette.ink }}>
            {ship.events[0]!.label}
          </Text>
          {ship.trackingUrl && (
            <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(ship.trackingUrl!)}>
              <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12, color: accent.accent, marginTop: 2 }}>
                Suivre le colis
              </Text>
            </Pressable>
          )}
          {ship.events.length > 1 && (
            <Pressable accessibilityRole="button" onPress={() => setHistoryOpen((v) => !v)}>
              <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 11.5, color: palette.muted, marginTop: 4 }}>
                {historyOpen ? 'Masquer l’historique' : `Voir l’historique (${ship.events.length - 1})`}
              </Text>
            </Pressable>
          )}
          {historyOpen &&
            ship.events.slice(1).map((e) => (
              <Text
                key={`${e.status}-${e.occurredAt}`}
                style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 11.5, color: palette.muted, marginTop: 2 }}
              >
                {e.label} · {formatEventDate(e.occurredAt)}
              </Text>
            ))}
        </View>
      )}
    </Card>
  );
}
