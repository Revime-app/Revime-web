import { Pressable, Text, View } from 'react-native';
import type { ParcelPointInput } from '@revime/shared';
import { useTheme } from '../theme';
import { useParcelPoints } from '../lib/queries';

type Props = {
  commandeId: string;
  postalCode: string;
  city: string;
  value: ParcelPointInput | null;
  onChange: (p: ParcelPointInput) => void;
};

function distance(m: number | null): string {
  if (m === null) return '';
  return m < 1000 ? ` · ${m} m` : ` · ${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/**
 * Livraison Boxtal, spec §9.2. Searches once the postal code above has five digits and a city is
 * typed; the list is the server's (spec §7.5): name, address, distance, opening hours. One
 * selectable; the address form's submit stays disabled until one is chosen.
 */
export function RelayPointPicker({ commandeId, postalCode, city, value, onChange }: Props) {
  const { palette, accent, radii, spacing } = useTheme();
  const ready = /^\d{5}$/.test(postalCode) && city.trim().length > 0;
  const points = useParcelPoints(commandeId, ready ? { postalCode, city: city.trim() } : null);
  const muted = { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, color: palette.muted } as const;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12.5, color: palette.muted, marginBottom: spacing.xs }}>
        Point relais où retirer le colis
      </Text>
      {!ready && <Text style={muted}>Indiquez le code postal et la ville ci-dessus.</Text>}
      {ready && points.isPending && <Text style={muted}>Recherche des points relais…</Text>}
      {points.isError && (
        <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5, color: palette.red }}>
          Points relais indisponibles pour le moment. Réessayez.
        </Text>
      )}
      {points.data?.length === 0 && <Text style={muted}>Aucun point relais trouvé autour de ce code postal.</Text>}
      {points.data?.map((p) => {
        const active = value?.code === p.code && value?.network === p.network;
        return (
          <Pressable
            key={`${p.network}-${p.code}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange({ code: p.code, network: p.network, name: p.name, address: p.address })}
            style={{
              padding: 12,
              marginTop: 8,
              borderRadius: radii.field,
              borderWidth: active ? 2 : 1,
              borderColor: active ? accent.accent : palette.line,
            }}
          >
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13.5, color: palette.ink }}>{p.name}</Text>
            <Text style={muted}>
              {p.address}
              {distance(p.distanceM)}
            </Text>
            {p.openingHours.length > 0 && (
              <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, color: palette.muted, marginTop: 2 }}>
                {p.openingHours.join(' · ')}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
