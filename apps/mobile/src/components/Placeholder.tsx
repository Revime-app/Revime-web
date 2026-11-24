import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IconHome } from '../icons';

type Props = {
  title: string;
  subtitle?: string;
};

export function Placeholder({ title, subtitle = 'Cette fonctionnalité sera disponible prochainement' }: Props) {
  const { palette, spacing, type } = useTheme();

  return (
    <View style={styles.container}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: palette.mist,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.lg,
        }}
      >
        <IconHome size={28} color={palette.faint} strokeWidth={2} />
      </View>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_600SemiBold',
          fontSize: type.section.size,
          color: palette.ink,
          marginBottom: spacing.sm,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_500Medium',
          fontSize: type.body.size,
          color: palette.muted,
          textAlign: 'center',
          maxWidth: 280,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
