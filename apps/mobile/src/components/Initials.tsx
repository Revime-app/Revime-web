import { View, Text, Image } from 'react-native';
import { avatarInitials } from '@revime/shared';
import { useTheme } from '../theme';

/**
 * The avatar: the person's uploaded photo when there is one, their initials when there is not.
 *
 * 🛑 THIS USED TO SAY `Profile.avatarPath` WAS REFERENCED NOWHERE AND COULD ONLY EVER RENDER
 * INITIALS. `CF-23` (2026-08-30) built the uploader, so the column now has a writer and this
 * component renders both cases. The old note is kept only as the reason the photo arrived late.
 *
 * 🛑 `uri` IS REQUIRED, NOT OPTIONAL, AND THAT IS A DELIBERATE USE OF THE ONLY GATE THIS
 * WORKSPACE HAS. `apps/mobile` has no test harness at all - `typecheck` is the whole of CI - so a
 * new call site that forgets the photo has to be caught by `tsc` or it is not caught. An optional
 * prop would let one compile and silently render initials for somebody who has a photo, which is
 * indistinguishable from correct behaviour on screen. Same reasoning as `CF-32`'s total icon map:
 * make the compiler ask the question.
 *
 * Pass `null` explicitly where there is genuinely no photo to show.
 *
 * `size` and `radius` are optional and DEFAULT TO THE ORIGINAL 44pt circle, deliberately. The
 * message rows want the prototype's `.avatar` - 48pt at radius 14, a rounded square
 * (`styles.css:448-455`) - but Profil, the réparateur directory and the public profile already
 * render the circle, and changing the default would restyle three screens nobody asked about.
 * Same reasoning as `Chip`'s variant.
 */
export function Initials({
  name,
  uri,
  size = 44,
  radius = 999,
}: {
  name: string;
  /**
   * The signed photo URL, or null for initials.
   *
   * A truthy check rather than `!== null`, because a NEW DTO field arrives `undefined` from an API
   * older than the app - see `apps/mobile/AGENTS.md`. Truthy collapses absent and null into one
   * representation, which is the one shape that cannot render a broken image.
   */
  uri: string | null;
  size?: number;
  radius?: number;
}) {
  const { accent } = useTheme();
  // CF4-50: first letter or digit per word, so « @mlk » gives « M », not the « @ ».
  const letters = avatarInitials(name);

  if (uri) {
    return (
      /**
       * The rounding lives on a WRAPPER rather than on the `Image`, and that is not incidental:
       * `borderCurve` is a `ViewStyle` property and `tsc` rejects it on an `ImageStyle`. Dropping it
       * instead would make a photo's corners a plain circular arc while the initials branch below
       * keeps iOS's continuous squircle - invisible at `radius: 999`, but the message rows use
       * `radius: 14`, where the same row would render two different corner shapes depending on
       * whether the person had uploaded a photo.
       *
       * `overflow: 'hidden'` is safe here specifically because nothing in this component casts a
       * shadow. `AGENTS.md` records that combination clipping a card's own shadow three times; if a
       * shadow is ever added to an avatar, it goes on a further view OUTSIDE this one.
       */
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          borderCurve: 'continuous',
          overflow: 'hidden',
        }}
      >
        <Image
          source={{ uri }}
          // BOTH dimensions definite, never `aspectRatio`. An Image is a Yoga node with a measure
          // function, so an intrinsic dimension participates and wins - `AGENTS.md` records this
          // costing a logo rendered at its full 3749x666. `cover` rather than `contain` for the
          // same file's other rule: logos contain, user photographs cover, or a landscape photo
          // leaves roughly 40% of a square tile empty.
          style={{ width: size, height: size }}
          resizeMode="cover"
          // Swapping text for an image removes the only thing a screen reader had to announce, and
          // an unlabelled Image is skipped or read as a filename. The label restores what the Text
          // gave for free.
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Photo de profil de ${name}`}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        borderCurve: 'continuous',
        backgroundColor: accent.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Scaled from the size so a 48pt avatar does not keep 44pt's letter size. The 0.34
          ratio reproduces the original pairing (15 at 44) rather than being picked freshly. */}
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_700Bold',
          fontSize: Math.round(size * 0.34),
          color: accent.accentDeep,
        }}
      >
        {letters}
      </Text>
    </View>
  );
}
