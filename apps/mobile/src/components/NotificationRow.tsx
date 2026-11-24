import { View, Text, Pressable, StyleSheet } from 'react-native';
import { notificationCopy, timeAgoLabel, type NotificationDto } from '@revime/shared';
import { useTheme } from '../theme';
import { IconPackage, IconMessage, IconWrench, IconCreditCard, IconCancel, IconPadlock, IconShieldCheck, IconMailSend } from '../icons';

/**
 * One row of the notification centre, measured off the prototype's `.notif-row`
 * (`repareme-web/src/styles.css:1360-1378`) rather than eyeballed from a screenshot:
 * 14pt padding, 12pt gap, a 1px `--line` border at `--r-card`, and a 38pt icon tile at
 * radius 11 on `--accent-soft`.
 *
 * The tile comes out RED in client mode and NAVY in réparateur mode with no conditional
 * code here, which is the two approved screenshots: `accents.client.accentSoft` is
 * `redSoft` and `accents.pro.accentSoft` is `navySoft`, and ThemeProvider's mode already
 * follows `activeMode`.
 *
 * 🛑 `.notif-row` has a real BORDER and NO shadow, so the `overflow: 'hidden'`
 * shadow-clipping trap recorded in AGENTS.md does not apply to this component. Do not
 * "fix" it by adding a shadow: the prototype's `.card--float` needs that treatment
 * because its only edge IS the shadow, and this row's edge is the border.
 */

/**
 * TOTAL over the type union, so `tsc` refuses an unmapped type - and that is the only gate this
 * workspace has. It earned its keep on 2026-08-30: `CF-43` added `PAYMENT_ABANDONED` in
 * `packages/shared` while believing the slice touched no mobile file, and this map produced
 * `TS2741` immediately. Keep it total; a `Partial` here would have shipped that silently.
 */
const ICON_FOR: Record<NotificationDto['type'], typeof IconPackage> = {
  OFFER_RECEIVED: IconPackage,
  OFFER_ACCEPTED: IconPackage,
  OFFER_DECLINED: IconPackage,
  MESSAGE_RECEIVED: IconMessage,
  COMMANDE_STEP: IconWrench,
  FUNDS_RELEASED: IconCreditCard,
  // Both money outcomes, so both carry the card. `PAYMENT_ABANDONED` is a payment that never
  // completed rather than one that was refused - see the copy branch in `packages/shared`.
  COMMANDE_REFUNDED: IconCreditCard,
  PAYMENT_ABANDONED: IconCreditCard,
  // A demande event, so the same package mark the offer rows carry.
  DEMANDE_UPDATED: IconPackage,
  // Removal, not money and not a message.
  DEMANDE_WITHDRAWN: IconCancel,
  // Removal, like DEMANDE_WITHDRAWN. Not money and not a message.
  DEMANDE_MODERATED: IconCancel,
  // Livraison Boxtal: parcel events wear the package mark; an incident wears the cancel mark.
  PARCEL_LABEL_READY: IconPackage,
  PARCEL_SHIPPED: IconPackage,
  PARCEL_OUT_FOR_DELIVERY: IconPackage,
  PARCEL_AT_PICKUP_POINT: IconPackage,
  PARCEL_DELIVERED: IconPackage,
  PARCEL_INCIDENT: IconCancel,
  // CF4-E. Dispute events: the same padlock mark DisputeBanner uses for a dispute in progress.
  DISPUTE_OPENED: IconPadlock,
  DISPUTE_DISMISSED: IconPadlock,
  // CF4-E. Identity/KYC events: the shield mark, matching CF-10's IdentityGateSheet (V8 E1: OfferGateSheet)'s verification theme.
  IDENTITY_VERIFIED: IconShieldCheck,
  IDENTITY_DOCUMENTS_REQUIRED: IconShieldCheck,
  // CF4-D task 8. A partial refund is still a money outcome; same mark as the other two.
  COMMANDE_PARTIALLY_REFUNDED: IconCreditCard,
  // CF4-E. A revoked verification is a removal, like DEMANDE_WITHDRAWN/DEMANDE_MODERATED above.
  VERIFICATION_REVOKED: IconCancel,
  // CF4-25. A request arriving wears the send mark; the three closing outcomes are removals.
  QUOTE_REQUESTED: IconMailSend,
  QUOTE_DECLINED: IconCancel,
  QUOTE_REFUSED: IconCancel,
  QUOTE_EXPIRED: IconCancel,
  // CF4-27. All three are cancellation-lifecycle removals: a request arriving is itself the
  // client backing out of the order, and withdrawn/refused both undo or close that same act -
  // none of them is a message or a money outcome, so the cancel mark fits every one.
  CANCELLATION_REQUESTED: IconCancel,
  CANCELLATION_WITHDRAWN: IconCancel,
  CANCELLATION_REFUSED: IconCancel,
  // CF4-J §4.4. A confidential dispute space message from REVIME.
  DISPUTE_MESSAGE: IconPadlock,
  // CF5-07. Professional business verification outcomes.
  BUSINESS_VERIFIED: IconShieldCheck,
  BUSINESS_REFUSED: IconCancel,
  BUSINESS_DOCUMENTS_REQUIRED: IconShieldCheck,
  // CMP-D3. DAC7 fiscal declaration reminder.
  FISCAL_DECLARATION_REQUIRED: IconShieldCheck,
  // CMP-D4. DAC7 annual recap sent.
  DAC7_ANNUAL_RECAP_SENT: IconShieldCheck,
  // V8 B2. A payout waiting for the réparateur: a money outcome, like the refunds above.
  PAYOUT_WAITING: IconCreditCard,
  // V8 E1. « Terminez votre configuration »: the setup journey's own shield, like IDENTITY_VERIFIED.
  SETUP_REMINDER: IconShieldCheck,
};

