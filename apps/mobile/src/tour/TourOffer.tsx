import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from '../components/Button';
import {
  TOUR_OFFER,
  TOUR_OFFER_BODY,
  TOUR_OFFER_LATER,
  TOUR_OFFER_NOTE,
  TOUR_OFFER_START,
  type TourMode,
} from '../lib/tour-copy';

/**
 * V8 E2 criterion 1, `DEC8-09` (3): the tour offer, once per mode, on Accueil. The same white card as the
 * bubbles, centred on the scrim with no cut-out (nothing is pointed at yet). « Commencer la visite » is the
 * mode's primary button (red / navy); « Plus tard » turns the bubbles off for this mode until « Revoir la
 * visite », and the note says where that is. Widest line « Bienvenue en mode réparateur », 257.5pt at 17pt
 * bold, against 295pt (see `TourBubble.tsx`).
 */
export function TourOffer({ mode, onStart, onLater }: { mode: TourMode; onStart: () => void; onLater: () => void }) {
  const { palette } = useTheme();
  return (
    <View accessibilityViewIsModal accessibilityLiveRegion="polite" style={{ backgroundColor: palette.paper, borderRadius: 18, padding: 20 }}>
      <Text accessibilityRole="header" style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 17, lineHeight: 22, color: palette.ink }}>
        {TOUR_OFFER[mode].title}
      </Text>
      <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14.5, lineHeight: 20, color: palette.muted, marginTop: 6, marginBottom: 18 }}>
        {TOUR_OFFER_BODY}
      </Text>
      <Button label={TOUR_OFFER_START} onPress={onStart} />
      <Button label={TOUR_OFFER_LATER} variant="text" onPress={onLater} />
      <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, lineHeight: 17, color: palette.faint, textAlign: 'center', marginTop: 4 }}>
        {TOUR_OFFER_NOTE}
      </Text>
    </View>
  );
}
