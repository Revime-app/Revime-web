import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IconBack } from '../icons';

type Props = {
  title: string;
  /**
   * The prototype's `.topbar__sub`, a second line under the title - as on
   * `TableauDeBord.tsx:19` (« Tableau de bord » over « Votre activité »).
   *
   * Optional, so every existing caller renders byte-identically. It labels the screen and
   * must not carry a claim about the user or his data: this line is fixed copy, and a fixed
   * line cannot be true conditionally. Put anything derived in the body.
   */
  subtitle?: string;
  onBack?: () => void;
  /**
   * `CF-19` / `CF-27`. A trailing control, today the favourite heart on the demande detail.
   *
   * OPTIONAL, so all 16 existing call sites across 15 files render byte-identically - the same
   * reasoning `subtitle` above documents. This is the deliberate exception to `CF-23`'s
   * make-the-prop-required rule: required-ness is right when a component gains data some rows
   * have and others do not, and wrong for an opt-in that must not restyle existing screens.
   *
   * A `ReactNode` slot rather than a `heart?: boolean`, because `CF-53` puts a share icon here
   * next and two booleans would not compose.
   *
   * ✅ **`CF-53` LANDED 2026-09-02 and the prediction held** - the demande detail now passes a
   * two-icon row through this one prop, with no change to the prop's type. The slot's `minWidth`
   * did have to change; see `styles.rightSlot` for what that shifts and where.
   */
  right?: ReactNode;
};

export function ScreenHeader({ title, subtitle, onBack, right }: Props) {
  const { palette, spacing, type } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.paper,
          borderBottomWidth: 1,
          borderBottomColor: palette.line,
          paddingHorizontal: spacing.lg,
        },
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={styles.backButton}
        >
          <IconBack size={22} color={palette.ink} strokeWidth={2} />
        </Pressable>
      ) : (
        <View style={styles.backButton} />
      )}
      {/*
       * `flex: 1` moved from the title Text onto this wrapper when the subtitle arrived: the
       * two lines have to share one flex child, or the subtitle sits BESIDE the title in the
       * row rather than under it.
       *
       * Fonts are `GoogleSansFlex_*`, not the `Poppins_*` this change was written against.
       * The charte (`1b96714`) dropped Poppins before this commit was recovered onto `main`,
       * and `AGENTS.md` says to rename in the merge rather than after - an unknown
       * `fontFamily` does not throw, it silently falls back to the system font.
       */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_700Bold',
            fontSize: 19,
            color: palette.ink,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_500Medium',
              fontSize: 12,
              color: palette.muted,
              textAlign: 'center',
              marginTop: 1,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {right ? (
        <View style={styles.rightSlot}>{right}</View>
      ) : (
        <View style={styles.rightSlot} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * `minWidth`, NOT `width` - changed by `CF-53` on 2026-09-02, when this slot went from holding
   * one control to holding two.
   *
   * 🛑 A `width: 40` box stays 40pt however wide its child is, and two 24pt icons with a 16pt gap
   * is **64pt**. Sizing the slot to its content puts the trailing glyph's ink at **18.0pt** from the
   * screen edge, against the **21.5pt** mockup `02` draws - computed from the glyph path data plus
   * half the rendered 2pt stroke, not eyeballed.
   *
   * ⚠️ **What a fixed width does to an oversized child is NOT established here, and the first draft
   * of this comment asserted it wrongly.** It claimed the child overflows because `flexShrink`
   * defaults to 0 - but `flexShrink` governs the **main axis**, and with no `flexDirection` this is a
   * **column** container, so width is a **cross-axis** question it does not touch. The cross axis is
   * driven by `alignItems: 'center'`, which sizes the child to its content rather than stretching it.
   * Whether Yoga then lets it overhang or clamps and squeezes it is unobserved - **there is no device
   * and no test harness here.** It does not matter for this change: at 40pt the two-icon row cannot
   * sit where the mockup draws it under ANY of those behaviours, so `minWidth` is right regardless.
   * The demande detail's « Modifier » (**55.0pt** at 14/500, measured) is in that same unresolved
   * position and has been since `CF-16`; settle it on the next build rather than asserting it.
   *
   * What this changes elsewhere, stated rather than left to be discovered - only **two** of the 25
   * `ScreenHeader` call sites pass `right` at all:
   *
   * - `reparateur/[userId].tsx` - a single 24pt `FavoriteHeart`. 40pt either way, **unchanged**.
   * - `demande/[id]/index.tsx` - the heart case is 40pt either way; the AUTHOR's « Modifier » now
   *   gets a **55pt** slot instead of a 40pt one, so its title shifts ~7.5pt. **This is a real change
   *   to a shipped view** - whether it also FIXES something depends on the unresolved question above,
   *   so call it a change and not a fix until someone sees it on a device.
   * - The other 23 pass no `right`, so this renders `<View>` with no children: 40pt, **byte-
   *   identical**.
   *
   * 🛑 THE TITLE IS NO LONGER PERFECTLY CENTRED when this slot exceeds 40pt, and that is accepted
   * rather than overlooked. At 64pt the 19/700 title sits **12pt** left of true centre, because it
   * is a flex child between a 40pt back box and this one. Centring it absolutely would let a long
   * title run under the controls and would restructure a component with 25 call sites that
   * `typecheck` cannot check for layout regressions - there is no test harness here. The width
   * itself is safe with room to spare: « Détail de la demande » measures **195.8pt** against a
   * **239pt** budget on a 375pt iPhone SE, the narrowest device supported.
   */
  rightSlot: {
    minWidth: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
