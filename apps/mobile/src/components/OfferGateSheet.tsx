import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { businessStepRefusal, type OfferBlock } from '@revime/shared';
import { useTheme } from '../theme';
import { Button } from './Button';
import { IconBriefcase, IconClock, IconMailSend, IconShieldCheck } from '../icons';

type Props = {
  visible: boolean;
  /** Why the server would refuse the offer (`useOfferBlock`). The sheet is only opened for a non-null block. */
  block: OfferBlock;
  onDismiss: () => void;
  /** Starts the identity session (the request page's `useIdentityStart`). */
  onVerifyIdentity: () => void;
  /**
   * REQUIRED, and a billing guard as much as a spinner (CF-10, 2026-09-01): without `loading` on the button, a
   * double tap created two Stripe Identity sessions, each billed in live mode. Required, not `?`, so a new call site
   * cannot compile without deciding it (`AGENTS.md`, « a required prop is the cheapest real gate »).
   */
  verifying: boolean;
  /** REQUIRED, `null` when absent, so a French refusal the server authored cannot be silently swallowed. */
  error: string | null;
};

type Content = {
  title: string;
  body: string;
  /** The unticked step row (mockup 3 « Vérification d'identité · 2 min »), or null. */
  row: string | null;
  action: { label: string; run: 'identity' | 'business' | 'basic' } | null;
};

/**
 * V8 E1, `DEC8-08` (6). The copy per refusal. IDENTITY is mockup 3 verbatim; the waiting cases reuse the journey's
 * own « documents transmis » sentence and the server's `businessStepRefusal`; the BUSINESS body and the BASIC title
 * are plan copy (listed for the owner in V8 §4 E1); the BASIC body is the one `offre.tsx` already shows.
 */
export function offerSheetContent(block: OfferBlock): Content {
  switch (block) {
    case 'IDENTITY':
      return {
        title: 'Vérifiez votre identité pour envoyer votre offre',
        body: "Pour la sécurité de tous, chaque réparateur doit vérifier son identité avant de proposer une réparation. Ça ne se fait qu'une fois.",
        row: "Vérification d'identité · 2 min",
        action: { label: 'Vérifier mon identité', run: 'identity' },
      };
    case 'IDENTITY_PENDING':
      return {
        title: 'Vérification en cours',
        body: 'Vos documents ont bien été transmis. Vous pourrez envoyer des offres dès que votre vérification sera validée.',
        row: null,
        action: null,
      };
    case 'BUSINESS':
      return {
        title: 'Vérifiez votre entreprise pour envoyer votre offre',
        body: "Pour envoyer une offre en tant que professionnel, votre entreprise doit être vérifiée. Ça ne se fait qu'une fois.",
        row: 'Informations professionnelles · 3 min',
        action: { label: 'Vérifier mon entreprise', run: 'business' },
      };
    case 'BUSINESS_REDO':
      return {
        title: 'Vérifiez votre entreprise pour envoyer votre offre',
        body: businessStepRefusal('REJECTED') ?? '',
        row: 'Informations professionnelles · 3 min',
        action: { label: 'Vérifier mon entreprise', run: 'business' },
      };
    case 'BUSINESS_PENDING':
      return { title: 'Vérification en cours', body: businessStepRefusal('PENDING') ?? '', row: null, action: null };
    case 'BASIC':
      return {
        title: 'Confirmez votre compte pour envoyer votre offre',
        body: "Pour envoyer une offre, confirmez votre adresse e-mail ou votre numéro de mobile. Cela prend moins d'une minute.",
        row: null,
        action: { label: 'Confirmer mon compte', run: 'basic' },
      };
  }
}

