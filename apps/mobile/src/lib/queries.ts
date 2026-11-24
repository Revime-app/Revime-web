import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdvanceStepInput,
  BrowseQuery,
  BusinessStatusResponse,
  CancellationRequestInfo,
  CategoryDto,
  CheckoutSessionResponse,
  CommandeDto,
  CommandeListItem,
  ConnectOnboardingResponse,
  ConnectStatusResponse,
  ConversationDto,
  ConversationListItem,
  CreateBlockInput,
  CreateCancellationRequestInput,
  CreateCheckoutInput,
  CreateConversationInput,
  CreateDemandeInput,
  CreateOfferInput,
  CreateQuoteRequestInput,
  CreateReviewInput,
  DeclineQuoteRequestInput,
  DemandeDto,
  DemandeListItem,
  DirectoryCardDto,
  DirectoryQuery,
  DisputeMessageDto,
  FavoriteDemandeItem,
  FeedItem,
  FeedQuery,
  IdentitySessionResponse,
  IdentityStatusResponse,
  IdentityVariant,
  LookupCompanyResponse,
  MeResponse,
  MessageDto,
  MyParticularQuotaResponse,
  NotificationDto,
  NotificationQuery,
  OfferDto,
  OfferListItem,
  OpenDisputeByPartyInput,
  ParcelPointDto,
  PartyDisputeDto,
  PublicBrandDto,
  PublicDemandeView,
  PublicDeviceModelDto,
  ReceivedOfferListItem,
  RepairerCardDto,
  RepairerDashboardDto,
  RepairerProfileDto,
  RepairerQuoteRequestItem,
  ReportConversationInput,
  ReviewDto,
  SendDisputeMessageInput,
  SendMessageInput,
  ShipmentLeg,
  ShippingAddressInput,
  ShippingQuoteDto,
  ShippingQuoteRequest,
  SignAttachmentInput,
  StartPhoneVerificationResponse,
  SubmitBusinessVerificationInput,
  UpdateAvailabilityInput,
  UpdateDemandeInput,
  UpdateRepairerCategoriesInput,
  UpdateRepairerProfileInput,
  FiscalDeclarationInput,
  FiscalPreFillResponse,
  DailyTipDto,
} from '@revime/shared';
import { api } from './api';
import { syncBadge } from './push';

/**
 * One place for every key, so invalidation is never guesswork. Accepting an
 * offer in part 2 will touch several of these at once.
 */
export const queryKeys = {
  categories: ['categories'] as const,
  /** The session's own /users/me. Verification changes the level it carries. */
  me: ['me'] as const,
  myDemandes: ['demandes', 'mine'] as const,
  demande: (id: string) => ['demandes', id] as const,
  /**
   * The invalidation PREFIX. Every parameterised feed key starts with it, and
   * TanStack matches keys by prefix, so invalidating this refreshes every
   * search variant at once.
   */
  feedRoot: ['demandes', 'feed'] as const,
  feed: (params: FeedQuery) => ['demandes', 'feed', params] as const,
  demandeOffers: (id: string) => ['demandes', id, 'offers'] as const,
  myOffers: ['offers', 'mine'] as const,
  /**
   * `CF-11`'s « Mes offres reçues ». Sibling of `myOffers` and deliberately NOT under it: the
   * two are different collections for different modes, and a shared prefix would make a
   * réparateur's send invalidate a client's inbox for no reason.
   */
  receivedOffers: ['offers', 'received'] as const,
  /**
   * `CF-18` / `CF-19` / `CF-20` / `CF-27`. Two sibling keys and NOT one prefixed pair: the
   * two lists are independent collections, and a shared prefix would make saving an annonce
   * refetch the réparateur list for nothing. Same reasoning as `receivedOffers` beside
   * `myOffers`.
   */
  favoriteRepairers: ['favorites', 'repairers'] as const,
  favoriteDemandes: ['favorites', 'demandes'] as const,
  repairersVerified: ['repairers', 'verified'] as const,
  commande: (id: string) => ['commandes', id] as const,
  dispute: (commandeId: string) => ['commandes', commandeId, 'dispute'] as const,
  commandes: (role: 'client' | 'repairer') => ['commandes', 'list', role] as const,
  commandesRoot: ['commandes'] as const,
  connectStatus: ['connect', 'status'] as const,
  identityStatus: ['identity', 'status'] as const,
  businessStatus: ['business', 'status'] as const,
  fiscalPreFill: ['fiscal', 'prefill'] as const,
  /**
   * The invalidation PREFIX. TanStack matches by prefix, so invalidating this
   * refreshes the inbox and every open thread at once - which is what a send needs,
   * since it changes the thread, the preview and the unread count together.
   */
  conversationsRoot: ['conversations'] as const,
  conversations: ['conversations', 'list'] as const,
  conversation: (id: string) => ['conversations', id] as const,
  /**
   * The invalidation PREFIX. TanStack matches by prefix, so invalidating this refreshes
   * the list AND the bell's count at once - which is what a read needs, since it changes
   * both and they must not be able to disagree.
   */
  notificationsRoot: ['notifications'] as const,
  /**
   * `mode` is IN the key. That is the reason the route takes it as a query parameter
   * rather than reading activeMode server-side: without it here, switching mode would
   * serve the other mode's list out of cache.
   */
  notifications: (mode: NotificationQuery['mode']) => ['notifications', 'list', mode] as const,
  notificationsUnread: (mode: NotificationQuery['mode']) =>
    ['notifications', 'unread', mode] as const,
  /**
   * The invalidation PREFIX for everything piece C reads. A réparateur saving his own
   * profile changes his card in every directory variant and his own profile screen, and
   * TanStack matches keys by prefix, so invalidating this refreshes all of them.
   */
  repairersRoot: ['repairers'] as const,
  repairers: (params: DirectoryQuery) => ['repairers', 'list', params] as const,
  repairer: (userId: string) => ['repairers', userId] as const,
  repairerReviews: (userId: string) => ['repairers', userId, 'reviews'] as const,
  /** Livraison Boxtal. Parameterised on the postal code typed in the picker. */
  parcelPoints: (commandeId: string, params: { postalCode?: string; city?: string }) =>
    ['commandes', commandeId, 'parcel-points', params] as const,
  /**
   * CF4-G. The réparateur Tableau de bord's « À faire » / « Activité récente ». Deliberately
   * NOT under `repairersRoot` (a profile save must not refetch it) nor `commandesRoot`: each
   * mutation that changes its answer invalidates it by name.
   */
  repairerDashboard: ['repairer-dashboard'] as const,
  /**
   * V7 A10 (U7). The private individual's own CGU art. 53 counter. Its own key: a payment changes
   * it, and nothing in the app pays a mission to the réparateur, so screens refetch it on focus.
   */
  myParticularQuota: ['users', 'me', 'particular-quota'] as const,
  /**
   * CF4-25. The réparateur's « Demandes de devis » inbox. Its own key, like
   * `repairerDashboard`: each quote mutation invalidates it by name.
   */
  repairerQuoteRequests: ['quote-requests', 'mine'] as const,
  /**
   * CF4-24. The client's read-only « Demandes » tab. Deliberately NOT under `feedRoot`
   * (`['demandes', 'feed']`): a different route, a different DTO, and a réparateur's offer
   * must not refetch a client's browse list.
   */
  browseRoot: ['demandes-browse'] as const,
  browse: (params: BrowseQuery) => ['demandes-browse', params] as const,
  catalogBrands: (categoryId?: string | null) => ['catalog', 'brands', categoryId ?? null] as const,
  catalogModels: (brandId?: string | null, categoryId?: string | null) =>
    ['catalog', 'models', brandId ?? null, categoryId ?? null] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.get<CategoryDto[]>('/categories'),
    // Reference data seeded in a migration; it does not change during a session.
    staleTime: Infinity,
  });
}

