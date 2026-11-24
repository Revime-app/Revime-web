import Svg, { Path } from 'react-native-svg';

/**
 * Google's four-colour G, at the brand's own hex values.
 *
 * Hard-coded rather than themed: these are Google's colours and must not follow
 * our accent, which repaints navy in réparateur mode. `packages/tokens` is
 * deliberately not consulted here for the same reason.
 */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.19c-.27 1.44-1.08 2.66-2.3 3.48v2.89h3.72c2.18-2 3.45-4.96 3.45-8.56z" />
      <Path fill="#34A853" d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.44-4.74H1.72v2.99C3.6 21.4 7.51 24 12 24z" />
      <Path fill="#FBBC05" d="M5.56 14.68c-.23-.69-.36-1.42-.36-2.18s.13-1.49.36-2.18V7.33H1.72A11.96 11.96 0 0 0 .45 12.5c0 1.94.47 3.77 1.27 5.17l3.84-2.99z" />
      <Path fill="#EA4335" d="M12 4.77c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.19 15.11 0 12 0 7.51 0 3.6 2.6 1.72 6.33l3.84 2.99C6.46 6.79 9 4.77 12 4.77z" />
    </Svg>
  );
}
