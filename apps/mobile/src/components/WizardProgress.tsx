import { View } from 'react-native';
import { useTheme } from '../theme';

export function WizardProgress({ step, total }: { step: number; total: number }) {
  const { accent, palette, spacing } = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.lg }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 999,
            backgroundColor: i < step ? accent.accent : palette.line,
          }}
        />
      ))}
    </View>
  );
}