/** CF5-05: Fetches active catalog brands, optionally filtered by category. */
export function useCatalogBrands(categoryId?: string | null) {
  const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
  return useQuery({
    queryKey: queryKeys.catalogBrands(categoryId),
    queryFn: () => api.get<PublicBrandDto[]>(`/brands${query}`),
    staleTime: 5 * 60 * 1000,
  });
}

/** CF5-05: Fetches active catalog device models for a brand, optionally filtered by category. */
export function useCatalogModels(brandId?: string | null, categoryId?: string | null) {
  const params: string[] = [];
  if (brandId) params.push(`brandId=${encodeURIComponent(brandId)}`);
  if (categoryId) params.push(`categoryId=${encodeURIComponent(categoryId)}`);
  const queryString = params.length > 0 ? `?${params.join('&')}` : '';

  return useQuery({
    queryKey: queryKeys.catalogModels(brandId, categoryId),
    queryFn: () => api.get<PublicDeviceModelDto[]>(`/models${queryString}`),
    enabled: Boolean(brandId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMyDemandes() {
  return useQuery({
    queryKey: queryKeys.myDemandes,
    queryFn: () => api.get<DemandeListItem[]>('/demandes/mine'),
  });
}

export function useDemande(id: string) {
  return useQuery({
    queryKey: queryKeys.demande(id),
    queryFn: () => api.get<DemandeDto>(`/demandes/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDemande() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDemandeInput) => api.post<DemandeDto>('/demandes', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
    },
  });
}

/**
 * `CF-16`. Invalidation is deliberately NARROW, and each omission is reasoned.
 *
 * `queryKeys.demande(id)` is `['demandes', id]`, a PREFIX of
 * `demandeOffers(id)` = `['demandes', id, 'offers']`, and TanStack matches by prefix - so this
 * one key refreshes the detail screen and that demande's offers together.
 *
 * NOT `feedRoot` and NOT `favoriteDemandes`: both collections exclude the author's own
 * demandes, so nothing of this author's is cached under either. Same reasoning that makes
 * `useCreateDemande` invalidate `myDemandes` alone.
 *
 * 🛑 NOT `myOffers`. That list belongs to the RÉPARATEUR, on another device; no client-side
 * invalidation can reach it. `DEMANDE_UPDATED` plus `listMine`'s demande filter handle his
 * side. Do not add it.
 *
 * 🛑 NOT `queryKeys.me`. The key exists but nothing queries it - the session is `useState` in
 * `SessionProvider` - so an invalidate on it is inert. Slice 16 recorded that as a Critical.
 */
export function useUpdateDemande(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDemandeInput) => api.patch<DemandeDto>(`/demandes/${id}`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.demande(id) });
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
    },
  });
}

/** `CF-17`. Same invalidation set and the same reasoning as `useUpdateDemande` above. */
export function useDeleteDemande(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.del(`/demandes/${id}`),
    onSuccess: () => {
      // REMOVE the demande from the cache rather than invalidating it - a refetch after a
      // delete is a guaranteed 404, and the edit screen is still mounted when onSuccess fires.
      // An update refetches the updated row; a delete removes it.
      client.removeQueries({ queryKey: queryKeys.demande(id) });
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
    },
  });
}

/**
 * CF4-27 (spec §4.2, I3). The pre-payment cancel: the demande is CANCELLED, not removed, so
 * unlike `useDeleteDemande` this INVALIDATES rather than removes - the edit/offers screens
 * re-fetch and read the demande as « Annulée » via `repairStatus`'s existing CANCELLED exit.
 */
export function useCancelDemande(demandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/demandes/${demandeId}/cancel`, {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.demande(demandeId) });
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
    },
  });
}

/**
 * CF4-27 (spec §4.2, §4.4). The post-payment request: `CreateCancellationRequestInput` in,
 * the updated `CommandeDto` cache seeded from the response's own `findOne` (the request route
 * itself returns only the request, not the commande - so this refetches rather than seeding,
 * the opposite of `useAdvanceStep`'s shape).
 */
export function useRequestCancellation(commandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCancellationRequestInput) =>
      api.post<CancellationRequestInfo>(`/commandes/${commandeId}/cancellation`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.commande(commandeId) });
      void client.invalidateQueries({ queryKey: queryKeys.commandesRoot });
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
    },
  });
}