/**
 * CF-10, reshaped by V8 E1 into mockup 3: the bottom sheet a repairer meets when he taps « Faire une offre » and
 * the server would refuse it. It opens BEFORE the form, so he never fills in an offer only to collect a 403
 * (`verification/gate.ts`), and its button leads straight to the step that unlocks the offer.
 *
 * A `Modal` with a tinted scrim rather than a real blur: `expo-blur` is a native module and would break the
 * installed client on the next reload (same choice as `BlockingOverlay`).
 *
 * COLOUR: repairer mode is navy, so the badge is a navy disc with a white glyph (`accent.accent`). Not
 * `accent.accentSoft`: on white paper `navySoft` all but disappears, the defect CF-10 recorded. The error line
 * stays `palette.redDeep`: an error is a status colour and must read as one in both modes.
 *
 * Measured (PIL, shipped TTFs), 375 pt screen, sheet padding 24 pt (`spacing.xl`) = 327 pt inside: the longest
 * titles, « Confirmez votre compte pour envoyer votre offre » 463.5 pt and « Vérifiez votre entreprise … » 463.2 pt
 * at 19/700, wrap to two lines (« Vérification en cours » is 194.0 pt, one), so titles take no numberOfLines;
 * bodies are paragraphs.
 */
export function OfferGateSheet({ visible, block, onDismiss, onVerifyIdentity, verifying, error }: Props) {
  const { palette, accent, spacing, radii } = useTheme();
  const router = useRouter();
  const content = offerSheetContent(block);
  const Glyph = block === 'BASIC' ? IconMailSend : block.startsWith('BUSINESS') ? IconBriefcase : IconShieldCheck;

  const run = () => {
    if (!content.action) return;
    if (content.action.run === 'identity') return onVerifyIdentity();
    onDismiss();
    router.push(content.action.run === 'business' ? '/entreprise' : '/verification');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      // Confines iOS VoiceOver to this sheet, so the request underneath is not swipeable behind it (CF-10).
      accessibilityViewIsModal
    >
      {/* Tapping the scrim dismisses, like « Plus tard ». `accessible={false}` on the scrim AND the sheet: an
          accessible Pressable collapses its subtree into one element on iOS, which made every button in the
          sheet unreachable to VoiceOver (CF-10, 2026-09-01). The accessible way out is « Plus tard ». */}
      <Pressable style={[styles.scrim, { backgroundColor: `${palette.ink}8C` }]} onPress={onDismiss} accessible={false}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: palette.paper,
              borderTopLeftRadius: radii.card,
              borderTopRightRadius: radii.card,
              padding: spacing.xl,
            },
          ]}
          // Claims the touch responder so a tap on the sheet never reaches the scrim's dismiss.
          onPress={() => {}}
          accessible={false}
        >
          <View style={[styles.badge, { backgroundColor: accent.accent, marginBottom: spacing.md }]}>
            <Glyph size={24} color={palette.paper} strokeWidth={2} />
          </View>
          <Text style={[styles.title, { color: palette.ink }]}>{content.title}</Text>
          <Text style={[styles.body, { color: palette.muted, marginTop: spacing.sm }]}>{content.body}</Text>

          {content.row !== null && (
            <View style={[styles.row, { borderColor: palette.line, marginTop: spacing.lg }]}>
              <View style={[styles.untick, { borderColor: palette.faint }]} />
              <Text style={[styles.rowText, { color: palette.ink }]}>{content.row}</Text>
              <IconClock size={14} color={palette.muted} strokeWidth={2.2} />
            </View>
          )}

          {error !== null && (
            <Text style={[styles.error, { color: palette.redDeep, marginTop: spacing.sm }]}>{error}</Text>
          )}

          {content.action !== null && (
            <View style={{ marginTop: spacing.lg }}>
              <Button
                label={content.action.label}
                onPress={run}
                loading={content.action.run === 'identity' ? verifying : false}
              />
            </View>
          )}
          <View style={{ marginTop: content.action !== null ? spacing.xs : spacing.lg }}>
            <Button label="Plus tard" variant="text" onPress={onDismiss} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%' },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 19, lineHeight: 25 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  untick: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5 },
  rowText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14, flex: 1 },
  error: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13, lineHeight: 18 },
});
