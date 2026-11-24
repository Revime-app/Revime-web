import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminAlertsService } from '../src/admin/admin-alerts.service.js';
import { AdminAlertsController } from '../src/admin/admin-alerts.controller.js';
import { buildAlertEmail } from '../src/mail/alert-email.js';

describe('Admin Alert Email Template', () => {
  it('renders email with subject, text, HTML, brand colors and severity badges', () => {
    const alert = {
      type: 'DISPUTE_NEW' as const,
      severity: 'CRITICAL' as const,
      title: 'Nouveau litige #LIT-0042',
      message: 'Un litige a été ouvert pour la commande #CMD-1234',
      targetType: 'Dispute' as const,
      targetId: 'd0000000-0000-0000-0000-000000000001',
      link: '/admin/disputes/d0000000-0000-0000-0000-000000000001',
      metadata: { amountCents: 8500 },
    };

    const email = buildAlertEmail(alert);

    // Subject format requirement
    expect(email.subject).toBe('[ALERTE REVIME - CRITICAL] Nouveau litige #LIT-0042');

    // Plaintext content
    expect(email.text).toContain('Nouveau litige #LIT-0042');
    expect(email.text).toContain('CRITICAL');
    expect(email.text).toContain('Dispute');
    expect(email.text).toContain('d0000000-0000-0000-0000-000000000001');
    expect(email.text).toContain('/admin/disputes/d0000000-0000-0000-0000-000000000001');

    // HTML content and brand palette
    expect(email.html).toContain('Nouveau litige #LIT-0042');
    expect(email.html).toContain('#f61b39'); // Critical red
    expect(email.html).toContain('#25324f'); // Bleu ink CTA button
    expect(email.html).toContain('Consulter');
  });

  it('renders correct severity colors for HIGH and MEDIUM alerts', () => {
    const highAlert = buildAlertEmail({
      type: 'PAYMENT_FAILED' as const,
      severity: 'HIGH' as const,
      title: 'Échec de paiement',
      message: 'Paiement échoué',
      targetType: 'Commande' as const,
      targetId: 'cmd_1',
      link: '/admin/commandes/cmd_1',
    });
    expect(highAlert.html).toContain('#ea580c'); // High orange

    const mediumAlert = buildAlertEmail({
      type: 'PARCEL_INCIDENT' as const,
      severity: 'MEDIUM' as const,
      title: 'Incident colis',
      message: 'Colis bloqué',
      targetType: 'Shipment' as const,
      targetId: 'ship_1',
      link: '/admin/colis/ship_1',
    });
    expect(mediumAlert.html).toContain('#25324f'); // Medium navy
  });
});