export function useWithdrawCancellation(commandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>(`/commandes/${commandeId}/cancellation/withdraw`, {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.commande(commandeId) });
      void client.invalidateQueries({ queryKey: queryKeys.commandesRoot });
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
    },
  });
}

/**
 * Built by hand rather than with URLSearchParams: React Native's polyfill for
 * it is partial, and this needs three optional string params, which is not
 * worth the risk.
 *
 * A falsy value is omitted entirely, so a cleared search field sends no `q`
 * rather than `q=`, and the server sees the same request the FAB feed makes.
 */
function feedPath(params: FeedQuery): string {
  const parts: string[] = [];
  if (params.q) parts.push(`q=${encodeURIComponent(params.q)}`);
  if (params.categoryId) parts.push(`categoryId=${encodeURIComponent(params.categoryId)}`);
  if (params.sort) parts.push(`sort=${params.sort}`);
  if (params.matching) parts.push(`matching=${params.matching}`);
  return parts.length > 0 ? `/demandes/feed?${parts.join('&')}` : '/demandes/feed';
}

export function useFeed(params: FeedQuery = {}) {
  return useQuery({
    queryKey: queryKeys.feed(params),
    queryFn: () => api.get<FeedItem[]>(feedPath(params)),
    // Every keystroke is a new key, so without this the list would blank out
    // between requests. Keeps the previous results on screen while the next
    // ones load.
    placeholderData: (previous) => previous,
  });
}

export function useDemandeOffers(id: string) {
  return useQuery({
    queryKey: queryKeys.demandeOffers(id),
    queryFn: () => api.get<OfferDto[]>(`/demandes/${id}/offers`),
    enabled: Boolean(id),
  });
}

export function useMyOffers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.myOffers,
    queryFn: () => api.get<OfferListItem[]>('/offers/mine'),
    enabled,
  });
}

/**
 * `CF-11`. Every offer the client has received, across all of their demandes.
 *
 * 🛑 THIS HITS A ROUTE THAT MAY NOT EXIST ON THE SERVER THE APP IS POINTED AT. `AGENTS.md`
 * records the general form of this - a field added the same hour arrives `undefined` from a
 * stale API - and a whole ROUTE is the louder version: until this slice's API half is deployed,
 * `/offers/received` 404s. The screen therefore treats an error as an error and renders its
 * error state, rather than assuming an empty list means « no offers ».
 */
export function useReceivedOffers() {
  return useQuery({
    queryKey: queryKeys.receivedOffers,
    queryFn: () => api.get<ReceivedOfferListItem[]>('/offers/received'),
  });
}

/**
 * 🛑 THIS HITS A ROUTE THAT MAY NOT EXIST ON THE SERVER THE APP IS POINTED AT. Until this
 * slice's API half is deployed, `/favorites/*` 404s. So the screen must treat an error as an
 * error and render its error state - an empty list must never be shown for a failed request,
 * or « you have no favourites » becomes a lie about the world. Same note as
 * `useReceivedOffers`.
 */
export function useFavoriteRepairers() {
  return useQuery({
    queryKey: queryKeys.favoriteRepairers,
    queryFn: () => api.get<RepairerCardDto[]>('/favorites/repairers'),
  });
}

export function useFavoriteDemandes() {
  return useQuery({
    queryKey: queryKeys.favoriteDemandes,
    queryFn: () => api.get<FavoriteDemandeItem[]>('/favorites/demandes'),
  });
}

type ToggleRepairerVars = {
  userId: string;
  next: boolean;
  /**
   * The card to insert while the ADD is in flight, when the caller has one.
   *
   * 🛑 **OPTIONAL, AND NEVER SYNTHESISED FROM `userId`.** The cache holds `RepairerCardDto[]`, so
   * an optimistic insert needs a displayName, a rating, a reviewCount and a badge. Inventing any
   * of them would put a claim about a person on screen that nothing checked, which is the one
   * thing `apps/mobile/AGENTS.md` is most explicit about. Both add sites genuinely hold a real
   * card - the directory row has its `RepairerCardDto` and the fiche's `RepairerProfileDto`
   * extends it - so nothing is fabricated. Omit it and the add is simply not optimistic.
   */
  card?: RepairerCardDto;
};

/**
 * `CF-18`. One mutation for both directions, because the control is a toggle and the caller
 * knows only « it is now on » or « it is now off ».
 *
 * 🛑 NO SESSION REFRESH HERE. `useSessionContext()` returns `{ me, refresh }` and there is no
 * `useMe()` hook and no `['me']` invalidation path - a favourite changes no session field, so
 * invalidating the two list keys is the whole of it. A wrong refresh mechanism fails SILENTLY:
 * the write succeeds, the server changes, the heart keeps rendering its old state.
 *
 * ---------------------------------------------------------------------------------------------
 * 🛑 **OPTIMISTIC WITH A ROLLBACK, ADDED 2026-08-31. Neither toggle had an `onError` at all, and
 * the design §11 required « optimistic toggle with a rollback on failure ».** Three things were
 * wrong without it, and the third is the loud one:
 *
 * - the heart did not move until the write completed AND the invalidated list refetched, so a tap
 *   on a Paris round trip read as a control that ignored you;
 * - every authored French refusal was discarded - « Ce réparateur n'est pas disponible. »,
 *   « Vous ne pouvez pas enregistrer votre propre annonce. », « Cette annonce n'est plus
 *   disponible. » all reach the client and none of them was ever shown;
 * - **against the API deployed today every heart is a DEAD CONTROL**, because `/favorites/*` does
 *   not exist there yet, `PUT` 404s, and nothing caught it. `apps/mobile/AGENTS.md`: a button that
 *   silently does nothing reads as broken; say so in French instead.
 *
 * **Rollback lives here; the MESSAGE is the caller's job**, surfaced through the per-call
 * `onError` at each of the five toggle sites. `mutate`'s local callbacks do not replace the ones
 * on the hook - TanStack runs both - so this rollback holds whatever a caller adds.
 *
 * **Invalidation is on `onSuccess`, NOT `onSettled`.** `onSettled` is the usual shape, and it is
 * the wrong one here: after a failure the rollback has already restored the truth, and refetching
 * would fire a second request at the route that just 404'd. Nothing is left stale by skipping it.
 * ---------------------------------------------------------------------------------------------
 */
