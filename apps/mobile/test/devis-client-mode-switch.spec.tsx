import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for native / expo modules
vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));
vi.mock('expo-modules-core', () => ({
  requireNativeModule: vi.fn(),
}));

// Router mock
const mockBack = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => ({
    repairerId: 'repairer-123',
  }),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, style }: any) => React.createElement('SafeAreaView', { style }, children),
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: {
      paper: '#FFFFFF',
      ink: '#101828',
      ink2: '#344054',
      line: '#E4E7EC',
      muted: '#667085',
      mist: '#F2F4F7',
      red: '#D92D20',
    },
    accent: {
      accent: '#FF3B30',
      accentSoft: '#FEE4E2',
    },
    radii: { card: 20, field: 12 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 },
    type: { body: { size: 15 } },
  }),
}));

vi.mock('../src/components/ScreenMotif', () => ({
  ScreenMotif: (props: any) => React.createElement('ScreenMotif', props),
}));

vi.mock('../src/components/ScreenHeader', () => ({
  ScreenHeader: (props: any) => React.createElement('ScreenHeader', props),
}));

vi.mock('../src/components/Field', () => ({
  Field: (props: any) => React.createElement('Field', props),
}));

vi.mock('../src/components/AddressInput', () => ({
  AddressInput: (props: any) => React.createElement('AddressInput', props),
}));

vi.mock('../src/components/PhotoPicker', () => ({
  PhotoPicker: (props: any) => React.createElement('PhotoPicker', props),
}));

vi.mock('../src/components/Card', () => ({
  Card: ({ children, ...props }: any) => React.createElement('Card', props, children),
}));

vi.mock('../src/components/Chip', () => ({
  Chip: (props: any) => React.createElement('Chip', props),
}));

vi.mock('../src/components/Button', () => ({
  Button: (props: any) => React.createElement('Button', props),
}));

vi.mock('../src/icons', () => ({
  IconTick: (props: any) => React.createElement('IconTick', props),
}));

const mockApiPatch = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../src/lib/api', () => ({
  api: {
    patch: (...args: any[]) => mockApiPatch(...args),
  },
  ApiError: class ApiError extends Error {
    code?: string;
    fields?: Record<string, string>;
    constructor(message: string, code?: string, fields?: Record<string, string>) {
      super(message);
      this.code = code;
      this.fields = fields;
    }
  },
}));

vi.mock('../src/lib/photo-upload', () => ({
  initDraftId: vi.fn(),
  resetDraftId: vi.fn(),
}));

const mockMutateAsync = vi.fn();
const mockRefetchMyDemandes = vi.fn();
vi.mock('../src/lib/queries', () => ({
  useRepairer: () => ({
    data: { displayName: 'Atelier Express' },
    isError: false,
  }),
  useCategories: () => ({
    data: [
      { id: 'cat-1', parentId: null, labelFr: 'Smartphones', active: true },
    ],
    isPending: false,
    isError: false,
  }),
  useCreateQuoteRequest: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useMyDemandes: () => ({
    data: [],
    refetch: mockRefetchMyDemandes,
  }),
}));

const mockRefreshSession = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/lib/session', () => ({
  useSessionContext: () => ({
    me: {
      profile: {
        activeMode: 'REPAIRER',
        clientEnabled: false,
      },
    },
    refresh: mockRefreshSession,
  }),
}));

import NouveauDevis from '../app/devis/nouveau';

function findNodesWithProp(node: any, propName: string, propValue?: any): any[] {
  if (!node) return [];
  if (Array.isArray(node)) {
    return node.flatMap((item) => findNodesWithProp(item, propName, propValue));
  }
  const results: any[] = [];
  if (node.props && node.props[propName] !== undefined) {
    if (propValue === undefined || node.props[propName] === propValue) {
      results.push(node);
    }
  }
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      results.push(...findNodesWithProp(child, propName, propValue));
    }
  } else if (children && typeof children === 'object') {
    results.push(...findNodesWithProp(children, propName, propValue));
  }
  return results;
}

describe('NouveauDevis Bug V2: Passer en mode client action', () => {
  let stateMap: Record<string, any> = {};

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

  it('renders "Passer en mode client" button when formError is "Activez le mode client pour publier une demande."', () => {
    // Set formError state (state index 11 is formError in NouveauDevis)
    stateMap[11] = 'Activez le mode client pour publier une demande.';
    const tree = NouveauDevis();
    const switchButtons = findNodesWithProp(tree, 'label', 'Passer en mode client');
    expect(switchButtons.length).toBe(1);
    expect(switchButtons[0].props.variant).toBe('secondary');
  });

  it('does NOT render "Passer en mode client" button when formError is unrelated', () => {
    stateMap[11] = 'Vérifiez le formulaire.';
    const tree = NouveauDevis();
    const switchButtons = findNodesWithProp(tree, 'label', 'Passer en mode client');
    expect(switchButtons.length).toBe(0);
  });

  it('calls PATCH /users/me/modes and refreshes session on button press', async () => {
    stateMap[11] = 'Activez le mode client pour publier une demande.';
    const tree = NouveauDevis();
    const switchButtons = findNodesWithProp(tree, 'label', 'Passer en mode client');
    expect(switchButtons.length).toBe(1);

    await switchButtons[0].props.onPress();
    expect(mockApiPatch).toHaveBeenCalledWith('/users/me/modes', {
      activeMode: 'CLIENT',
      clientEnabled: true,
    });
    expect(mockRefreshSession).toHaveBeenCalled();
  });
});
