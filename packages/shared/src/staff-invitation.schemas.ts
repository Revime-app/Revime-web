import { z } from 'zod';
import { adminRoleSchema, type AdminRole } from './admin-permissions.js';

export const inviteStaffInputSchema = z.object({
  email: z.string().trim().email('Adresse e-mail invalide.').toLowerCase(),
  role: adminRoleSchema,
  firstName: z.string().trim().min(1, 'Le prénom est requis.').max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
});
export type InviteStaffInput = z.infer<typeof inviteStaffInputSchema>;

export const acceptStaffInvitationInputSchema = z.object({
  token: z.string().min(32, "Jeton d'invitation invalide."),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.').max(128),
  firstName: z.string().trim().min(1, 'Le prénom est requis.').max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
});
export type AcceptStaffInvitationInput = z.infer<typeof acceptStaffInvitationInputSchema>;

export type StaffInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export type StaffInvitationItem = {
  id: string;
  email: string;
  role: AdminRole;
  firstName: string | null;
  lastName: string | null;
  invitedBy: {
    id: string;
    name: string | null;
    email: string;
  };
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: StaffInvitationStatus;
  createdAt: string;
};

export type StaffInvitationsListResponse = {
  items: StaffInvitationItem[];
  total: number;
};

export type VerifyStaffInvitationResponse = {
  valid: boolean;
  email: string;
  role: AdminRole;
  firstName: string | null;
  lastName: string | null;
  isExistingUser: boolean;
};

export const staffMemberItemSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  role: adminRoleSchema,
  twoFactorEnabled: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable().optional(),
});
export type StaffMemberItem = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  role: AdminRole;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
};

export const adminStaffListQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type AdminStaffListQuery = z.infer<typeof adminStaffListQuerySchema>;

export const adminStaffListResponseSchema = z.object({
  items: z.array(z.custom<StaffMemberItem>()),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type AdminStaffListResponse = z.infer<typeof adminStaffListResponseSchema>;

