import { View, StyleSheet, type ViewProps } from 'react-native';
import { useTheme } from '../theme';

type Props = ViewProps;

export function Card({ style, children, ...props }: Props) {
  const { palette, radii, spacing } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: palette.paper,
          borderRadius: radii.card,
          padding: spacing.lg,
          shadowColor: '#101828',
          shadowOpacity: 0.07,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