export function useToggleFavoriteRepairer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, next }: ToggleRepairerVars) =>
      next ? api.put(`/favorites/repairers/${userId}`) : api.del(`/favorites/repairers/${userId}`),
    onMutate: async ({ userId, next, card }) => {
      // Stop an in-flight refetch from landing on top of the optimistic value.
      await queryClient.cancelQueries({ queryKey: queryKeys.favoriteRepairers });
      const previous = queryClient.getQueryData<RepairerCardDto[]>(queryKeys.favoriteRepairers);
      // `undefined` means the list has never resolved - which is the state against the deployed
      // API, where the GET 404s too. There is nothing to update and nothing to roll back.
      if (previous !== undefined) {
        if (!next) {
          queryClient.setQueryData<RepairerCardDto[]>(
            queryKeys.favoriteRepairers,
            previous.filter((r) => r.userId !== userId),
          );
        } else if (card !== undefined) {
          // PREPEND: the server orders this list newest-saved first, so the head is where the row
          // the refetch returns will be. The filter keeps a re-tap from duplicating a row.
          queryClient.setQueryData<RepairerCardDto[]>(queryKeys.favoriteRepairers, [
            card,
            ...previous.filter((r) => r.userId !== card.userId),
          ]);
        }
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.favoriteRepairers, context.previous);
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.favoriteRepairers }),
  });
}

/**
 * The demande half. Same shape as the réparateur toggle above and the same reasoning, with ONE
 * deliberate asymmetry: there is no `item?: FavoriteDemandeItem` counterpart to that hook's
 * `card?`.
 *
 * 🛑 **The only place a demande is ADDED is the detail screen, which holds a `DemandeDto` - and
 * that is NOT a `FavoriteDemandeItem`.** The list type needs `categoryLabelFr`, `distanceKm`,
 * `offerCount`, `hasMyOffer` and a signed `photoUrl`, several of which are per-viewer aggregates
 * the detail read does not compute. Assembling one here would mean guessing them, so the add is
 * not optimistic and the invalidation fills the list in. An unused optional parameter would be
 * worse than the asymmetry: it would read as an option a caller could take.
 *
 * The REMOVE direction is fully optimistic, and it is the one that matters - every heart on
 * `/favoris` is a removal, and it is the list itself that has to react.
 */
export function useToggleFavoriteDemande() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ demandeId, next }: { demandeId: string; next: boolean }) =>
      next ? api.put(`/favorites/demandes/${demandeId}`) : api.del(`/favorites/demandes/${demandeId}`),
    onMutate: async ({ demandeId, next }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.favoriteDemandes });
      const previous = queryClient.getQueryData<FavoriteDemandeItem[]>(
        queryKeys.favoriteDemandes,
      );
      if (previous !== undefined && !next) {
        queryClient.setQueryData<FavoriteDemandeItem[]>(
          queryKeys.favoriteDemandes,
          previous.filter((d) => d.id !== demandeId),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.favoriteDemandes, context.previous);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.favoriteDemandes }),
  });
}

export function useCreateOffer(demandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOfferInput) =>
      api.post<OfferDto>(`/demandes/${demandeId}/offers`, input),
    onSuccess: () => {
      // The feed's hasMyOffer and offerCount both change, and so does the
      // réparateur's own list. Invalidate all three or the feed keeps showing
      // this demande as un-bid.
      void client.invalidateQueries({ queryKey: queryKeys.feedRoot });
      void client.invalidateQueries({ queryKey: queryKeys.myOffers });
      void client.invalidateQueries({ queryKey: queryKeys.demandeOffers(demandeId) });
      // CF4-26: the demande no longer counts as « correspond à vos services ».
      void client.invalidateQueries({ queryKey: queryKeys.repairerDashboard });
      // CF4-25: on a private request the quote stops the timer and answers the inbox row.
      void client.invalidateQueries({ queryKey: queryKeys.repairerQuoteRequests });
      void client.invalidateQueries({ queryKey: queryKeys.demande(demandeId) });
    },
  });
}

export function useStartPhoneVerification() {
  return useMutation({
    mutationFn: (phone: string) =>
      api.post<StartPhoneVerificationResponse>('/verification/phone/start', { phone }),
  });
}

