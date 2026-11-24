import { Pressable } from 'react-native';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { FavouriteIcon } from '@hugeicons/core-free-icons';
import { useTheme } from '../theme';

/**
 * `CF-18` / `CF-19` / `CF-20` / `CF-27`. The one favourite control, four callers: the demande
 * detail header, the réparateur fiche, each directory row, and each card on `/favoris`.
 *
 * ONE component rather than four inline Pressables, so the filled/outline treatment and the
 * accessibility label cannot drift between surfaces.
 *
 * 🛑 **PRESENTATIONAL (props only, no hooks).** The callers own `useToggleFavoriteRepairer` or
 * `useToggleFavoriteDemande` and pass `onToggle`, because this one component is used on two
 * different resources and conditional hook calls would be a React rules violation.
 */

type Props = {
  /** True when the item is favourited. Controls filled vs outline state. */
  filled: boolean;
  /** Called when the user taps the heart. The caller owns the mutation hook. */
  onToggle: () => void;
  /** Icon size in points. Defaults to 24. */
  size?: number;
  /**
   * Optional accessibility label override. When provided, replaces the state-derived label.
   *
   * 🛑 **WHY THIS EXISTS:** One caller (`DemandeFeed.tsx` in réparateur mode) uses this glyph to
   * NAVIGATE to the favourites list rather than to toggle one item, so its label cannot be derived
   * from `filled`. Without this override, that button announces « Ajouter aux favoris » to a
   * screen reader while it actually navigates away from the screen.
   */
  accessibilityLabel?: string;
};

export function FavoriteHeart({ filled, onToggle, size = 24, accessibilityLabel }: Props) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (filled ? 'Retirer des favoris' : 'Ajouter aux favoris')}
      hitSlop={8}
    >
      {/* `fill` is passed to `HugeiconsIcon` rather than through the `IconHeart` wrapper,
          because `make` in `src/icons.ts` forwards only size, color and strokeWidth - the
          same reason `avis/[commandeId].tsx:26` gives for its star rating. */}
      <HugeiconsIcon
        icon={FavouriteIcon}
        size={size}
        color={palette.red}
        strokeWidth={2}
        fill={filled ? palette.red : 'none'}
      />
    </Pressable>
  );
}
