import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme';

export type AddressResult = { label: string; city: string; postcode: string };

export function AddressInput({
  label,
  value,
  onChangeText,
  onSelect,
  error,
  placeholder,
  editable = true
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (res: AddressResult) => void;
  error?: string | null;
  placeholder?: string;
  editable?: boolean;
}) {
  const { palette, radii, spacing } = useTheme();
  const [results, setResults] = useState<AddressResult[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!focused || value.length < 3) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(value)}&autocomplete=1`);
        const data = await res.json();
        setResults(
          (data.features || []).map((f: any) => ({
            label: f.properties.label,
            city: f.properties.city,
            postcode: f.properties.postcode
          }))
        );
      } catch (e) {
        // ignore error
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [value, focused]);

  return (
    <View style={{ marginBottom: spacing.lg, zIndex: 100 }}>
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12.5, color: palette.ink, marginBottom: spacing.xs }}>{label}</Text>
      <View style={{ position: 'relative' }}>
        <TextInput
          style={{
            borderWidth: 1.5,
            borderColor: error ? palette.red : (focused ? palette.ink : palette.line),
            borderRadius: radii.card,
            paddingHorizontal: 16,
            minHeight: 52,
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 15,
            color: palette.ink,
            backgroundColor: palette.paper
          }}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // slight delay to allow press on suggestion
            setTimeout(() => setFocused(false), 200);
          }}
          placeholder={placeholder}
          // V8 B1 (FND8-012): without it Android takes the hint colour from the phone's theme,
          // which is light in dark mode, on this white field.
          placeholderTextColor={palette.faint}
          editable={editable}
        />
        {loading && (
          <View style={{ position: 'absolute', right: 16, top: 16 }}>
            <ActivityIndicator size="small" color={palette.muted} />
          </View>
        )}
      </View>
      {error ? <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5, color: palette.red, marginTop: 6 }}>{error}</Text> : null}
      
      {focused && results.length > 0 && (
        <View style={{
          position: 'absolute', top: 80, left: 0, right: 0, zIndex: 999,
          backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line,
          borderRadius: radii.card, maxHeight: 220, elevation: 5, shadowOpacity: 0.1, shadowRadius: 10
        }}>
          <FlatList
            data={results}
            keyExtractor={item => item.label + item.postcode}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={{ padding: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.line }}
                onPress={() => {
                  onChangeText(item.label);
                  setFocused(false);
                  onSelect(item);
                }}
              >
                <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14, color: palette.ink }}>{item.label}</Text>
                <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, color: palette.muted }}>{item.postcode} {item.city}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}