export function useCheckPhoneVerification() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { phone: string; code: string }) =>
      api.post<MeResponse>('/verification/phone/check', input),
    onSuccess: () => {
      // The level changes, and the gate on both Publier and the offer form reads
      // it from the session. Without this the user verifies and stays blocked.
      void client.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useWithdrawOffer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => api.del(`/offers/${offerId}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.feedRoot });
      void client.invalidateQueries({ queryKey: queryKeys.myOffers });
      // CF4-26: a withdrawn offer makes its demande match again.
      void client.invalidateQueries({ queryKey: queryKeys.repairerDashboard });
    },
  });
}

/** The client declines an offer on one of their demandes (public or quote request). */
export function useDeclineOffer(demandeId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => api.post<{ ok: true }>(`/offers/${offerId}/decline`, {}),
    onSuccess: () => {
      if (demandeId) {
        void client.invalidateQueries({ queryKey: queryKeys.demandeOffers(demandeId) });
        void client.invalidateQueries({ queryKey: queryKeys.demande(demandeId) });
      }
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
      void client.invalidateQueries({ queryKey: queryKeys.receivedOffers });
    },
  });
}

export function useCommande(
  id: string,
  options?: {
    refetchInterval?:
      | number
      | false
      | ((query: { state: { data: CommandeDto | undefined } }) => number | false | undefined);
  },
) {
  return useQuery({
    queryKey: queryKeys.commande(id),
    queryFn: () => api.get<CommandeDto>(`/commandes/${id}`),
    enabled: Boolean(id),
    refetchInterval: options?.refetchInterval,
  });
}

export function useCreateCheckout(offerId: string) {
  return useMutation({
    mutationFn: (input: CreateCheckoutInput) =>
      api.post<CheckoutSessionResponse>(`/offers/${offerId}/checkout`, input),
    // Nothing is invalidated here on purpose. Creating a session changes no offer
    // and no demande - only paying does, and the app learns that when the deep
    // link lands on the confirmation screen.
  });
}

export function useConnectStatus(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.connectStatus,
    queryFn: () => api.get<ConnectStatusResponse>('/connect/status'),
    // The card is only rendered for a réparateur with the flag on, so there is
    // nothing to fetch otherwise.
    enabled,
  });
}

export function useStartConnectOnboarding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConnectOnboardingResponse>('/connect/onboarding', {}),
    // The status can only have changed via the webhook, but the row now exists, so
    // the not-started card must stop rendering.
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.connectStatus });
    },
  });
}

export function useIdentityStatus(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.identityStatus,
    queryFn: () => api.get<IdentityStatusResponse>('/identity/status'),
    enabled,
  });
}

export function useStartIdentitySession() {
  const client = useQueryClient();
  return useMutation({
    /**
     * The variant is explicit at every call site rather than defaulted here, so a new caller has
     * to decide which check it is starting. The server defaults an absent body to the selfie
     * check, which is what keeps build 6 working - but inside this app the choice is deliberate.
     */
    mutationFn: (input: { variant: IdentityVariant }) =>
      api.post<IdentitySessionResponse>('/identity/session', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.identityStatus });
    },
  });
}

export function useRequestIdentityErasure() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delJson<IdentityStatusResponse>('/identity/verification'),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.identityStatus });
    },
  });
}

export function useBusinessStatus(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.businessStatus,
    queryFn: () => api.get<BusinessStatusResponse>('/business/status'),
    enabled,
  });
}

export function useSubmitBusiness() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitBusinessVerificationInput) =>
      api.post<BusinessStatusResponse>('/business/submit', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.businessStatus });
      void client.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useLookupBusiness() {
  return useMutation({
    mutationFn: (identifier: string) =>
      api.post<LookupCompanyResponse>('/business/lookup', { identifier }),
  });
}

export function useVerifyBusiness() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (identifier: string) =>
      api.post<BusinessStatusResponse>('/business/verify', { identifier }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.businessStatus });
      // The level moved to BUSINESS, and the badge plus the Profil section read it
      // from /users/me.
      void client.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/**
 * `CF-25`. Replaces the réparateur's declared speciality set.
 *
 * Invalidates `me`, because `MeResponse.repairer.categoryIds` is what the profile row's count
 * and the picker's checkboxes both read - without this he saves and the screen he returns to
 * still shows the old set.
 *
 * 🛑 NO optimistic update, unlike the favourite hearts. A heart is one boolean and its own
 * control; this is a whole set behind an « Enregistrer » button, and the server NORMALISES it
 * (a root absorbs its children), so an optimistic write would show him a selection the server
 * is about to change. Wait for the response and render what came back.
 */
/**
 * `CF-25`. Saves the réparateur's declared categories.
 *
 * 🛑 `['me']` is NOT a refresh path in this app - `useSessionContext()` returns `{ me, refresh }`
 * and there is no `useMe()` hook. The invalidation below is kept but is inert. The CALLER must
 * `await refresh()` to reload the session. Without it, he saves and the screen he returns to
 * still shows the old set, and re-opening the picker seeds from the stale session so his
 * just-saved selection appears unchecked.
 */
export function useSetCategories() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRepairerCategoriesInput) =>
      api.putJson<MeResponse>('/users/me/categories', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.me });
      // CF4-26: the matching count and CATEGORIES_MISSING both follow his declaration.
      void client.invalidateQueries({ queryKey: queryKeys.repairerDashboard });
      void client.invalidateQueries({ queryKey: queryKeys.feedRoot });
    },
  });
}

export function useCommandes(role: 'client' | 'repairer', enabled = true) {
  return useQuery({
    queryKey: queryKeys.commandes(role),
    queryFn: () => api.get<CommandeListItem[]>(`/commandes?role=${role}`),
    enabled,
  });
}

/**
 * CF4-22/23/26 (sub-project G). `enabled` = `me.profile.repairerEnabled`: the route answers
 * FORBIDDEN otherwise, and a client-only account must not fire it.
 */
/** V7 A10 (U7). `quota` is null for a professional; an API older than U7 answers 404 (no data). */
export function useMyParticularQuota(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.myParticularQuota,
    queryFn: () => api.get<MyParticularQuotaResponse>('/users/me/particular-quota'),
    enabled,
  });
}

export function useRepairerDashboard(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.repairerDashboard,
    queryFn: () => api.get<RepairerDashboardDto>('/repairers/me/dashboard'),
    enabled,
  });
}

/**
 * CF5-15: Dismisses the « Votre activité · ce mois » home notification pill
 * by stamping the dashboard as inspected. Optimistically sets unseenTodoCount to 0.
 */
export function useMarkDashboardSeen() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>('/repairers/me/dashboard-seen', {}),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: queryKeys.repairerDashboard });
      const previous = client.getQueryData<RepairerDashboardDto>(queryKeys.repairerDashboard);
      if (previous) {
        client.setQueryData<RepairerDashboardDto>(queryKeys.repairerDashboard, {
          ...previous,
          unseenTodoCount: 0,
          todoSeenAt: new Date().toISOString(),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.repairerDashboard, context.previous);
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.repairerDashboard });
    },
  });
}

export function useAdvanceStep(commandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AdvanceStepInput) =>
      api.post<CommandeDto>(`/commandes/${commandeId}/steps`, input),
    onSuccess: (data) => {
      // Seed the detail cache from the response so the track redraws without a
      // refetch, then invalidate the lists, whose step label just changed.
      client.setQueryData(queryKeys.commande(commandeId), data);
      void client.invalidateQueries({ queryKey: queryKeys.commandesRoot });
      // CF4-22: « nécessite votre attention » may have just been done.
      void client.invalidateQueries({ queryKey: queryKeys.repairerDashboard });
    },
  });
}

export function useReleaseCommande(commandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CommandeDto>(`/commandes/${commandeId}/release`, {}),
    onSuccess: (data) => {
      client.setQueryData(queryKeys.commande(commandeId), data);
      void client.invalidateQueries({ queryKey: queryKeys.commandesRoot });
      // The demande reaches its terminal state, and the client's home list shows it.
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
    },
  });
}

export function useSubmitShippingAddress(commandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ShippingAddressInput) =>
      api.patch<CommandeDto>(`/commandes/${commandeId}/shipping-address`, input),
    onSuccess: (data) => {
      // Same shape as useAdvanceStep: seed the detail cache from the response so
      // the screen redraws without a refetch.
      client.setQueryData(queryKeys.commande(commandeId), data);
    },
  });
}

/**
 * Livraison Boxtal (spec §9.1). A MUTATION rather than a query: it persists a quote row and
 * the parcel details are typed, so it runs on « Calculer le prix », not on render.
 */
export function useShippingQuote(offerId: string) {
  return useMutation({
    mutationFn: (input: ShippingQuoteRequest) =>
      api.post<ShippingQuoteDto>(`/offers/${offerId}/shipping-quote`, input),
  });
}

/**
 * Livraison Boxtal (spec §9.2). Relay points around the caller's own address by default, or the
 * postal code typed in the picker. Disabled until the picker opens (`params === null`).
 */
export function useParcelPoints(commandeId: string, params: { postalCode?: string; city?: string } | null) {
  const qs = new URLSearchParams(
    Object.entries(params ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0),
  ).toString();
  return useQuery({
    queryKey: queryKeys.parcelPoints(commandeId, params ?? {}),
    queryFn: () => api.get<ParcelPointDto[]>(`/commandes/${commandeId}/parcel-points${qs ? `?${qs}` : ''}`),
    enabled: params !== null && commandeId.length > 0,
  });
}

/** One-hour signed URL for the label this party sends. Fetched on tap, never on render. */
export function useLabelUrl(commandeId: string) {
  return useMutation({
    mutationFn: (leg: ShipmentLeg) => api.get<{ url: string }>(`/commandes/${commandeId}/label?leg=${leg}`),
  });
}

export function useCreateReview(commandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReviewInput) =>
      api.post<{ ok: true }>(`/commandes/${commandeId}/review`, input),
    onSuccess: () => {
      // Invalidate rather than seed: the route answers `{ ok: true }` and not a
      // CommandeDto, so there is nothing to seed the detail cache with. What must
      // change is `reviewed`, which makes « Laisser un avis » disappear.
      void client.invalidateQueries({ queryKey: queryKeys.commande(commandeId) });
    },
  });
}

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: () => api.get<ConversationListItem[]>('/conversations'),
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: queryKeys.conversation(id),
    queryFn: () => api.get<ConversationDto>(`/conversations/${id}`),
    enabled: id.length > 0,
  });
}

/** Get-or-create. Called when opening a thread from an offer, not on every render. */
export function useOpenConversation() {
  return useMutation({
    mutationFn: (input: CreateConversationInput) =>
      api.post<{ id: string }>('/conversations', input),
  });
}

export function useSendMessage(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      api.post<MessageDto>(`/conversations/${conversationId}/messages`, input),
    onSuccess: () => {
      // The thread gains a bubble AND the inbox's preview, order and unread all
      // change. The prefix covers both, so neither can go stale on its own.
      void client.invalidateQueries({ queryKey: queryKeys.conversationsRoot });
    },
  });
}

export function useMarkRead(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch<void>(`/conversations/${conversationId}/read`, {}),
    onSuccess: () => {
      // Only the inbox's badge changes; the thread's own content does not.
      void client.invalidateQueries({ queryKey: queryKeys.conversations });
      void syncBadge();
    },
  });
}

/**
 * A report changes nothing the app renders - the queue is the operator's, and the
 * thread looks identical afterwards. So no invalidation: adding one would cost a
 * refetch to display the same bytes.
 */
export function useReportConversation(conversationId: string) {
  return useMutation({
    mutationFn: (input: ReportConversationInput) =>
      api.post<{ ok: true }>(`/conversations/${conversationId}/report`, input),
  });
}

/**
 * A block changes `blocked` on THIS thread and nothing on the inbox row, but the
 * prefix is used anyway: the composer's enabled state is the thing being changed, and
 * an under-invalidation here leaves a live composer over a closed channel until the
 * next focus refetch. Cheap to be broad; expensive to be subtle.
 */
export function useBlockUser(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBlockInput) => api.post<{ ok: true }>('/blocks', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.conversationsRoot });
    },
  });
}

export function useUnblockUser(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    // 204, so `api.del` returns void rather than a parsed body.
    mutationFn: (targetUserId: string) => api.del(`/blocks/${targetUserId}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.conversationsRoot });
    },
  });
}

