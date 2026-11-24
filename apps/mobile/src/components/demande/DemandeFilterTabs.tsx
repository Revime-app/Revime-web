import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';
import { pillAccessibilityLabel, type DemandeFilter } from './demande-filter';

export type DemandeFilterTabsProps = {
  activeFilter: DemandeFilter;
  onChangeFilter: (filter: DemandeFilter) => void;
  counts: {
    all: number;
    public: number;
    private: number;
  };
};

type TabOption = {
  key: DemandeFilter;
  label: string;
  count: number;
};

/**
 * CF6-14: Dedicated 3-filter pill selector for client repair requests and quote requests:
 * « Toutes » (all requests & orders), « Publiques » (public requests & orders),
 * and « Devis privés » (private quote requests).
 */
export function DemandeFilterTabs({
  activeFilter,
  onChangeFilter,
  counts,
}: DemandeFilterTabsProps) {
  const { palette, radii, spacing } = useTheme();

  const tabs: TabOption[] = [
    { key: 'ALL', label: 'Toutes', count: counts.all },
    { key: 'PUBLIC', label: 'Publiques', count: counts.public },
    { key: 'PRIVATE', label: 'Devis privés', count: counts.private },
  ];

  return (
    <View style={[styles.container, { marginBottom: spacing.md }]}>
      {tabs.map((tab) => {
        const isActive = activeFilter === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={pillAccessibilityLabel(tab.label, tab.count)}
            onPress={() => onChangeFilter(tab.key)}
            style={[
              styles.tab,
              {
                borderRadius: radii.pill,
                backgroundColor: isActive ? palette.ink : palette.mist,
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color: isActive ? palette.paper : palette.muted,
                },
              ]}
              numberOfLines={1}
            >
              {`${tab.label} (${tab.count})`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 12.5,
  },
});
