import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { palette, spacing } from '@revime/tokens';

const mockPush = vi.fn();
const mockBack = vi.fn();
const mockReplace = vi.fn();

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
  }),
}));

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette,
    spacing,
    radii: { sm: 4, md: 8, lg: 12, xl: 16, full: 9999, field: 12 },
    type: {
      body: { size: 14 },
      caption: { size: 12 },
      title: { size: 18 },
    },
    accent: {
      accent: palette.navy,
      accentSoft: '#eef2ff',
    },
  }),
}));

const mockRefresh = vi.fn().mockResolvedValue(undefined);
const mockMe = {
  id: 'usr_1',
  name: 'Camille Martin',
  firstName: 'Camille',
  lastName: 'Martin',
  profile: {
    repairerEnabled: true,
    verificationLevel: 'IDENTITY',
  },
  repairer: {
    kind: 'INDIVIDUAL',
    fiscalCompleted: false,
  },
};

vi.mock('../src/lib/session', () => ({
  useSessionContext: () => ({
    me: mockMe,
    refresh: mockRefresh,
  }),
}));

let mockPreFillData: any = {
  legalName: 'Camille Martin',
  firstName: 'Camille',
  lastName: 'Martin',
  birthDate: '1992-07-24T00:00:00.000Z',
  isBirthDateLocked: true,
  declaration: null,
};

let mockPreFillLoading = false;

vi.mock('../src/lib/queries', () => ({
  useFiscalPreFill: () => ({
    data: mockPreFillData,
    isLoading: mockPreFillLoading,
    refetch: vi.fn(),
  }),
  useSubmitFiscalDeclaration: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: any) => React.createElement('SafeAreaView', props, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('../src/components/ScreenMotif', () => ({
  ScreenMotif: () => null,
}));

import FiscaliteScreen from '../app/fiscalite';

function findText(node: any, text: string): boolean {
  if (!node) return false;
  if (typeof node === 'string') return node.includes(text);
  if (Array.isArray(node)) return node.some((child) => findText(child, text));
  if (typeof node === 'object' && node.props) {
    if (typeof node.props.title === 'string' && node.props.title.includes(text)) return true;
    if (typeof node.props.label === 'string' && node.props.label.includes(text)) return true;
    return findText(node.props.children, text);
  }
  return false;
}

describe('FiscaliteScreen (CMP-D2)', () => {
  let stateMap: Record<number, any> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    stateMap = {};

    const clientInternals =
      (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
      (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_OR_YOU_WILL_BE_FIRED;
    if (clientInternals) {
      let stateIndex = 0;
      clientInternals.H = {
        useState: (initial: any) => {
          const idx = stateIndex++;
          const val = stateMap[idx] !== undefined ? stateMap[idx] : initial;
          return [val, (newVal: any) => { stateMap[idx] = newVal; }];
        },
        useCallback: (fn: any) => fn,
        useMemo: (fn: any) => fn(),
        useRef: (initial: any) => ({ current: initial }),
        useEffect: (fn: any) => undefined,
      };
    }
  });

  it('renders pre-filled identity information and address fields', () => {
    const tree = FiscaliteScreen();
    expect(tree).not.toBeNull();
    expect(findText(tree, 'Informations fiscales')).toBe(true);
    expect(findText(tree, 'Camille Martin')).toBe(true);
    expect(findText(tree, 'Adresse principale de résidence fiscale')).toBe(true);
    expect(findText(tree, "J'atteste sur l'honneur l'exactitude des informations fournies")).toBe(true);
    expect(findText(tree, 'Valider mes informations')).toBe(true);
  });

  it('displays NIF input when hasNoNif is false', () => {
    const tree = FiscaliteScreen();
    expect(findText(tree, 'Numéro fiscal (NIF)')).toBe(true);
    expect(findText(tree, "Je n'ai pas de numéro fiscal")).toBe(true);
    expect(findText(tree, 'Ville de naissance')).toBe(false);
  });

  it('displays birth place fields when hasNoNif is true', () => {
    // In state order: [addressLine(0), postalCode(1), city(2), country(3), nif(4), hasNoNif(5), birthCity(6), birthCountry(7), customBirthDate(8), error(9)]
    stateMap[5] = true; // hasNoNif = true
    const tree = FiscaliteScreen();
    expect(findText(tree, 'Numéro fiscal (NIF)')).toBe(false);
    expect(findText(tree, "Je n'ai pas de numéro fiscal")).toBe(true);
    expect(findText(tree, 'Ville de naissance')).toBe(true);
    expect(findText(tree, 'Pays de naissance')).toBe(true);
  });
});
