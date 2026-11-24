import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  euros,
  PROTECTION_FIXED_CENTS,
  protectionRateLabel,
  VALIDATION_WINDOW_DAYS,
  VERIFIED_BADGE_LABEL,
} from '@revime/shared';
import { useTheme } from '../theme';
import { Button } from './Button';
import { SettingsSection } from './SettingsRow';
import { IconIdCard, IconMailAt, IconPadlock, IconShieldCheck, IconStoreVerified } from '../icons';
import { SUPPORT_EMAIL } from '../lib/support';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  /**
   * The Protection Revime amount for THIS repair, in cents - `computeAmounts(...).protectionCents`
   * from the screen that already prints it on the summary row. Required, so the band can never
   * show a different figure from the row that opened it.
   */
  protectionCents: number;
};

const NBSP = ' ';

/**
 * `CF-45`. The sheet behind « Protection Revime » on the payment screen, redesigned from a heading
 * and four paragraphs into the « cartes/rubriques avec des icônes » the client asked for:
 * « premium, rassurant, une présentation plus visuelle ».
 *
 * Shape, top to bottom: a navy band carrying the shield, the name, the two-part formula and the
 * amount for this repair; then ONE grouped container of four rows, each a 40pt tinted disc, a
 * title and a one-to-three-line body; then « Fermer ». The band was ink until `CF6-06`, when the
 * client asked for the black on the payment screens to become blue, and is now `palette.navy`
 * (Bleu Ink) like `EscrowSecurityCard`. It still reuses the trust idiom the app already has -
 * `TrustStrip`'s Rouge Punch shield on a dark band (`TrustStrip` itself stays ink) - so a client who tapped
 * « Réparateurs vérifiés » on Accueil meets the same object here. The container is
 * `SettingsSection`, the grouped-list primitive every Paramètres screen uses, so the rows read as
 * one set rather than four identical shadowed cards.
 *
 * 🛑 A 2×2 GRID WAS MEASURED AND REJECTED, not skipped. Two tiles across a 335pt sheet leave
 * ~133pt of text per tile; the payment body alone is 633.8pt at 13pt and would run to five lines
 * inside a tile, which is the « gros bloc de texte » the client wrote in to get rid of. The
 * requirement is icon-led cards; the arrangement is full-width rows. `apps/mobile/AGENTS.md`:
 * separate what a design requires from how it arranges.
 *
 * 🛑 THE COPY IS NOT THE PROTOTYPE'S FOUR POINTS, AND THE CHANGES ARE HONESTY, NOT TASTE.
 * `AGENTS.md`'s rule: before shipping a line, ask what would have to be true for it to be honest.
 *   - « libéré uniquement après validation de la réparation » was false: `cron.service.ts`
 *     releases escrow itself `VALIDATION_WINDOW_DAYS` after the réparateur's request when the
 *     client has not answered. The body now says so, with the number read from the constant the
 *     job uses, so the sentence and the job cannot disagree.
 *   - « Nous vérifions l'identité de tous les réparateurs » was false: `IDENTITY_GATE_ENABLED` is
 *     off in production, so an unverified réparateur can offer today. The body names the badge a
 *     client actually sees on an offer (`VERIFIED_BADGE_LABEL.IDENTITY`, « Réparateur vérifié »)
 *     and says what it certifies - true in every flag state, and it teaches what to look for.
 *   - « Pour les pros, nous vérifions le numéro SIRET » - same shape; « Professionnel vérifié »
 *     (`VERIFIED_BADGE_LABEL.BUSINESS`) is the badge a SIRET check earns, so the card names it.
 *   - « Support client - Notre équipe vous accompagne à chaque étape » was a promise with no
 *     channel behind it (`CF-D3`). The card is now « Support Revime », the client's own title, and
 *     its body names the ONE channel there will be: an e-mail address, read from
 *     `src/lib/support.ts`. ✅ Real since 2026-09-04: « support@revime.fr », chosen by the client (message 12);
 *     that file's header records his three revime.fr addresses and the one that must never be shown.
 *
 * 🛑 COLOUR: THE SHIELD AND THE DISCS USE `palette.red` / `palette.redSoft` EXPLICITLY, NOT
 * `accent.*`. Same rule and same reason as CF-10's `IdentityGateSheet` (V8 E1: `OfferGateSheet`): a trust mark is not a mode accent.
 * This sheet opens from the client's payment screen, so today `accent` would resolve to red
 * anyway - but the day this component is reused on a réparateur surface, `accentSoft` becomes
 * `navySoft` and the discs vanish into the paper. No new colour is introduced: `TrustStrip` already
 * puts `palette.red` on a dark band (ink there, navy here), and CF-10's `IdentityGateSheet` (V8 E1: `OfferGateSheet`) already puts `palette.red` on
 * `palette.redSoft`.
 *
 * Accessibility follows CF-10's `IdentityGateSheet` (V8 E1: `OfferGateSheet`): `accessibilityViewIsModal` confines VoiceOver to the
 * sheet; the scrim and the sheet `Pressable`s are `accessible={false}` so the controls inside stay
 * focusable; the accessible exit is « Fermer », plus Android's back gesture via `onRequestClose`.
 * The sheet's bottom padding adds the safe-area inset, which the previous inline `Modal` did not,
 * so « Fermer » no longer sits under the home indicator on notched phones.
 *
 * ---
 *
 * MEASURED, not eyeballed - PIL against the shipped Google Sans Flex TTFs, on a 375pt iPhone SE,
 * the narrowest device supported. `typecheck` cannot see text overflow and it is this workspace's
 * only gate, so the numbers live here. Every width below is read out of THIS file's styles.
 *
 *   sheet inner width           375 − 2×20 (styles.sheet padding)                        = 335.0
 *   band text column            335 − 2×16 (band padding) − 22 (shield) − 12 (gap)       = 269.0
 *   row text column             335 − 2×1 (SettingsSection border) − 2×16 − 40 − 12      = 249.0
 *
 *   « Protection Revime » 17/700  154.5  +  gap 12  +  « 999,99 € » 17/700  69.5   = 236.0 in 269.0
 *   band formula 12.5/400  « 2,90 € + 4,5 % du montant de la réparation »       237.0 in 269.0  1 line
 *
 *   row titles 14/600, all one line in 249.0:
 *     « Paiement sécurisé » 122.8   « Vérification d'identité » 146.2
 *     « Vérification SIRET » 118.8  « Support Revime » 106.8
 *
 *   row bodies 13/400, greedy-wrapped in 249.0 (these are paragraphs; never numberOfLines):
 *     paiement   633.8  →  3 lines (222.2 / 243.8 / 161.8)
 *     identité   408.0  →  2 lines (227.0 / 178.0)
 *     SIRET      398.2  →  2 lines (241.5 / 153.8)
 *     support    291.8  →  2 lines (174.4 / 114.4) with « support@revime.fr », the real address
 *                (re-measured 2026-09-04 with scaled PIL, which reproduced this table's 174.2 / 118.8 /
 *                296.0 to within 0.4; « @ » advances 11.5, not the 7.4 `.notdef`, so it is a real glyph);
 *                296.0  →  2 lines (174.2 / 118.8) with the placeholder it replaced;
 *                340.2  →  2 lines (174.2 / 163.0) with a 25-character address as the guard
 *
 *   « Fermer » 15/600  53.0 in 293.0 (secondary Button: 335 − 40 padding − 2 border)
 *
 * The amount guard is « 999,99 € »: 4,5 % of a 22 000 € repair. Anything wider is not a repair
 * this marketplace will see; if it ever is, the amount wraps under the title rather than clipping,
 * because it is `flexShrink: 0` beside a `flex: 1` title.
 *
 * Glyph presence checked the way slice 18 taught: « € », « « », « » » and both no-break spaces
 * return real advances; the « ⓘ » the trigger row used to carry returns the `.notdef` advance and
 * was replaced by `IconInfo` on the payment screen.
 */
