import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { __setMailSender, type Mail } from '../src/mail/mail.service.js';
import { AppException } from '../src/common/app-exception.js';
import { AdminStaffInvitationsService } from '../src/admin/admin-staff-invitations.service.js';
import { verifyPassword } from 'better-auth/crypto';

describe('AdminStaffInvitationsService', () => {
  let capturedMails: Mail[] = [];
  const fakeMailSender = {
    send: vi.fn().mockImplementation(async (mail: Mail) => {
      capturedMails.push(mail);
    }),
  };

  beforeEach(() => {
    capturedMails = [];
    fakeMailSender.send.mockClear();
    __setMailSender(fakeMailSender);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T12:00:00.000Z'));
  });

  afterEach(() => {
    __setMailSender(undefined);
    vi.useRealTimers();
  });

  function makeService(prismaMock: any) {
    return new AdminStaffInvitationsService(prismaMock);
  }

  describe('createInvitation', () => {
    it('creates a new staff invitation, revokes any pending ones for the same email, and sends an email', async () => {
      const email = 'newstaff@revime.fr';
      const actorId = 'actor-super-admin-1';

      const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
      const createMock = vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 'inv-123',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const txMock = {
        staffInvitation: {
          updateMany: updateManyMock,
          create: createMock,
        },
      };

      const userFindUniqueMock = vi.fn().mockImplementation(async ({ where }: any) => {
        if (where.email === email) return null; // No existing user
        if (where.id === actorId) return { id: actorId, name: 'Alice Admin', firstName: 'Alice', email: 'alice@revime.fr' };
        return null;
      });

      const transactionMock = vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(txMock));

      const prismaMock = {
        user: {
          findUnique: userFindUniqueMock,
        },
        $transaction: transactionMock,
      };

      const service = makeService(prismaMock);
      const res = await service.createInvitation(actorId, {
        email,
        role: 'moderation',
        firstName: 'Bob',
        lastName: 'Mod',
      });

      expect(res).toEqual({ ok: true, id: 'inv-123' });

      // Pending invitations revoked
      expect(updateManyMock).toHaveBeenCalledWith({
        where: {
          email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date('2026-10-03T12:00:00.000Z'),
        },
      });

      // Invitation persisted
      expect(createMock).toHaveBeenCalledTimes(1);
      const createdData = createMock.mock.calls[0]![0].data;
      expect(createdData.email).toBe(email);
      expect(createdData.role).toBe('moderation');
      expect(createdData.firstName).toBe('Bob');
      expect(createdData.lastName).toBe('Mod');
      expect(createdData.invitedById).toBe(actorId);
      expect(createdData.tokenHash).toHaveLength(64);
      expect(createdData.expiresAt).toEqual(new Date('2026-10-10T12:00:00.000Z')); // +7 days

      // Email sent
      expect(capturedMails).toHaveLength(1);
      expect(capturedMails[0]!.to).toBe(email);
      expect(capturedMails[0]!.subject).toBe("Invitation à rejoindre l'équipe REVIME");
      expect(capturedMails[0]!.text).toContain("Modération");
      expect(capturedMails[0]!.text).toContain("Bonjour Bob,");
      expect(capturedMails[0]!.text).toContain("invitation?token=");
    });

    it('throws CONFLICT if user with email already exists with an active staff role', async () => {
      const email = 'existing-staff@revime.fr';
      const actorId = 'actor-super-admin-1';

      const prismaMock = {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'staff-user-1',
            email,
            role: 'support',
          }),
        },
      };

      const service = makeService(prismaMock);
      const err = await service.createInvitation(actorId, {
        email,
        role: 'admin',
      }).catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('CONFLICT');
      expect((err as AppException).message).toBe("Cet utilisateur fait déjà partie de l'équipe.");
      expect(capturedMails).toHaveLength(0);
    });

    it('allows inviting an existing non-staff user (e.g. role is null)', async () => {
      const email = 'client@gmail.com';
      const actorId = 'actor-super-admin-1';

      const txMock = {
        staffInvitation: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({ id: 'inv-456' }),
        },
      };

      const prismaMock = {
        user: {
          findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
            if (where.email === email) return { id: 'client-1', email, role: null };
            if (where.id === actorId) return { id: actorId, name: 'Alice Admin', firstName: 'Alice', email: 'alice@revime.fr' };
            return null;
          }),
        },
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(txMock)),
      };

      const service = makeService(prismaMock);
      const res = await service.createInvitation(actorId, {
        email,
        role: 'support',
      });

      expect(res).toEqual({ ok: true, id: 'inv-456' });
      expect(capturedMails).toHaveLength(1);
    });
  });

  describe('listInvitations', () => {
    it('returns formatted invitations with derived statuses (ACCEPTED, REVOKED, EXPIRED, PENDING)', async () => {
      const invitations = [
        {
          id: 'inv-1',
          email: 'pending@revime.fr',
          role: 'admin',
          firstName: 'Paul',
          lastName: 'Dupont',
          invitedBy: { id: 'admin-1', name: 'Super Admin', email: 'sa@revime.fr' },
          expiresAt: new Date('2026-10-08T12:00:00.000Z'),
          acceptedAt: null,
          revokedAt: null,
          createdAt: new Date('2026-10-01T12:00:00.000Z'),
        },
        {
          id: 'inv-2',
          email: 'accepted@revime.fr',
          role: 'finance',
          firstName: 'Marie',
          lastName: 'Curie',
          invitedBy: { id: 'admin-1', name: 'Super Admin', email: 'sa@revime.fr' },
          expiresAt: new Date('2026-10-08T12:00:00.000Z'),
          acceptedAt: new Date('2026-10-02T10:00:00.000Z'),
          revokedAt: null,
          createdAt: new Date('2026-10-01T12:00:00.000Z'),
        },
        {
          id: 'inv-3',
          email: 'revoked@revime.fr',
          role: 'support',
          firstName: null,
          lastName: null,
          invitedBy: { id: 'admin-1', name: 'Super Admin', email: 'sa@revime.fr' },
          expiresAt: new Date('2026-10-08T12:00:00.000Z'),
          acceptedAt: null,
          revokedAt: new Date('2026-10-02T15:00:00.000Z'),
          createdAt: new Date('2026-10-01T12:00:00.000Z'),
        },
        {
          id: 'inv-4',
          email: 'expired@revime.fr',
          role: 'moderation',
          firstName: 'Jean',
          lastName: null,
          invitedBy: { id: 'admin-1', name: 'Super Admin', email: 'sa@revime.fr' },
          expiresAt: new Date('2026-10-02T12:00:00.000Z'), // in past
          acceptedAt: null,
          revokedAt: null,
          createdAt: new Date('2026-09-25T12:00:00.000Z'),
        },
      ];

      const prismaMock = {
        staffInvitation: {
          findMany: vi.fn().mockResolvedValue(invitations),
        },
      };

      const service = makeService(prismaMock);
      const res = await service.listInvitations();

      expect(res.total).toBe(4);
      expect(res.items).toHaveLength(4);
      expect(res.items[0]!.status).toBe('PENDING');
      expect(res.items[1]!.status).toBe('ACCEPTED');
      expect(res.items[2]!.status).toBe('REVOKED');
      expect(res.items[3]!.status).toBe('EXPIRED');
    });
  });

  describe('listMembers', () => {
    it('returns only users with active staff roles and not deleted', async () => {
      const users = [
        {
          id: 'u-1',
          email: 'super@revime.fr',
          name: 'Super Admin',
          firstName: 'Super',
          lastName: 'Admin',
          role: 'super_admin',
          twoFactorEnabled: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'u-2',
          email: 'support@revime.fr',
          name: 'Support Agent',
          firstName: 'Support',
          lastName: 'Agent',
          role: 'support',
          twoFactorEnabled: false,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        {
          id: 'u-3',
          email: 'random@gmail.com',
          name: 'Regular Client',
          firstName: null,
          lastName: null,
          role: 'invalid_or_unknown_role',
          twoFactorEnabled: false,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      ];

      const prismaMock = {
        user: {
          count: vi.fn().mockResolvedValue(2),
          findMany: vi.fn().mockResolvedValue(users),
        },
        session: {
          groupBy: vi.fn().mockResolvedValue([
            { userId: 'u-1', _max: { createdAt: new Date('2026-10-10T12:00:00.000Z') } },
          ]),
        },
      };

      const service = makeService(prismaMock);
      const res = await service.listMembers();

      expect(res.items).toHaveLength(2);
      expect(res.total).toBe(2);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(20);
      expect(res.items[0]!.id).toBe('u-1');
      expect(res.items[0]!.role).toBe('super_admin');
      expect(res.items[0]!.twoFactorEnabled).toBe(true);
      expect(res.items[0]!.lastLoginAt).toBe('2026-10-10T12:00:00.000Z');
      expect(res.items[1]!.id).toBe('u-2');
      expect(res.items[1]!.role).toBe('support');
      expect(res.items[1]!.twoFactorEnabled).toBe(false);
      expect(res.items[1]!.lastLoginAt).toBeNull();
    });
  });

  describe('revokeInvitation', () => {
    it('revokes an active invitation', async () => {
      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'inv-1',
            acceptedAt: null,
            revokedAt: null,
          }),
          update: vi.fn().mockResolvedValue({ id: 'inv-1' }),
        },
      };

      const service = makeService(prismaMock);
      const res = await service.revokeInvitation('actor-1', 'inv-1');

      expect(res).toEqual({ ok: true });
      expect(prismaMock.staffInvitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { revokedAt: new Date('2026-10-03T12:00:00.000Z') },
      });
    });

    it('throws NOT_FOUND if invitation does not exist', async () => {
      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      const service = makeService(prismaMock);
      const err = await service.revokeInvitation('actor-1', 'non-existent').catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('NOT_FOUND');
    });

    it('throws UNPROCESSABLE_ENTITY if invitation is already accepted', async () => {
      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'inv-1',
            acceptedAt: new Date(),
            revokedAt: null,
          }),
        },
      };

      const service = makeService(prismaMock);
      const err = await service.revokeInvitation('actor-1', 'inv-1').catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('UNPROCESSABLE_ENTITY');
      expect((err as AppException).message).toBe('Cette invitation a déjà été acceptée.');
    });

    it('throws UNPROCESSABLE_ENTITY if invitation is already revoked', async () => {
      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'inv-1',
            acceptedAt: null,
            revokedAt: new Date(),
          }),
        },
      };

      const service = makeService(prismaMock);
      const err = await service.revokeInvitation('actor-1', 'inv-1').catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('UNPROCESSABLE_ENTITY');
      expect((err as AppException).message).toBe('Cette invitation a déjà été révoquée.');
    });
  });

  describe('resendInvitation', () => {
    it('revokes existing invitation, creates a new one, and sends email', async () => {
      const actorId = 'actor-super-admin-1';
      const invitationId = 'inv-old';

      const existingInv = {
        id: invitationId,
        email: 'staff@revime.fr',
        role: 'finance',
        firstName: 'Fifi',
        lastName: 'Nance',
        acceptedAt: null,
        revokedAt: null,
      };

      const updateMock = vi.fn().mockResolvedValue({ id: invitationId });
      const createMock = vi.fn().mockImplementation(async ({ data }: any) => ({
        id: 'inv-new',
        ...data,
      }));

      const txMock = {
        staffInvitation: {
          update: updateMock,
          create: createMock,
        },
      };

      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(existingInv),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: actorId,
            name: 'Super Admin',
            firstName: 'Super',
            email: 'super@revime.fr',
          }),
        },
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(txMock)),
      };

      const service = makeService(prismaMock);
      const res = await service.resendInvitation(actorId, invitationId);

      expect(res).toEqual({ ok: true });
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: invitationId },
        data: { revokedAt: new Date('2026-10-03T12:00:00.000Z') },
      });
      expect(createMock).toHaveBeenCalledTimes(1);
      const newInvData = createMock.mock.calls[0]![0].data;
      expect(newInvData.email).toBe('staff@revime.fr');
      expect(newInvData.role).toBe('finance');
      expect(newInvData.firstName).toBe('Fifi');
      expect(newInvData.lastName).toBe('Nance');
      expect(newInvData.invitedById).toBe(actorId);

      expect(capturedMails).toHaveLength(1);
      expect(capturedMails[0]!.to).toBe('staff@revime.fr');
      expect(capturedMails[0]!.text).toContain('Finance');
    });

    it('throws NOT_FOUND if invitation is not found', async () => {
      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      const service = makeService(prismaMock);
      const err = await service.resendInvitation('actor-1', 'inv-none').catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('NOT_FOUND');
    });

    it('throws UNPROCESSABLE_ENTITY if invitation is already accepted', async () => {
      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'inv-1',
            acceptedAt: new Date(),
          }),
        },
      };

      const service = makeService(prismaMock);
      const err = await service.resendInvitation('actor-1', 'inv-1').catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('UNPROCESSABLE_ENTITY');
    });
  });

  describe('verifyToken', () => {
    const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    it('returns invitation details when token is valid and unexpired', async () => {
      const invitation = {
        id: 'inv-1',
        email: 'invited@revime.fr',
        role: 'support',
        firstName: 'Sophie',
        lastName: 'Martin',
        tokenHash,
        expiresAt: new Date('2026-10-09T12:00:00.000Z'),
        acceptedAt: null,
        revokedAt: null,
      };

      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(invitation),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(null), // new user
        },
      };

      const service = makeService(prismaMock);
      const res = await service.verifyToken(rawToken);

      expect(res).toEqual({
        valid: true,
        email: 'invited@revime.fr',
        role: 'support',
        firstName: 'Sophie',
        lastName: 'Martin',
        isExistingUser: false,
      });
    });

    it('flags isExistingUser: true if a user with that email already exists', async () => {
      const invitation = {
        id: 'inv-1',
        email: 'existing@revime.fr',
        role: 'admin',
        firstName: 'Sophie',
        lastName: 'Martin',
        tokenHash,
        expiresAt: new Date('2026-10-09T12:00:00.000Z'),
        acceptedAt: null,
        revokedAt: null,
      };

      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(invitation),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: 'user-existing-1' }),
        },
      };

      const service = makeService(prismaMock);
      const res = await service.verifyToken(rawToken);

      expect(res.isExistingUser).toBe(true);
    });

    it('throws NOT_FOUND if token not found or revoked', async () => {
      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      const service = makeService(prismaMock);
      const err = await service.verifyToken(rawToken).catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('NOT_FOUND');
    });

    it('throws GONE (410) if invitation is already accepted', async () => {
      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'inv-1',
            tokenHash,
            expiresAt: new Date('2026-10-09T12:00:00.000Z'),
            acceptedAt: new Date('2026-10-02T12:00:00.000Z'),
            revokedAt: null,
          }),
        },
      };

      const service = makeService(prismaMock);
      const err = await service.verifyToken(rawToken).catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('GONE');
      expect((err as AppException).message).toBe('Cette invitation a déjà été utilisée.');
    });

    it('throws GONE (410) if invitation is expired', async () => {
      const prismaMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'inv-1',
            tokenHash,
            expiresAt: new Date('2026-10-02T12:00:00.000Z'), // expired yesterday
            acceptedAt: null,
            revokedAt: null,
          }),
        },
      };

      const service = makeService(prismaMock);
      const err = await service.verifyToken(rawToken).catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('GONE');
      expect((err as AppException).message).toBe('Cette invitation a expiré.');
    });
  });

  describe('acceptInvitation', () => {
    const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    it('accepts invitation for a new user: creates user, credential account, profile, and marks acceptedAt', async () => {
      const invitation = {
        id: 'inv-1',
        email: 'newbie@revime.fr',
        role: 'moderation',
        firstName: 'New',
        lastName: 'Bie',
        tokenHash,
        expiresAt: new Date('2026-10-09T12:00:00.000Z'),
        acceptedAt: null,
        revokedAt: null,
      };

      const userCreateMock = vi.fn().mockImplementation(async ({ data }: any) => ({ id: data.id, ...data }));
      const accountCreateMock = vi.fn().mockImplementation(async ({ data }: any) => ({ id: data.id, ...data }));
      const profileUpsertMock = vi.fn().mockResolvedValue({ id: 'p-1' });
      const invUpdateMock = vi.fn().mockResolvedValue({ id: 'inv-1' });

      const txMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(invitation),
          update: invUpdateMock,
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(null), // no user yet
          findFirst: vi.fn().mockResolvedValue(null),
          create: userCreateMock,
        },
        account: {
          create: accountCreateMock,
        },
        profile: {
          upsert: profileUpsertMock,
        },
        session: {
          deleteMany: vi.fn(),
        },
      };

      const prismaMock = {
        $transaction: vi.fn().mockImplementation(async (cb: any, opts: any) => {
          expect(opts?.isolationLevel).toBe('Serializable');
          return cb(txMock);
        }),
      };

      const service = makeService(prismaMock);
      const res = await service.acceptInvitation({
        token: rawToken,
        password: 'SecurePassword123!',
        firstName: 'New',
        lastName: 'Bie',
      });

      expect(res).toEqual({
        ok: true,
        email: 'newbie@revime.fr',
        role: 'moderation',
      });

      // User created
      expect(userCreateMock).toHaveBeenCalledTimes(1);
      const createdUser = userCreateMock.mock.calls[0]![0].data;
      expect(createdUser.email).toBe('newbie@revime.fr');
      expect(createdUser.role).toBe('moderation');
      expect(createdUser.emailVerified).toBe(true);
      expect(createdUser.name).toBe('New Bie');
      expect(createdUser.username).toBeDefined();

      // Account created with hashed password
      expect(accountCreateMock).toHaveBeenCalledTimes(1);
      const createdAccount = accountCreateMock.mock.calls[0]![0].data;
      expect(createdAccount.providerId).toBe('credential');
      expect(createdAccount.userId).toBe(createdUser.id);
      expect(createdAccount.password).toBeDefined();
      expect(await verifyPassword({ hash: createdAccount.password, password: 'SecurePassword123!' })).toBe(true);

      // Profile upserted
      expect(profileUpsertMock).toHaveBeenCalledWith({
        where: { userId: createdUser.id },
        create: {
          userId: createdUser.id,
          clientEnabled: true,
          repairerEnabled: false,
          activeMode: 'CLIENT',
        },
        update: {},
      });

      // Invitation marked accepted
      expect(invUpdateMock).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { acceptedAt: new Date('2026-10-03T12:00:00.000Z') },
      });
    });

    it('accepts invitation for an existing regular user: promotes role, updates password & name, purges sessions', async () => {
      const invitation = {
        id: 'inv-2',
        email: 'client@gmail.com',
        role: 'admin',
        firstName: 'Client',
        lastName: 'User',
        tokenHash,
        expiresAt: new Date('2026-10-09T12:00:00.000Z'),
        acceptedAt: null,
        revokedAt: null,
      };

      const existingUser = {
        id: 'u-client-1',
        email: 'client@gmail.com',
        name: 'Old Name',
        role: null,
      };

      const existingAccount = {
        id: 'acc-1',
        userId: 'u-client-1',
        providerId: 'credential',
        password: 'old-hashed-password',
      };

      const userUpdateMock = vi.fn().mockResolvedValue({ id: 'u-client-1' });
      const accountUpdateMock = vi.fn().mockResolvedValue({ id: 'acc-1' });
      const sessionDeleteManyMock = vi.fn().mockResolvedValue({ count: 2 });
      const invUpdateMock = vi.fn().mockResolvedValue({ id: 'inv-2' });

      const txMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(invitation),
          update: invUpdateMock,
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(existingUser),
          update: userUpdateMock,
        },
        account: {
          findFirst: vi.fn().mockResolvedValue(existingAccount),
          update: accountUpdateMock,
        },
        session: {
          deleteMany: sessionDeleteManyMock,
        },
      };

      const prismaMock = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(txMock)),
      };

      const service = makeService(prismaMock);
      const res = await service.acceptInvitation({
        token: rawToken,
        password: 'NewSuperPassword123!',
      });

      expect(res).toEqual({
        ok: true,
        email: 'client@gmail.com',
        role: 'admin',
      });

      // User promoted to admin
      expect(userUpdateMock).toHaveBeenCalledWith({
        where: { id: 'u-client-1' },
        data: {
          role: 'admin',
          firstName: 'Client',
          lastName: 'User',
          name: 'Client User',
        },
      });

      // Password updated
      expect(accountUpdateMock).toHaveBeenCalledTimes(1);
      const updatedAccount = accountUpdateMock.mock.calls[0]![0].data;
      expect(await verifyPassword({ hash: updatedAccount.password, password: 'NewSuperPassword123!' })).toBe(true);

      // Sessions purged
      expect(sessionDeleteManyMock).toHaveBeenCalledWith({
        where: { userId: 'u-client-1' },
      });

      // Invitation marked accepted
      expect(invUpdateMock).toHaveBeenCalledWith({
        where: { id: 'inv-2' },
        data: { acceptedAt: new Date('2026-10-03T12:00:00.000Z') },
      });
    });

    it('rejects acceptInvitation if invitation is already accepted (replay protection)', async () => {
      const invitation = {
        id: 'inv-1',
        tokenHash,
        expiresAt: new Date('2026-10-09T12:00:00.000Z'),
        acceptedAt: new Date('2026-10-02T12:00:00.000Z'),
        revokedAt: null,
      };

      const txMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(invitation),
        },
      };

      const prismaMock = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(txMock)),
      };

      const service = makeService(prismaMock);
      const err = await service.acceptInvitation({
        token: rawToken,
        password: 'Password123!',
      }).catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('GONE');
      expect((err as AppException).message).toBe('Cette invitation a déjà été utilisée.');
    });

    it('rejects acceptInvitation if invitation is expired', async () => {
      const invitation = {
        id: 'inv-1',
        tokenHash,
        expiresAt: new Date('2026-10-02T12:00:00.000Z'), // expired
        acceptedAt: null,
        revokedAt: null,
      };

      const txMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(invitation),
        },
      };

      const prismaMock = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(txMock)),
      };

      const service = makeService(prismaMock);
      const err = await service.acceptInvitation({
        token: rawToken,
        password: 'Password123!',
      }).catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('GONE');
      expect((err as AppException).message).toBe('Cette invitation a expiré.');
    });

    it('rejects acceptInvitation if invitation is revoked or not found', async () => {
      const txMock = {
        staffInvitation: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      const prismaMock = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(txMock)),
      };

      const service = makeService(prismaMock);
      const err = await service.acceptInvitation({
        token: rawToken,
        password: 'Password123!',
      }).catch((e) => e);

      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('NOT_FOUND');
    });
  });
});
