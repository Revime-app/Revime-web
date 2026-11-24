import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { euros, type CommandeDto } from '@revime/shared';
import { useTheme } from '../../theme';
import { Card } from '../Card';
import { IconInfo } from '../../icons';
import { deliveryRows } from '../../lib/shipping-legs-view';

const PROTECTION_INFO_TEXT =
  'Frais de service REVIME : paiement sécurisé, suivi et médiation en cas de litige.';

type Props = {
  data: CommandeDto;
};

/**
 * Spec §4.4 item 6 - « Réparation », « Protection REVIME » (info icon; tap shows a short
 * explanation inline), « Livraison », « Assurance » when > 0, bold « Total payé par le
 * client »; réparateur also « Vous recevez » (`payoutCents`).
 *
 * CF4-D task 8 (spec §6). `refund` is a NEW DTO field, normalised at entry (`?? null`) per
 * `apps/mobile/AGENTS.md`'s DTO rule - an older API answers with the field simply absent,
 * and `undefined` must collapse to the same `null` a never-refunded row already reads as.
 *
 * V7 A7: only the party who received the money reads « Remboursé ». The client keeps every
 * refund line. The repairer reads the part of the repair kept from him as « Montant non versé —
 * remboursé au client » and nothing about protection, shipping or the refund total, which were
 * never his. The client of an order REVIME released to the repairer at the end of a dispute
 * reads « Versé au réparateur après décision REVIME ». Both sentences are the client's own
 * (`DEC7-05`); the amount follows them as it follows « Remboursé : ».
 *
 * V7 `ISS7-018`: the API sends the STORED dispute status, so a dispute released by REVIME stays
 * `RESOLVED_RELEASED` even if the order is refunded afterwards (only the admin surfaces apply
 * `effectiveDisputeStatus`). The release line is therefore also keyed on the order not being
 * REFUNDED; otherwise the client would read « Versé au réparateur » beside « Remboursé ».
 */
export function CommandePaymentCard({ data }: Props) {
  const { palette, spacing } = useTheme();
  const [infoOpen, setInfoOpen] = useState(false);
  const refund = data.refund ?? null;
  const isRepairer = data.viewerRole === 'REPAIRER';
  const clientRefund = isRepairer ? null : refund;
  const releasedByRevime =
    !isRepairer && data.status !== 'REFUNDED' && (data.dispute ?? null)?.status === 'RESOLVED_RELEASED';

  const rowStyle = { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginBottom: spacing.sm };
  const labelStyle = { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, color: palette.muted } as const;
  const valueStyle = { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13, color: palette.ink } as const;
  // The refund lines mirror the rows above them in shape, but in the green tone reserved for
  // money coming back to the client rather than money charged.
  const refundLabelStyle = { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, color: palette.greenDeep } as const;
  const shippingAndInsuranceRefundCents = clientRefund ? clientRefund.shippingCents : 0;

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink, marginBottom: spacing.md }}>
        Détails du paiement
      </Text>

      <View style={rowStyle}>
        <Text style={labelStyle}>Réparation</Text>
        <Text style={valueStyle}>{euros(data.repairCents)}</Text>
      </View>

      {refund !== null && refund.repairCents > 0 && (
        <View style={rowStyle}>
          {isRepairer ? (
            <Text style={labelStyle}>Montant non versé — remboursé au client : {euros(refund.repairCents)}</Text>
          ) : (
            <Text style={refundLabelStyle}>Remboursé : {euros(refund.repairCents)}</Text>
          )}
        </View>
      )}

      {releasedByRevime && (
        <View style={rowStyle}>
          <Text style={labelStyle}>Versé au réparateur après décision REVIME : {euros(data.payoutCents)}</Text>
        </View>
      )}

      <View style={rowStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={labelStyle}>Protection REVIME</Text>
          <Pressable
            onPress={() => setInfoOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="En savoir plus sur la protection REVIME"
          >
            <IconInfo size={15} color={palette.muted} strokeWidth={1.8} />
          </Pressable>
        </View>
        <Text style={valueStyle}>{euros(data.protectionCents)}</Text>
      </View>

      {clientRefund !== null && clientRefund.protectionCents > 0 && (
        <View style={rowStyle}>
          <Text style={refundLabelStyle}>Remboursé : {euros(clientRefund.protectionCents)}</Text>
        </View>
      )}

      {infoOpen && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 12,
            lineHeight: 17,
            color: palette.muted,
            marginTop: -spacing.xs,
            marginBottom: spacing.sm,
          }}
        >
          {PROTECTION_INFO_TEXT}
        </Text>
      )}

      {/* V7 A9: one row per leg with its carrier when the order has a quote, else « Livraison » (Q6). */}
      {deliveryRows(data.shippingCents, data.shippingLegs ?? null, 'Livraison').map((row) => (
        <View key={row.label} style={rowStyle}>
          <Text style={labelStyle}>{row.label}</Text>
          <Text style={valueStyle}>{row.value}</Text>
        </View>
      ))}

      {data.insuranceCents > 0 && (
        <View style={rowStyle}>
          <Text style={labelStyle}>Assurance</Text>
          <Text style={valueStyle}>{euros(data.insuranceCents)}</Text>
        </View>
      )}

      {shippingAndInsuranceRefundCents > 0 && (
        <View style={rowStyle}>
          <Text style={refundLabelStyle}>Livraison et assurance remboursées : {euros(shippingAndInsuranceRefundCents)}</Text>
        </View>
      )}

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: palette.line,
          marginTop: spacing.xs,
          paddingTop: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14, color: palette.ink }}>
            Total payé par le client
          </Text>
          <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14, color: palette.ink }}>
            {euros(data.totalCents)}
          </Text>
        </View>

        {clientRefund !== null && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }}>
            <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14, color: palette.greenDeep }}>
              Total remboursé
            </Text>
            <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14, color: palette.greenDeep }}>
              {euros(clientRefund.totalCents)}
            </Text>
          </View>
        )}

        {isRepairer && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }}>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13, color: palette.muted }}>
              Vous recevez
            </Text>
            <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 13, color: palette.greenDeep }}>
              {euros(data.payoutCents)}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}