export function ProtectionSheet({ visible, onDismiss, protectionCents }: Props) {
  const { palette, radii, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const cards = [
    {
      key: 'paiement',
      Icon: IconPadlock,
      title: 'Paiement sécurisé',
      body: `Votre argent est bloqué, puis versé au réparateur après votre validation ou, sans réponse, au bout de ${VALIDATION_WINDOW_DAYS} jours.`,
    },
    {
      key: 'identite',
      Icon: IconIdCard,
      title: "Vérification d'identité",
      body: `Le badge «${NBSP}${VERIFIED_BADGE_LABEL.IDENTITY}${NBSP}» signale une pièce d'identité contrôlée.`,
    },
    {
      key: 'siret',
      Icon: IconStoreVerified,
      title: 'Vérification SIRET',
      body: `Le badge «${NBSP}${VERIFIED_BADGE_LABEL.BUSINESS}${NBSP}» signale un numéro SIRET contrôlé.`,
    },
    {
      key: 'support',
      Icon: IconMailAt,
      title: 'Support Revime',
      // French puts a no-break space before « ? » - it must not be where the line breaks.
      body: `Une question${NBSP}? Écrivez-nous à ${SUPPORT_EMAIL}.`,
    },
  ] as const;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      {/* Tapping the scrim dismisses. The sheet below claims the touch responder first, so a tap
          on it never reaches this handler - CF-10's `IdentityGateSheet` (V8 E1: `OfferGateSheet`) records why an empty `onPress` on
          the inner Pressable is what makes that true. */}
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
              paddingBottom: 20 + insets.bottom,
            },
          ]}
          onPress={() => {}}
          accessible={false}
        >
          {/* The band: the one bold element on the sheet. Everything below it is quiet. */}
          <View style={[styles.band, { backgroundColor: palette.navy, borderRadius: radii.card }]}>
            <IconShieldCheck size={22} color={palette.red} strokeWidth={2.3} />
            <View style={{ flex: 1 }}>
              <View style={styles.bandHead}>
                <Text style={styles.bandTitle}>Protection Revime</Text>
                <Text style={styles.bandAmount}>{euros(protectionCents)}</Text>
              </View>
            </View>
          </View>

          <SettingsSection title={null} style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
            {cards.map(({ key, Icon, title, body }, index) => (
              <View
                key={key}
                style={[
                  styles.row,
                  index < cards.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.line },
                ]}
              >
                <View style={[styles.disc, { backgroundColor: palette.redSoft }]}>
                  <Icon size={20} color={palette.red} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: palette.ink }]}>{title}</Text>
                  <Text style={[styles.rowBody, { color: palette.muted }]}>{body}</Text>
                </View>
              </View>
            ))}
          </SettingsSection>

          <Button label="Fermer" onPress={onDismiss} variant="secondary" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { padding: 20 },
  band: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  bandHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  bandTitle: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 17, color: '#ffffff', flex: 1 },
  bandAmount: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 17, color: '#ffffff', flexShrink: 0 },
  bandFormula: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 3,
    color: 'rgba(255,255,255,0.7)',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14 },
  rowBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, lineHeight: 18, marginTop: 2 },
});
