import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme';
import { RepairerDirectory } from './RepairerDirectory';
import { DemandeBrowse } from './DemandeBrowse';
import { useTourTarget } from '../tour/use-tour';

type Tab = 'demandes' | 'reparateurs';

/**
 * The client's half of the Recherche tab (CF5-16).
 * Renders two subtabs: « Demandes » first (other clients' open public requests),
 * then « Réparateurs » (repairer directory with search & filters). The former « Réparations »
 * category browser was removed per client feedback V5.
 *
 * DELIBERATE DEVIATION from the prototype: the title and subtabs are STICKY here, where
 * the prototype scrolls them with the body. Each body owns its own ScrollView, and two
 * scroll containers cannot share a scrolling header without hoisting both lists into
 * one. Better on a phone, and stated so it does not read as a transcription error.
 */
export function ClientSearch() {
  // `accent` is deliberately absent: the subtabs moved off the accent onto ink, and the
  // chips beneath them are the only accent-coloured control on this screen.
  const { palette, spacing, type, radii } = useTheme();
  const [tab, setTab] = useState<Tab>('demandes');
  // V8 E2: the client's Recherche bubble.
  const subtabsTarget = useTourTarget('searchSubtabs');

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_700Bold',
            fontSize: type.screenTitle.size,
            color: palette.ink,
          }}
        >
          Recherche
        </Text>

        {/* `.subtabs` / `.subtab` / `.subtab--active` (`styles.css:1547-1553`). The active
            tab is a SOLID INK pill with white text and NO border - not the accent-tinted,
            accent-bordered, 12pt-radius version this rendered until 2026-08-20. Two reasons
            it matters beyond fidelity: ink separates a view switch from the red chips
            directly beneath it, which select a filter, and a border on only-one-of-two pills
            made the pair look misaligned. */}
        <View {...subtabsTarget} style={{ flexDirection: 'row', gap: 8, marginTop: spacing.md }}>
          {/* CF5-16: « Demandes » first, then « Réparateurs ». With 2 flex:1 pills,
              each gets ~167.5pt on a 375pt screen, fitting both labels comfortably. */}
          {(['demandes', 'reparateurs'] as const).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: radii.pill,
                alignItems: 'center',
                backgroundColor: tab === t ? palette.ink : palette.mist,
              }}
            >
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_600SemiBold',
                  fontSize: 13.5,
                  color: tab === t ? palette.paper : palette.muted,
                }}
              >
                {t === 'demandes' ? 'Demandes' : 'Réparateurs'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'demandes' ? (
        <DemandeBrowse />
      ) : (
        <RepairerDirectory />
      )}
    </View>
  );
}