describe('AdminAlertsService', () => {
  let service: AdminAlertsService;
  let mockPrisma: any;
  let mockMailSender: any;
  /** The PlatformSettings singleton, as the database would hold it between two service instances. */
  let settingsRow: { alertPreferences: unknown } | null;

  beforeEach(() => {
    settingsRow = null;
    mockPrisma = {
      platformSettings: {
        findUnique: vi.fn(async () => settingsRow),
        upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          settingsRow = settingsRow ? { ...settingsRow, ...update } : (create as { alertPreferences: unknown });
          return settingsRow;
        }),
      },
      adminAlert: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
    mockMailSender = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    service = new AdminAlertsService(mockPrisma as any, mockMailSender as any);
  });

  describe('createAlert and Deduplication', () => {
    it('creates an alert and dispatches operational email when no recent duplicate exists', async () => {
      mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
      const createdRow = {
        id: 'a0000000-0000-4000-8000-000000000001',
        type: 'DISPUTE_NEW',
        severity: 'CRITICAL',
        title: 'Nouveau litige #LIT-0042',
        message: 'Un litige a été ouvert',
        targetType: 'Dispute',
        targetId: 'd0000000-0000-0000-0000-000000000001',
        link: '/admin/disputes/d0000000-0000-0000-0000-000000000001',
        isRead: false,
        readAt: null,
        readByUserId: null,
        emailSent: true,
        emailSentAt: new Date('2026-10-16T12:00:00Z'),
        metadata: { amountCents: 5000 },
        createdAt: new Date('2026-10-16T12:00:00Z'),
        updatedAt: new Date('2026-10-16T12:00:00Z'),
        readBy: null,
      };
      mockPrisma.adminAlert.create.mockResolvedValue(createdRow);
      mockPrisma.adminAlert.update.mockResolvedValue(createdRow);

      process.env.OPS_EMAIL = 'ops@revime.fr';

      const result = await service.createAlert({
        type: 'DISPUTE_NEW',
        title: 'Nouveau litige #LIT-0042',
        message: 'Un litige a été ouvert',
        targetType: 'Dispute',
        targetId: 'd0000000-0000-0000-0000-000000000001',
        link: '/admin/disputes/d0000000-0000-0000-0000-000000000001',
        metadata: { amountCents: 5000 },
      });

      expect(mockPrisma.adminAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DISPUTE_NEW',
            title: 'Nouveau litige #LIT-0042',
            targetId: 'd0000000-0000-0000-0000-000000000001',
          }),
        }),
      );
      expect(mockMailSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ops@revime.fr',
          subject: expect.stringContaining('Nouveau litige #LIT-0042'),
        }),
      );
      expect(result.id).toBe(createdRow.id);
      expect(result.emailSent).toBe(true);
    });

    it('deduplicates identical (type, targetId) within 15 minutes without sending duplicate email', async () => {
      const existingRow = {
        id: 'a0000000-0000-4000-8000-000000000001',
        type: 'DISPUTE_NEW',
        severity: 'CRITICAL',
        title: 'Nouveau litige #LIT-0042',
        message: 'Un litige a été ouvert',
        targetType: 'Dispute',
        targetId: 'd0000000-0000-0000-0000-000000000001',
        link: '/admin/disputes/d0000000-0000-0000-0000-000000000001',
        isRead: false,
        readAt: null,
        readByUserId: null,
        emailSent: true,
        emailSentAt: new Date('2026-10-16T12:00:00Z'),
        metadata: { amountCents: 5000 },
        createdAt: new Date('2026-10-16T12:00:00Z'),
        updatedAt: new Date('2026-10-16T12:00:00Z'),
        readBy: null,
      };
      mockPrisma.adminAlert.findFirst.mockResolvedValue(existingRow);
      mockPrisma.adminAlert.update.mockResolvedValue({
        ...existingRow,
        metadata: { amountCents: 6000 },
      });

      process.env.OPS_EMAIL = 'ops@revime.fr';

      const result = await service.createAlert({
        type: 'DISPUTE_NEW',
        title: 'Nouveau litige #LIT-0042',
        message: 'Un litige a été ouvert',
        targetType: 'Dispute',
        targetId: 'd0000000-0000-0000-0000-000000000001',
        link: '/admin/disputes/d0000000-0000-0000-0000-000000000001',
        metadata: { amountCents: 6000 },
      });

      // Assert deduplication: NO create called, NO email sent, update snapshot called
      expect(mockPrisma.adminAlert.create).not.toHaveBeenCalled();
      expect(mockMailSender.send).not.toHaveBeenCalled();
      expect(mockPrisma.adminAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existingRow.id },
          data: { metadata: { amountCents: 6000 } },
        }),
      );
      expect(result.id).toBe(existingRow.id);
    });

    it('does not send email if notification preference for category is disabled', async () => {
      mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
      const createdRow = {
        id: 'a0000000-0000-4000-8000-000000000002',
        type: 'PAYMENT_FAILED',
        severity: 'HIGH',
        title: 'Échec de virement',
        message: 'Virement échoué',
        targetType: 'Commande',
        targetId: 'cmd_123',
        link: '/admin/versements',
        isRead: false,
        readAt: null,
        readByUserId: null,
        emailSent: false,
        emailSentAt: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        readBy: null,
      };
      mockPrisma.adminAlert.create.mockResolvedValue(createdRow);

      process.env.OPS_EMAIL = 'ops@revime.fr';
      await service.updatePreferences({ emailPayments: false });

      const result = await service.createAlert({
        type: 'PAYMENT_FAILED',
        title: 'Échec de virement',
        message: 'Virement échoué',
        targetType: 'Commande',
        targetId: 'cmd_123',
        link: '/admin/versements',
      });

      expect(mockPrisma.adminAlert.create).toHaveBeenCalled();
      expect(mockMailSender.send).not.toHaveBeenCalled();
      expect(result.emailSent).toBe(false);
    });

    it('handles mailer errors non-blockingly without throwing', async () => {
      mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
      const createdRow = {
        id: 'a0000000-0000-4000-8000-000000000003',
        type: 'REPORT_SEVERE',
        severity: 'CRITICAL',
        title: 'Signalement harcèlement',
        message: 'Contenu illicite',
        targetType: 'ConversationReport',
        targetId: 'rep_123',
        link: '/admin/signalements',
        isRead: false,
        readAt: null,
        readByUserId: null,
        emailSent: false,
        emailSentAt: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        readBy: null,
      };
      mockPrisma.adminAlert.create.mockResolvedValue(createdRow);
      mockMailSender.send.mockRejectedValue(new Error('SMTP Connection timeout'));

      process.env.OPS_EMAIL = 'ops@revime.fr';

      const result = await service.createAlert({
        type: 'REPORT_SEVERE',
        title: 'Signalement harcèlement',
        message: 'Contenu illicite',
        targetType: 'ConversationReport',
        targetId: 'rep_123',
        link: '/admin/signalements',
      });

      expect(mockPrisma.adminAlert.create).toHaveBeenCalled();
      expect(mockMailSender.send).toHaveBeenCalled();
      expect(result.id).toBe(createdRow.id);
    });
  });

  describe('listAlerts and Filtering', () => {
    it('applies filters by type, severity, isRead, search query and pagination', async () => {
      const items = [
        {
          id: 'a0000000-0000-4000-8000-000000000001',
          type: 'DISPUTE_NEW',
          severity: 'CRITICAL',
          title: 'Nouveau litige #LIT-0042',
          message: 'Détails du litige',
          targetType: 'Dispute',
          targetId: 'd0000000-0000-0000-0000-000000000001',
          link: '/admin/disputes/1',
          isRead: false,
          readAt: null,
          readByUserId: null,
          emailSent: true,
          emailSentAt: new Date(),
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          readBy: null,
        },
      ];

      mockPrisma.adminAlert.findMany.mockResolvedValue(items);
      mockPrisma.adminAlert.count
        .mockResolvedValueOnce(1)  // total matching query
        .mockResolvedValueOnce(5); // unreadCount global

      const result = await service.listAlerts({
        page: 2,
        limit: 10,
        type: 'DISPUTE_NEW',
        severity: 'CRITICAL',
        isRead: 'false',
        q: 'litige',
      });

      expect(mockPrisma.adminAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          where: expect.objectContaining({
            type: 'DISPUTE_NEW',
            severity: 'CRITICAL',
            isRead: false,
            OR: [
              { title: { contains: 'litige', mode: 'insensitive' } },
              { message: { contains: 'litige', mode: 'insensitive' } },
              { targetId: { contains: 'litige', mode: 'insensitive' } },
            ],
          }),
        }),
      );
      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(5);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });
  });

  describe('KPIs and Counts', () => {
    it('calculates KPIs correctly', async () => {
      mockPrisma.adminAlert.count
        .mockResolvedValueOnce(7)  // unreadTotal
        .mockResolvedValueOnce(2)  // criticalCount
        .mockResolvedValueOnce(3)  // disputesCount
        .mockResolvedValueOnce(1); // paymentsCount

      const kpis = await service.getAlertKpis();
      expect(kpis.unreadTotal).toBe(7);
      expect(kpis.criticalCount).toBe(2);
      expect(kpis.disputesCount).toBe(3);
      expect(kpis.paymentsCount).toBe(1);
    });

    it('returns global unread count', async () => {
      mockPrisma.adminAlert.count.mockResolvedValue(4);
      const count = await service.getUnreadCount();
      expect(count).toBe(4);
      expect(mockPrisma.adminAlert.count).toHaveBeenCalledWith({ where: { isRead: false } });
    });
  });

  describe('Mark as Read Operations', () => {
    it('marks single alert as read with operator attribution', async () => {
      const readRow = {
        id: 'a0000000-0000-4000-8000-000000000001',
        type: 'DISPUTE_NEW',
        severity: 'CRITICAL',
        title: 'Litige',
        message: 'Message',
        targetType: 'Dispute',
        targetId: 'd1',
        link: '/link',
        isRead: true,
        readAt: new Date('2026-10-16T14:00:00Z'),
        readByUserId: 'usr_admin_1',
        emailSent: true,
        emailSentAt: new Date(),
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        readBy: { name: 'Admin Jean' },
      };
      mockPrisma.adminAlert.update.mockResolvedValue(readRow);

      const result = await service.markAsRead('a0000000-0000-4000-8000-000000000001', 'usr_admin_1');
      expect(mockPrisma.adminAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'a0000000-0000-4000-8000-000000000001' },
          data: expect.objectContaining({
            isRead: true,
            readByUserId: 'usr_admin_1',
          }),
        }),
      );
      expect(result.isRead).toBe(true);
      expect(result.readByUserName).toBe('Admin Jean');
    });

    it('marks all alerts as read in bulk', async () => {
      mockPrisma.adminAlert.updateMany.mockResolvedValue({ count: 9 });

      const result = await service.markAllAsRead('usr_admin_1');
      expect(mockPrisma.adminAlert.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isRead: false },
          data: expect.objectContaining({
            isRead: true,
            readByUserId: 'usr_admin_1',
          }),
        }),
      );
      expect(result.count).toBe(9);
    });
  });

  describe('Preferences Management', () => {
    it('retrieves default preferences and updates partial preferences', async () => {
      const initialPrefs = await service.getPreferences();
      expect(initialPrefs.emailDisputes).toBe(true);
      expect(initialPrefs.bellReports).toBe(true);

      const updated = await service.updatePreferences({
        emailParcels: false,
        bellPayments: false,
      });

      expect(updated.emailParcels).toBe(false);
      expect(updated.bellPayments).toBe(false);
      expect(updated.emailDisputes).toBe(true); // Untouched remains true

      const refetched = await service.getPreferences();
      expect(refetched.emailParcels).toBe(false);
      expect(refetched.bellPayments).toBe(false);
    });

    it('keeps the preferences across a restart: a fresh service instance reads what the last one saved', async () => {
      await service.updatePreferences({ emailDisputes: false });

      const afterRestart = new AdminAlertsService(mockPrisma as any, mockMailSender as any);

      expect((await afterRestart.getPreferences()).emailDisputes).toBe(false);
      expect(settingsRow?.alertPreferences).toMatchObject({ emailDisputes: false });
    });

    it('creates the settings singleton on the first save, with the platform defaults around the preferences', async () => {
      await service.updatePreferences({ bellReports: false });

      const call = mockPrisma.platformSettings.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'singleton' });
      expect(call.create.id).toBe('singleton');
      expect(call.create.protectionFixedCents).toBe(290);
      expect(call.create.alertPreferences.bellReports).toBe(false);
    });

    it('sends the email for a category switched off in an earlier instance only if it is switched back on', async () => {
      process.env.OPS_EMAIL = 'ops@revime.fr';
      await service.updatePreferences({ emailParcels: false });
      const afterRestart = new AdminAlertsService(mockPrisma as any, mockMailSender as any);
      mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
      mockPrisma.adminAlert.create.mockResolvedValue({
        id: 'a-1', type: 'PARCEL_INCIDENT', severity: 'MEDIUM', title: 't', message: 'm', targetType: 'Shipment',
        targetId: 's-1', link: '/colis', isRead: false, readAt: null, readByUserId: null, emailSent: false,
        emailSentAt: null, metadata: null, createdAt: new Date(), readBy: null,
      });

      await afterRestart.createAlert({
        type: 'PARCEL_INCIDENT', title: 't', message: 'm', targetType: 'Shipment', targetId: 's-1', link: '/colis',
      });

      expect(mockMailSender.send).not.toHaveBeenCalled();
    });
  });

  describe('raise: the entry point for the producers', () => {
    it('never throws, because the event it reports has already happened', async () => {
      mockPrisma.adminAlert.findFirst.mockRejectedValue(new Error('db down'));

      await expect(
        service.raise({
          type: 'DISPUTE_NEW', title: 't', message: 'm', targetType: 'Dispute', targetId: 'd-1', link: '/litiges',
        }),
      ).resolves.toBeUndefined();
    });

    it('creates the alert when the database is up', async () => {
      mockPrisma.adminAlert.findFirst.mockResolvedValue(null);
      mockPrisma.adminAlert.create.mockResolvedValue({
        id: 'a-2', type: 'DISPUTE_NEW', severity: 'CRITICAL', title: 't', message: 'm', targetType: 'Dispute',
        targetId: 'd-1', link: '/litiges', isRead: false, readAt: null, readByUserId: null, emailSent: false,
        emailSentAt: null, metadata: null, createdAt: new Date(), readBy: null,
      });

      await service.raise({
        type: 'DISPUTE_NEW', title: 't', message: 'm', targetType: 'Dispute', targetId: 'd-1', link: '/litiges',
      });

      expect(mockPrisma.adminAlert.create).toHaveBeenCalledTimes(1);
    });
  });
});

