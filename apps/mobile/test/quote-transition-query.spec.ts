import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock push before queries is loaded to prevent expo imports
vi.mock('../src/lib/push', () => ({
  syncBadge: vi.fn(),
  usePushRegistration: vi.fn(),
}));

// Mock api before queries is loaded
const mockPost = vi.fn();
vi.mock('../src/lib/api', () => ({
  api: {
    post: (...args: any[]) => mockPost(...args),
  },
}));

import { useDeclineQuote, useCancelQuote, queryKeys } from '../src/lib/queries';

const mockInvalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
  useMutation: (config: any) => ({
    mutateAsync: async (input: any) => {
      try {
        const res = await config.mutationFn(input);
        config.onSuccess?.(res);
        return res;
      } catch (err) {
        config.onError?.(err);
        throw err;
      }
    },
  }),
  useQuery: vi.fn(),
}));

describe('CF6-13: useDeclineQuote cache invalidation on error and success', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates demande and repairerQuoteRequests on mutation error so screen refreshes', async () => {
    mockPost.mockRejectedValue(new Error("Cette demande n'est plus ouverte."));
    const decline = useDeclineQuote('demande-123');

    await expect(decline.mutateAsync({ note: 'Trop loin' })).rejects.toThrow();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.demande('demande-123'),
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.repairerQuoteRequests,
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.myDemandes,
    });
  });

  it('invalidates all quote lists on mutation success', async () => {
    mockPost.mockResolvedValue({ ok: true });
    const decline = useDeclineQuote('demande-123');

    await decline.mutateAsync({ note: 'Trop loin' });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.demande('demande-123'),
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.repairerQuoteRequests,
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.myDemandes,
    });
  });

  it('CF6-12: invalidates conversationsRoot on quote transition success', async () => {
    mockPost.mockResolvedValue({ ok: true });
    const cancel = useCancelQuote('demande-123');

    await cancel.mutateAsync();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.conversationsRoot,
    });
  });
});
