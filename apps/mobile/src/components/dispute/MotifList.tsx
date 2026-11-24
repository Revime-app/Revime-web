import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  DISPUTE_MOTIFS,
  motifsFor,
  type DisputeMotif,
  type DisputeSide,
} from '@revime/shared';
import { palette, radii, spacing } from '../../theme';

export function MotifList({
  side,
  selectedMotif,
  onSelect,
}: {
  side: DisputeSide;
  selectedMotif: DisputeMotif | null;
  onSelect: (motif: DisputeMotif) => void;
}) {
  const motifs = motifsFor(side);

  return (
    <View style={styles.container}>
      {motifs.map((motif) => {
        const item = DISPUTE_MOTIFS[motif];
        const isSelected = selectedMotif === motif;

        return (
          <Pressable
            key={motif}
            onPress={() => onSelect(motif)}
            style={({ pressed }) => [
              styles.itemCard,
              isSelected && styles.itemCardSelected,
              pressed && styles.itemCardPressed,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
          >
            {/* Custom radio indicator */}
            <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
              {isSelected ? <View style={styles.radioInner} /> : null}
            </View>

            {/* Label and Subtitle */}
            <View style={styles.textContainer}>
              <Text style={[styles.label, isSelected && styles.labelSelected]}>
                {item.label}
              </Text>
              {item.subtitle ? (
                <Text style={styles.subtitle}>{item.subtitle}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: palette.paper,
    borderWidth: 1.5,
    borderColor: palette.line,
  },
  itemCardSelected: {
    borderColor: palette.red,
    backgroundColor: '#fffcfd',
  },
  itemCardPressed: {
    opacity: 0.8,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: spacing.sm,
  },
  radioOuterSelected: {
    borderColor: palette.red,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.red,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 14,
    color: palette.ink,
  },
  labelSelected: {
    color: palette.redDeep,
  },
  subtitle: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12,
    color: palette.muted,
    marginTop: 2,
    lineHeight: 16,
  },
});