/**
 * Built by hand rather than with URLSearchParams, for the same reason `feedPath` is:
 * React Native's polyfill is partial and this needs several optional string params.
 *
 * A falsy value is omitted entirely, so a cleared search field sends no `q` rather than
 * `q=` - and an unset sort sends NOTHING, which is what makes the server's
 * absent-equals-az behaviour reachable.
 *
 * 🆕 `CF-34`: `near`, `radiusKm` and `minRating`. Each is omitted when absent for the same
 * reason as the others, and two of them MUST be: the schema refuses `radiusKm` or
 * `sort=distance` without `near` with a 400, so sending an empty `radiusKm=` would turn
 * « Partout » into a refused request.
 */
function directoryPath(params: DirectoryQuery): string {
  const parts: string[] = [];
  if (params.q) parts.push(`q=${encodeURIComponent(params.q)}`);
  if (params.categoryId) parts.push(`categoryId=${encodeURIComponent(params.categoryId)}`);
  if (params.sort) parts.push(`sort=${params.sort}`);
  if (params.near) parts.push(`near=${encodeURIComponent(params.near)}`);
  if (params.radiusKm) parts.push(`radiusKm=${params.radiusKm}`);
  if (params.minRating) parts.push(`minRating=${params.minRating}`);
  return parts.length > 0 ? `/repairers?${parts.join('&')}` : '/repairers';
}

