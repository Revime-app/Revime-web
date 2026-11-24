import { z } from 'zod';

export const adminConversationStatusFilterSchema = z.enum(['all', 'open', 'closed']);
export type AdminConversationStatusFilter = z.infer<typeof adminConversationStatusFilterSchema>;

export const adminConversationListQuerySchema = z.object({
  q: z
    .string()
    .default('')
    .transform((s) => s.trim().slice(0, 100)),
  status: adminConversationStatusFilterSchema.default('all'),
  hasDispute: z.enum(['all', 'true', 'false']).default('all'),
  hasReport: z.enum(['all', 'true', 'false']).default('all'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminConversationListQuery = z.infer<typeof adminConversationListQuerySchema>;

export const adminConversationSummaryItemSchema = z.object({
  id: z.string().uuid(),
  demande: z
    .object({
      id: z.string(),
      title: z.string(),
      status: z.string().optional(),
    })
    .nullable(),
  client: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable().optional(),
  }),
  repairer: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    companyName: z.string().nullable().optional(),
  }),
  messagesCount: z.number().int().nonnegative(),
  lastMessage: z
    .object({
      id: z.string(),
      body: z.string(),
      senderName: z.string(),
      createdAt: z.string().datetime(),
      isSystem: z.boolean(),
    })
    .nullable(),
  lastMessageAt: z.string().datetime().nullable(),
  closed: z.boolean(),
  hasDispute: z.boolean(),
  hasReport: z.boolean(),
  disputeId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type AdminConversationSummaryItem = z.infer<typeof adminConversationSummaryItemSchema>;

export const adminConversationMessageItemSchema = z.object({
  id: z.string(),
  senderId: z.string().nullable(),
  senderName: z.string(),
  senderRole: z.enum(['CLIENT', 'REPAIRER', 'SYSTEM', 'ADMIN']),
  body: z.string(),
  kind: z.enum(['USER', 'SYSTEM', 'SUPPORT']),
  photoUrl: z.string().nullable().optional(),
  documentUrl: z.string().nullable().optional(),
  documentName: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  deleted: z.boolean(),
  deletedAt: z.string().datetime().nullable().optional(),
});
export type AdminConversationMessageItem = z.infer<typeof adminConversationMessageItemSchema>;

export const adminConversationDetailResponseSchema = z.object({
  id: z.string().uuid(),
  demande: z
    .object({
      id: z.string(),
      title: z.string(),
      status: z.string().optional(),
      categoryLabel: z.string().nullable().optional(),
      budgetCents: z.number().int().nonnegative().nullable().optional(),
    })
    .nullable(),
  client: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable().optional(),
    avatarUrl: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
  }),
  repairer: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable().optional(),
    companyName: z.string().nullable().optional(),
    avatarUrl: z.string().nullable().optional(),
    verified: z.boolean(),
  }),
  commande: z
    .object({
      id: z.string(),
      status: z.string(),
      totalCents: z.number().int().nonnegative(),
      disputeId: z.string().nullable().optional(),
    })
    .nullable(),
  closed: z.boolean(),
  closedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reportsCount: z.number().int().nonnegative(),
  messages: z.array(adminConversationMessageItemSchema),
});
export type AdminConversationDetailResponse = z.infer<typeof adminConversationDetailResponseSchema>;

export const adminConversationKpisSchema = z.object({
  total: z.number().int().nonnegative(),
  activeCount: z.number().int().nonnegative(),
  closedCount: z.number().int().nonnegative(),
  withDisputeCount: z.number().int().nonnegative(),
  withReportCount: z.number().int().nonnegative(),
});
export type AdminConversationKpis = z.infer<typeof adminConversationKpisSchema>;

export const adminConversationListResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(adminConversationSummaryItemSchema),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  kpis: adminConversationKpisSchema,
});
export type AdminConversationListResponse = z.infer<typeof adminConversationListResponseSchema>;
