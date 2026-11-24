import { describe, expect, it } from 'vitest';
import {
  LOGO_PUBLIC_URL,
  renderConfirmationEmail,
  renderActivationEmail,
  renderAccountConfirmedEmail,
} from '../src/mail/confirmation-email.template.js';

describe('renderConfirmationEmail', () => {
  it('renders confirmation email with correct HTML and plain text structure', () => {
    const otp = '739201';
    const { html, text } = renderConfirmationEmail(otp);

    // Text format verification
    expect(text).toContain('Votre code de confirmation');
    expect(text).toContain('739201');
    expect(text).toContain('Ce code est valable 10 minutes.');
    expect(text).toContain("Si vous n'êtes pas à l'origine de cette demande, vous pouvez simplement ignorer cet e-mail.");
    expect(text).toContain("L'équipe REVIME");
    expect(text).toContain('www.revime.fr · support@revime.fr');

    // HTML format verification
    expect(html).toContain(LOGO_PUBLIC_URL);
    expect(html).toContain('Votre code de confirmation');
    expect(html).toContain('739201');
    expect(html).toContain('#f61b39'); // REVIME red accent
    expect(html).toContain('#010524'); // Navy text
    expect(html).toContain('#25324f'); // Navy text
    expect(html).toContain('#ffffff'); // White background
    expect(html).toContain('Ce code est valable 10 minutes.');
    expect(html).toContain('Si vous n&rsquo;&ecirc;tes pas &agrave; l&rsquo;origine de cette demande');
    expect(html).toContain('L&rsquo;&eacute;quipe REVIME');
    expect(html).toContain('www.revime.fr');
    expect(html).toContain('support@revime.fr');
  });

  it('renders activation email with CTA button and proper links', () => {
    const url = 'https://repareme-api.onrender.com/api/auth/verify-email?token=xyz123';
    const { html, text } = renderActivationEmail({ url, name: 'Malek' });

    expect(text).toContain('Activez votre compte REVIME');
    expect(text).toContain('Bonjour Malek');
    expect(text).toContain(url);
    expect(text).toContain("L'équipe REVIME");

    expect(html).toContain(LOGO_PUBLIC_URL);
    expect(html).toContain('Activez votre compte REVIME');
    expect(html).toContain('Activer mon compte');
    expect(html).toContain(url);
    expect(html).toContain('#f61b39');
    expect(html).toContain('Bonjour Malek');
  });

  it('renders account confirmed welcome email with next steps', () => {
    const { html, text } = renderAccountConfirmedEmail({ name: 'Malek' });

    expect(text).toContain('Compte confirmé avec succès');
    expect(text).toContain('Bonjour Malek');
    expect(text).toContain('Publiez votre demande');
    expect(text).toContain('Proposez vos services');
    expect(text).toContain('Protection REVIME');

    expect(html).toContain(LOGO_PUBLIC_URL);
    expect(html).toContain('Compte confirm&eacute; avec succ&egrave;s');
    expect(html).toContain('Bonjour Malek');
    expect(html).toContain('Publiez une demande');
    expect(html).toContain('Proposez vos services');
    expect(html).toContain('Protection REVIME');
    expect(html).toContain("Ouvrir l&rsquo;application");
  });
});