describe('AdminAlertsController', () => {
  let controller: AdminAlertsController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      getUnreadCount: vi.fn(),
      getAlertKpis: vi.fn(),
      getPreferences: vi.fn(),
      updatePreferences: vi.fn(),
      markAllAsRead: vi.fn(),
      markAsRead: vi.fn(),
      listAlerts: vi.fn(),
    };

    controller = new AdminAlertsController(mockService as unknown as AdminAlertsService);
  });

  it('delegates getUnreadCount and returns { unreadCount }', async () => {
    mockService.getUnreadCount.mockResolvedValue(12);

    const result = await controller.getUnreadCount();
    expect(result).toEqual({ unreadCount: 12 });
    expect(mockService.getUnreadCount).toHaveBeenCalledTimes(1);
  });

  it('delegates getKpis and returns AdminAlertKpis', async () => {
    const kpis = {
      unreadTotal: 12,
      criticalCount: 3,
      disputesCount: 5,
      paymentsCount: 4,
    };
    mockService.getAlertKpis.mockResolvedValue(kpis);

    const result = await controller.getKpis();
    expect(result).toEqual(kpis);
    expect(mockService.getAlertKpis).toHaveBeenCalledTimes(1);
  });

  it('delegates getPreferences and returns AdminAlertPreferences', async () => {
    const prefs = {
      emailDisputes: true,
      emailReports: true,
      emailPayments: true,
      emailParcels: false,
      bellDisputes: true,
      bellReports: true,
      bellPayments: true,
      bellParcels: true,
    };
    mockService.getPreferences.mockResolvedValue(prefs);

    const result = await controller.getPreferences();
    expect(result).toEqual(prefs);
    expect(mockService.getPreferences).toHaveBeenCalledTimes(1);
  });

  it('validates and delegates updatePreferences with parsed patch', async () => {
    const patch = { emailParcels: false, bellPayments: false };
    const updated = {
      emailDisputes: true,
      emailReports: true,
      emailPayments: true,
      emailParcels: false,
      bellDisputes: true,
      bellReports: true,
      bellPayments: false,
      bellParcels: true,
    };
    mockService.updatePreferences.mockResolvedValue(updated);

    const result = await controller.updatePreferences(patch);
    expect(result).toEqual(updated);
    expect(mockService.updatePreferences).toHaveBeenCalledWith({
      emailParcels: false,
      bellPayments: false,
    });
  });

  it('fails updatePreferences when schema validation fails', async () => {
    await expect(controller.updatePreferences({ emailParcels: 'not-a-bool' })).rejects.toThrow();
    expect(mockService.updatePreferences).not.toHaveBeenCalled();
  });

  it('delegates markAllAsRead passing operator user ID from req.user', async () => {
    mockService.markAllAsRead.mockResolvedValue({ count: 7 });

    const result = await controller.markAllAsRead({ user: { id: 'admin-op-1' } });
    expect(result).toEqual({ count: 7 });
    expect(mockService.markAllAsRead).toHaveBeenCalledWith('admin-op-1');
  });

  it('delegates markAllAsRead passing operator user ID from req.session.user if req.user is absent', async () => {
    mockService.markAllAsRead.mockResolvedValue({ count: 5 });

    const result = await controller.markAllAsRead({ session: { user: { id: 'admin-op-2' } } });
    expect(result).toEqual({ count: 5 });
    expect(mockService.markAllAsRead).toHaveBeenCalledWith('admin-op-2');
  });

  it('delegates markAsRead with id and operator user ID', async () => {
    const alertItem = {
      id: 'a0000000-0000-4000-8000-000000000001',
      type: 'DISPUTE_NEW',
      severity: 'CRITICAL',
      title: 'Litige',
      message: 'Description',
      targetType: 'Dispute',
      targetId: 'd-1',
      link: '/admin/disputes/d-1',
      isRead: true,
      readAt: '2026-10-16T15:00:00.000Z',
      readByUserId: 'admin-op-1',
      readByUserName: 'Super Admin',
      emailSent: true,
      emailSentAt: null,
      createdAt: '2026-10-16T14:50:00.000Z',
    };
    mockService.markAsRead.mockResolvedValue(alertItem);

    const result = await controller.markAsRead('a0000000-0000-4000-8000-000000000001', {
      user: { id: 'admin-op-1' },
    });
    expect(result).toEqual(alertItem);
    expect(mockService.markAsRead).toHaveBeenCalledWith(
      'a0000000-0000-4000-8000-000000000001',
      'admin-op-1',
    );
  });

  it('parses query params and delegates listAlerts to service', async () => {
    const listResponse = {
      items: [],
      total: 0,
      unreadCount: 0,
      page: 2,
      limit: 15,
    };
    mockService.listAlerts.mockResolvedValue(listResponse);

    const query = {
      page: '2',
      limit: '15',
      type: 'DISPUTE_NEW',
      severity: 'CRITICAL',
      isRead: 'false',
      q: 'commande',
    };

    const result = await controller.listAlerts(query);
    expect(result).toEqual(listResponse);
    expect(mockService.listAlerts).toHaveBeenCalledWith({
      page: 2,
      limit: 15,
      type: 'DISPUTE_NEW',
      severity: 'CRITICAL',
      isRead: 'false',
      q: 'commande',
    });
  });
});