export function useRepairers(params: DirectoryQuery = {}) {
  return useQuery({
    // 🆕 `CF-34`: `queryKeys.repairers` already keys on the whole params object, so the three
    // new members are part of the key with no change here.
    queryKey: queryKeys.repairers(params),
    queryFn: () => api.get<DirectoryCardDto[]>(directoryPath(params)),
    // Every keystroke is a new key, so without this the list blanks between requests.
    placeholderData: (previous) => previous,
  });
}

export function useRepairersVerified() {
  return useQuery({
    queryKey: queryKeys.repairersVerified,
    queryFn: () => api.get<RepairerProfileDto[]>('/repairers/verified'),
  });
}

export function useDailyTip(category: 'CLIENT' | 'REPAIRER' | 'ALL') {
  return useQuery({
    queryKey: ['dailyTip', category],
    queryFn: () => api.get<DailyTipDto | null>(`/tips/daily?category=${category}`),
  });
}

export function useRepairer(userId: string) {
  return useQuery({
    queryKey: queryKeys.repairer(userId),
    queryFn: () => api.get<RepairerProfileDto>(`/repairers/${userId}`),
    enabled: Boolean(userId),
  });
}

/**
 * UNBOUNDED by design: the profile's five-star histogram is computed from this whole
 * array. Paginating it would mean moving the distribution into the aggregate - the swap
 * point Étape 5 §4.4a records.
 */
export function useRepairerReviews(userId: string) {
  return useQuery({
    queryKey: queryKeys.repairerReviews(userId),
    queryFn: () => api.get<ReviewDto[]>(`/repairers/${userId}/reviews`),
    enabled: Boolean(userId),
  });
}

export function useUpdateRepairerProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRepairerProfileInput) =>
      api.patch<MeResponse>('/users/me/repairer-profile', input),
    onSuccess: () => {
      // `me` because the route returns MeResponse and the form seeds from it;
      // repairersRoot because a rename changes his card in every directory variant
      // and his own public profile at once.
      void client.invalidateQueries({ queryKey: queryKeys.me });
      void client.invalidateQueries({ queryKey: queryKeys.repairersRoot });
    },
  });
}

/**
 * `CF-52`. Replaces his whole week.
 *
 * 🛑 THE INVALIDATIONS HERE ARE NOT ENOUGH ON THEIR OWN, and that is documented rather than
 * assumed: `queryKeys.me` has FOUR invalidations in this file and ZERO `useQuery` registrations,
 * so invalidating it is INERT. The session lives in `SessionProvider`'s `useState`. The calling
 * screen must `await refresh()`. `repairersRoot` is real - his fiche renders these hours.
 */
export function useSetAvailability() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAvailabilityInput) =>
      // `putJson`, NOT `put`. `api.put` is BODYLESS - `put: (path) => callNoContent(...)` - and
      // exists for the two `/favorites` routes that answer 204. `putJson` is the one `CF-25`
      // added for a PUT whose body IS the new state, and `/users/me/categories` is its only
      // caller today. Verified in `src/lib/api.ts` before this plan was executed.
      api.putJson<MeResponse>('/users/me/availability', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.repairersRoot });
    },
  });
}

export function useNotifications(mode: NotificationQuery['mode']) {
  return useQuery({
    queryKey: queryKeys.notifications(mode),
    queryFn: () => api.get<NotificationDto[]>(`/notifications?mode=${mode}`),
  });
}

/**
 * What the bell reads. Its own endpoint rather than `useNotifications(mode).data.length`:
 * the bell lives on Accueil, which never loads the list, and pulling 50 rows to render a
 * dot would be the wrong trade on a free-plan API.
 *
 * NO `refetchInterval`, deliberately. `query.tsx` drives `refetchOnWindowFocus` off
 * AppState, so this refreshes when the app is foregrounded, on pull-to-refresh, and after
 * any read. A timer would poll for every open app to update a badge on a screen the user
 * is not looking at. See the design §7.1.
 */
export function useUnreadNotifications(mode: NotificationQuery['mode']) {
  return useQuery({
    queryKey: queryKeys.notificationsUnread(mode),
    queryFn: () => api.get<{ count: number }>(`/notifications/unread-count?mode=${mode}`),
  });
}

/**
 * NOT named `useMarkRead`: that name is already taken by the messaging inbox's
 * per-conversation read stamp, and two hooks with one name in this file would be a bug
 * waiting for whoever imports the wrong one.
 *
 * `api.post<void>` against a 204 is the established convention here - `call` parses the
 * body inside a `.catch(() => null)`, so an empty response resolves to null and the void
 * return type is honest. `useMarkRead` above already does exactly this.
 */
export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<void>(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      // The prefix, so the row's dot and the bell's dot change together.
      void client.invalidateQueries({ queryKey: queryKeys.notificationsRoot });
      void syncBadge();
    },
  });
}

export function useMarkAllNotificationsRead(mode: NotificationQuery['mode']) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`/notifications/read-all?mode=${mode}`, {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notificationsRoot });
      void syncBadge();
    },
  });
}

/* ------------------------------------------------------------------------------------------
 * CF4 sub-project H. 🛑 Every route below may not exist on the server the app is pointed at
 * until the H API half is deployed, so each screen renders its error state on an error and
 * never reads a failed request as « nothing here ». Same note as `useReceivedOffers`.
 * ---------------------------------------------------------------------------------------- */

/** CF4-25. The client sends a private « Demander un devis » to one réparateur. */
export function useCreateQuoteRequest(repairerId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuoteRequestInput) =>
      api.post<DemandeDto>(`/repairers/${repairerId}/quote-requests`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
    },
  });
}

/** CF4-25. The réparateur's « Demandes de devis » inbox. */
export function useRepairerQuoteRequests(enabled = true) {
  return useQuery({
    queryKey: queryKeys.repairerQuoteRequests,
    queryFn: () => api.get<RepairerQuoteRequestItem[]>('/repairers/me/quote-requests'),
    enabled,
  });
}

