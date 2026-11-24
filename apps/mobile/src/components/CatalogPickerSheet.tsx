import { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { IconCancel, IconSearch, IconTick, IconEdit } from '../icons';
import { RevimeLoader } from './lottie/RevimeLoader';
import { KeyboardAvoider } from './KeyboardAvoider';

type Item = {
  id: string;
  name: string;
  [key: string]: any;
};

type Props<T extends Item> = {
  visible: boolean;
  title: string;
  items: T[];
  selectedValue?: string;
  isLoading?: boolean;
  onSelect: (item: T) => void;
  onSelectOther: () => void;
  onClose: () => void;
  otherLabel?: string;
  emptyLabel?: string;
};

export function CatalogPickerSheet<T extends Item>({
  visible,
  title,
  items,
  selectedValue,
  isLoading = false,
  onSelect,
  onSelectOther,
  onClose,
  otherLabel = 'Autre (saisie libre)',
  emptyLabel = 'Aucun élément trouvé',
}: Props<T>) {
  const { palette, accent, spacing, radii } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  const handleClose = () => {
    Keyboard.dismiss();
    setSearch('');
    onClose();
  };

  const handleSelect = (item: T) => {
    Keyboard.dismiss();
    setSearch('');
    onSelect(item);
  };

  const handleSelectOther = () => {
    Keyboard.dismiss();
    setSearch('');
    onSelectOther();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <KeyboardAvoider style={styles.keyboardAvoid}>
        <Pressable style={styles.modalOverlay} onPress={handleClose}>
          <Pressable
            style={[
              styles.modalSheet,
              {
                backgroundColor: palette.paper,
                paddingBottom: isKeyboardVisible ? spacing.sm : insets.bottom + spacing.md,
              },
            ]}
            onPress={Keyboard.dismiss}
          >
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: palette.line }]}>
              <Text style={[styles.modalTitle, { color: palette.ink }]}>{title}</Text>
              <Pressable onPress={handleClose} hitSlop={8} style={styles.modalCloseBtn}>
                <IconCancel size={20} color={palette.muted} strokeWidth={2} />
              </Pressable>
            </View>

            {/* Search bar */}
            <View style={[styles.searchBox, { marginHorizontal: spacing.md, marginVertical: spacing.sm }]}>
              <View
                style={[
                  styles.searchInputWrapper,
                  {
                    backgroundColor: palette.mist,
                    borderColor: palette.line,
                    borderRadius: radii.field,
                  },
                ]}
              >
                <IconSearch size={18} color={palette.muted} strokeWidth={2} />
                <TextInput
                  style={[
                    styles.searchInput,
                    {
                      color: palette.ink,
                    },
                  ]}
                  placeholder="Rechercher..."
                  placeholderTextColor={palette.faint}
                  value={search}
                  onChangeText={setSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} hitSlop={8}>
                    <Text style={{ fontSize: 16, color: palette.muted, paddingHorizontal: 4 }}>×</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* List */}
            <ScrollView
              style={styles.list}
              contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
            {/* "Autre" option at the top for easy access */}
            <Pressable
              onPress={handleSelectOther}
              style={({ pressed }) => [
                styles.otherOptionRow,
                {
                  backgroundColor: pressed ? palette.mist : palette.page,
                  borderColor: accent.accent,
                  borderRadius: radii.field,
                },
              ]}
            >
              <View style={styles.otherOptionContent}>
                <IconEdit size={17} color={accent.accent} strokeWidth={2} />
                <Text style={[styles.otherOptionText, { color: accent.accent }]}>{otherLabel}</Text>
              </View>
            </Pressable>

            {isLoading ? (
              <View style={styles.loadingBox}>
                <RevimeLoader variant="fill" size={40} centered={false} text="Chargement…" />
              </View>
            ) : filteredItems.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: palette.muted }]}>
                  {search.trim() ? `Aucun résultat pour « ${search} »` : emptyLabel}
                </Text>
              </View>
            ) : (
              filteredItems.map((item) => {
                const isSelected =
                  selectedValue === item.id ||
                  selectedValue?.toLowerCase() === item.name.toLowerCase();
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                      styles.itemRow,
                      {
                        backgroundColor: isSelected
                          ? palette.mist
                          : pressed
                            ? palette.page
                            : palette.paper,
                        borderBottomColor: palette.line,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.itemText,
                        {
                          color: isSelected ? palette.ink : palette.ink2,
                          fontFamily: isSelected
                            ? 'GoogleSansFlex_600SemiBold'
                            : 'GoogleSansFlex_400Regular',
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                    {isSelected && <IconTick size={18} color={accent.accent} strokeWidth={2.4} />}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardAvoider>
  </Modal>
);
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 16,
  },
  modalCloseBtn: {
    padding: 4,
  },
  searchBox: {},
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 14,
  },
  list: {
    flexShrink: 1,
    maxHeight: 400,
  },
  otherOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 8,
    marginTop: 4,
  },
  otherOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  otherOptionText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  itemText: {
    fontSize: 14.5,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
  },
});