export function NotificationRow({
  notification,
  /**
   * Passed in, never `new Date()` here. Two rows in one frame would otherwise format
   * against two different instants and could read « il y a 1 min » beside « à l'instant »
   * for the same timestamp - the reasoning `RepairerHome` already records.
   */
  now,
  onPress,
}: {
  notification: NotificationDto;
  now: Date;
  onPress: () => void;
}) {
  const { palette, accent, radii } = useTheme();
  const { title, sub } = notificationCopy(notification);
  // FIX 3: Fall back to IconPackage for an unknown type (API-newer-than-app drift)
  // rather than rendering undefined as a component, which would throw.
  const Icon = ICON_FOR[notification.type] ?? IconPackage;
  // Null for an unparseable date, so the row renders no time rather than « null ».
  const time = timeAgoLabel(notification.createdAt, now);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={[
        styles.row,
        { backgroundColor: palette.paper, borderColor: palette.line, borderRadius: radii.card },
      ]}
    >
      <View
        style={[styles.tile, { backgroundColor: accent.accentSoft }]}
      >
        <Icon size={18} color={accent.accent} strokeWidth={2.1} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>
            {title}
          </Text>
          {time !== null && (
            <Text style={[styles.time, { color: palette.muted }]}>{time}</Text>
          )}
        </View>
        <Text style={[styles.sub, { color: palette.muted }]} numberOfLines={2}>
          {sub}
        </Text>
      </View>

      {/* `palette.red` in BOTH modes, deliberately not `accent.accent`: the prototype's
          own pro screenshot shows red dots on navy tiles, « unread » is not a brand
          accent, and a navy dot on a navy-soft tile would be nearly invisible. */}
      {!notification.read && <View style={[styles.dot, { backgroundColor: palette.red }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderWidth: 1 },
  tile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // minWidth: 0 is what lets numberOfLines actually truncate inside a flex row.
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14, flex: 1 },
  time: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 11.5, flexGrow: 0, flexShrink: 0 },
  sub: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