/**
 * The three transitions share one invalidation set: the detail (prefix, so its offers too),
 * both sides' lists, and the réparateur dashboard's « À faire » count. A client mutation
 * cannot reach the réparateur's cache on his device; the notification covers that.
 */
function useQuoteTransition<TInput>(demandeId: string, path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      api.post<{ ok: true }>(`/demandes/${demandeId}/quote/${path}`, input ?? {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.demande(demandeId) });
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
      void client.invalidateQueries({ queryKey: queryKeys.repairerQuoteRequests });
      void client.invalidateQueries({ queryKey: queryKeys.repairerDashboard });
      void client.invalidateQueries({ queryKey: queryKeys.receivedOffers });
      void client.invalidateQueries({ queryKey: queryKeys.myOffers });
      // CF6-12: Invalidate conversations so cancellation system message appears in inbox & active threads.
      void client.invalidateQueries({ queryKey: queryKeys.conversationsRoot });
    },
    onError: () => {
      // CF6-13: If a quote transition fails because server state already moved,
      // refresh the request, repairer list, and client demandes caches so UI updates to actual status.
      void client.invalidateQueries({ queryKey: queryKeys.demande(demandeId) });
      void client.invalidateQueries({ queryKey: queryKeys.repairerQuoteRequests });
      void client.invalidateQueries({ queryKey: queryKeys.myDemandes });
    },
  });
}

/** Réparateur: « Refuser la demande », with a reason shown to the client. */
export function useDeclineQuote(demandeId: string) {
  return useQuoteTransition<DeclineQuoteRequestInput>(demandeId, 'decline');
}

/** Client: « Refuser » the quote he received. */
export function useRefuseQuote(demandeId: string) {
  return useQuoteTransition<void>(demandeId, 'refuse');
}

/** Client: « Annuler la demande ». */
export function useCancelQuote(demandeId: string) {
  return useQuoteTransition<void>(demandeId, 'cancel');
}

/** Hand-built for the same reason as `feedPath`: RN's URLSearchParams polyfill is partial. */
function browsePath(params: BrowseQuery): string {
  const parts: string[] = [];
  if (params.q) parts.push(`q=${encodeURIComponent(params.q)}`);
  if (params.categoryId) parts.push(`categoryId=${encodeURIComponent(params.categoryId)}`);
  if (params.page) parts.push(`page=${params.page}`);
  return parts.length > 0 ? `/demandes/browse?${parts.join('&')}` : '/demandes/browse';
}

/** CF4-24. The client's read-only « Demandes » search tab. */
export function useBrowseDemandes(params: BrowseQuery = {}) {
  return useQuery({
    queryKey: queryKeys.browse(params),
    queryFn: () => api.get<PublicDemandeView[]>(browsePath(params)),
    placeholderData: (previous) => previous,
  });
}

/* ------------------------------------------------------------------------------------------
 * CF4 sub-projects J + K (Disputes & Push Polish)
 * ---------------------------------------------------------------------------------------- */

/** CF4-31. Fetches confidential dispute details and messages for the current user's role. */
export function usePartyDispute(commandeId: string) {
  return useQuery({
    queryKey: queryKeys.dispute(commandeId),
    queryFn: () => api.get<PartyDisputeDto>(`/commandes/${commandeId}/dispute`),
    enabled: Boolean(commandeId),
  });
}

/** CF4-28. Opens a dispute from the order as either client or repairer. */
export function useOpenDispute(commandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: OpenDisputeByPartyInput) =>
      api.post<{ number: number; reference: string }>(`/commandes/${commandeId}/dispute`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.commande(commandeId) });
      void client.invalidateQueries({ queryKey: queryKeys.commandesRoot });
      void client.invalidateQueries({ queryKey: queryKeys.dispute(commandeId) });
      void client.invalidateQueries({ queryKey: queryKeys.conversationsRoot });
    },
  });
}

/** CF4-31. Sends a message in the caller's confidential dispute space. */
export function useSendDisputeMessage(commandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SendDisputeMessageInput) =>
      api.post<DisputeMessageDto>(`/commandes/${commandeId}/dispute/messages`, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.dispute(commandeId) });
    },
  });
}

/** CF4-31/35. Marks the user's dispute space read and resyncs the badge. */
export function useMarkDisputeRead(commandeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`/commandes/${commandeId}/dispute/read`, {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.dispute(commandeId) });
      void client.invalidateQueries({ queryKey: queryKeys.commande(commandeId) });
      void client.invalidateQueries({ queryKey: queryKeys.commandesRoot });
      void client.invalidateQueries({ queryKey: queryKeys.conversationsRoot });
      void syncBadge();
    },
  });
}

/** CF4-31/34. Signs an attachment upload for a dispute space or creation form. */
export function useSignDisputeUpload(commandeId: string) {
  return useMutation({
    mutationFn: (input: SignAttachmentInput) =>
      api.post<{ path: string; uploadUrl: string }>(`/commandes/${commandeId}/dispute/attachments/sign`, input),
  });
}

/** CF4-34. Signs an attachment upload (photo or PDF) for a conversation. */
export function useSignConversationAttachment(conversationId: string) {
  return useMutation({
    mutationFn: (input: SignAttachmentInput) =>
      api.post<{ path: string; uploadUrl: string }>(`/conversations/${conversationId}/attachments/sign`, input),
  });
}

/** CMP-D2. Pre-fill data for annual fiscal declaration. */
export function useFiscalPreFill(enabled = true) {
  return useQuery({
    queryKey: queryKeys.fiscalPreFill,
    queryFn: () => api.get<FiscalPreFillResponse>('/users/me/fiscal'),
    enabled,
  });
}

/** CMP-D2. Submits annual fiscal declaration (DAC7). */
export function useSubmitFiscalDeclaration() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: FiscalDeclarationInput) =>
      api.putJson<FiscalPreFillResponse>('/users/me/fiscal', input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.fiscalPreFill });
      void client.invalidateQueries({ queryKey: queryKeys.me });
      void client.invalidateQueries({ queryKey: ['commandes'] });
    },
  });
}
