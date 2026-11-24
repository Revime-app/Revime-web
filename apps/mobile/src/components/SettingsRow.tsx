import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

/**
 * `CF-47`. The grouped-list primitive the Paramètres screens are built from.
 *
 * There was no reusable row in this workspace before this - 37 components and every list
 * screen rolling its own - so this exists to stop the seven new screens each inventing
 * one. It is deliberately dumb: no data fetching, no navigation, no state.
 *
 * 🛑 SHADOW ON THE OUTER VIEW, CLIP ON THE INNER ONE. A view with `overflow: 'hidden'`
 * sets `masksToBounds` on iOS and clips the shadow it is trying to cast, and a style
 * ARRAY is flattened onto one view so putting them in "separate" objects does not help.
 * `apps/mobile/AGENTS.md` records this shipping three times.
 */
export function SettingsSection({
  title,
  children,
  style,
}: {
  title: string | null;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette, radii, spacing } = useTheme();

  return (
    <View style={[{ marginBottom: spacing.lg }, style]}>
      {title !== null && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_600SemiBold',
            fontSize: 12,
            letterSpacing: 0.6,
            color: palette.muted,
            textTransform: 'uppercase',
            marginBottom: 8,
            marginLeft: 4,
          }}
        >
          {title}
        </Text>
      )}
      <View
        style={{
          borderRadius: radii.card,
          shadowColor: '#101828',
          shadowOpacity: 0.07,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        }}
      >
        <View
          style={{
            backgroundColor: palette.paper,
            borderColor: palette.line,
            borderWidth: 1,
            borderRadius: radii.card,
            borderCurve: 'continuous',
            overflow: 'hidden',
          }}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

/**
 * One row. `value` is a read-only right-hand string; `trailing` is for a control (a
 * Switch, a chip) and wins over `value` when both are given.
 *
 * 🛑 `onPress` IS REQUIRED AND MAY BE `null`, not optional. `apps/mobile/AGENTS.md`: an
 * optional prop lets a new call site compile while silently rendering a row that looks
 * tappable and is not, and there are no tests here to catch it. `null` says « this row
 * is inert » out loud.
 *
 * `valueMaxWidth` allows overriding the default 170pt value column width for rows where
 * the content is known to be longer (e.g., email addresses). Added for `CF-47`'s compte
 * screen where measured emails truncate at the original width.
 */
export function SettingsRow({
  label,
  value = null,
  onPress,
  destructive = false,
  trailing = null,
  last = false,
  valueMaxWidth = 170,
  icon = null,
  sub = null,
  subTone = 'muted',
}: {
  label: string;
  value?: string | null;
  onPress: (() => void) | null;
  destructive?: boolean;
  trailing?: React.ReactNode;
  last?: boolean;
  valueMaxWidth?: number;
  /**
   * `CF-49`. A leading glyph, as mockup `04` panel 2 draws on every checklist row.
   *
   * OPTIONAL, unlike `CF-23`'s make-the-prop-required rule, and the distinction is the one
   * `ScreenHeader.right` records: required-ness is right when a component gains data some rows
   * HAVE and others do not, and wrong for an opt-in that must not restyle existing screens. All
   * existing call sites render byte-identically with `null`.
   */
  icon?: React.ReactNode;
  /**
   * A second line under the label - the checklist's « Ajoutez votre photo », and `CF-50`'s
   * verification status.
   *
   * 🛑 THE STATUS GOES HERE RATHER THAN IN `value`, AND THAT IS A MEASUREMENT, not a preference.
   * « Informations professionnelles » + « Non concerné » on one row needs 303.8pt against the
   * 273.0pt a 375pt SE gives - see the spec §10.1. Stacked, the label alone is 201.8pt.
   */
  sub?: string | null;
  /** `warn` for an outstanding step, `ok` for a settled one. Derived in-family; no new colours. */
  subTone?: 'muted' | 'warn' | 'ok';
}) {
  const { palette, accent } = useTheme();
  const labelColour = destructive ? palette.red : palette.ink;
  const subColour =
    subTone === 'warn' ? palette.amber : subTone === 'ok' ? palette.greenDeep : palette.muted;

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: palette.line,
        minHeight: 52,
      }}
    >
      {/* 24pt glyph + 12pt gap = the 36pt the spec's width arithmetic subtracts. */}
      {icon !== null && (
        <View style={{ width: 24, alignItems: 'center', marginRight: 12 }}>{icon}</View>
      )}
      {/* `flex: 1` moves from the label onto this wrapper when a sub-label exists, or the sub
          sits BESIDE the label in the row rather than under it - the same trap `ScreenHeader`
          records for its subtitle. */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 15,
            color: labelColour,
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
        {sub !== null && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 12.5,
              color: subColour,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {sub}
          </Text>
        )}
      </View>
      {trailing ?? (
        <>
          {value !== null && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 14,
                color: palette.muted,
                marginLeft: 12,
                maxWidth: valueMaxWidth,
              }}
              numberOfLines={1}
            >
              {value}
            </Text>
          )}
          {onPress !== null && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 18,
                color: palette.muted,
                marginLeft: 8,
              }}
            >
              ›
            </Text>
          )}
        </>
      )}
    </View>
  );

  if (onPress === null) return body;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: pressed ? accent.accentSoft : 'transparent' })}
    >
      {body}
    </Pressable>
  );
}
