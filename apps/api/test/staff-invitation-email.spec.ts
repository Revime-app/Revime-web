import { describe, expect, it } from 'vitest';
import { ADMIN_ROLES, ADMIN_ROLE_LABEL } from '@revime/shared';
import {
  LOGO_PUBLIC_URL,
  renderStaffInvitationEmail,
} from '../src/mail/staff-invitation-email.template.js';

describe('renderStaffInvitationEmail', () => {
  const sampleUrl = 'https://admin.revime.fr/invitations/accept?token=inv_test_token_1234567890abcdef';

  it('renders staff invitation email with firstName and inviterName provided', () => {
    const result = renderStaffInvitationEmail({
      url: sampleUrl,
      role: 'support',
      firstName: 'Alice',
      inviterName: 'Jean Dupont',
    });

    // Subject
    expect(result.subject).toMatch(/Invitation à rejoindre l['’]équipe REVIME/);

    // Text format verification
    expect(result.text).toContain('Bonjour Alice,');
    expect(result.text).toContain('par Jean Dupont');
    expect(result.text).toContain('Support');
    expect(result.text).toContain(sampleUrl);
    expect(result.text).toContain('7 jours');
    expect(result.text).toContain("L'équipe REVIME");
    expect(result.text).toContain('www.revime.fr · support@revime.fr');

    // HTML format verification
    expect(result.html).toContain(LOGO_PUBLIC_URL);
    expect(result.html).toContain('Bonjour Alice,');
    expect(result.html).toContain('Jean Dupont');
    expect(result.html).toContain('Support');
    expect(result.html).toContain(sampleUrl);
    expect(result.html).toContain('7 jours');
    expect(result.html).toContain('#f61b39'); // Brand red
    expect(result.html).toContain('#010524'); // Navy text
    expect(result.html).toContain('www.revime.fr');
    expect(result.html).toContain('support@revime.fr');
  });

  it('renders fallback greeting and text when firstName and inviterName are omitted or null', () => {
    const result = renderStaffInvitationEmail({
      url: sampleUrl,
      role: 'moderation',
      firstName: null,
      inviterName: null,
    });

    // Text format verification
    expect(result.text).toContain('Bonjour,');
    expect(result.text).not.toContain('Bonjour null');
    expect(result.text).not.toContain('par null');
    expect(result.text).not.toContain('par undefined');
    expect(result.text).toContain('Modération');
    expect(result.text).toContain(sampleUrl);

    // HTML format verification
    expect(result.html).toContain('Bonjour,');
    expect(result.html).not.toContain('Bonjour null');
    expect(result.html).not.toContain('par null');
    expect(result.html).not.toContain('par undefined');
    expect(result.html).toContain('Modération');
    expect(result.html).toContain(sampleUrl);
  });

  it('renders correctly with undefined optional fields', () => {
    const result = renderStaffInvitationEmail({
      url: sampleUrl,
      role: 'finance',
    });

    expect(result.text).toContain('Bonjour,');
    expect(result.text).not.toContain('par undefined');
    expect(result.text).toContain('Finance');
    expect(result.html).toContain('Bonjour,');
    expect(result.html).toContain('Finance');
  });

  it('formats and renders all standard admin roles accurately', () => {
    for (const role of ADMIN_ROLES) {
      const expectedLabel = ADMIN_ROLE_LABEL[role];
      const result = renderStaffInvitationEmail({
        url: sampleUrl,
        role,
        firstName: 'TestUser',
      });

      expect(result.text).toContain(expectedLabel);
      expect(result.html).toContain(expectedLabel);
    }
  });

  it('includes security notice about 7-day validity and single-use link in both formats', () => {
    const result = renderStaffInvitationEmail({
      url: sampleUrl,
      role: 'super_admin',
      firstName: 'Directeur',
    });

    // Text security notice
    expect(result.text).toMatch(/7 jours/);
    expect(result.text).toMatch(/seule fois|unique/i);

    // HTML security notice
    expect(result.html).toMatch(/7 jours/);
    expect(result.html).toMatch(/seule fois|unique/i);
  });

  it('embeds the target URL in both CTA button and fallback link in HTML', () => {
    const result = renderStaffInvitationEmail({
      url: sampleUrl,
      role: 'admin',
      firstName: 'AdminUser',
    });

    expect(result.html).toContain(`href="${sampleUrl}"`);
    expect(result.text).toContain(sampleUrl);
  });
});
