import { describe, expect, it } from 'vitest';
import {
  createConversationSchema,
  sendMessageSchema,
  signChatPhotoSchema,
  MESSAGE_BODY_MAX,
} from '@revime/shared';

describe('sendMessageSchema', () => {
  it('accepts an ordinary message and trims it', () => {
    const parsed = sendMessageSchema.parse({ body: '  Bonjour, je peux passer demain.  ' });
    expect(parsed.body).toBe('Bonjour, je peux passer demain.');
  });

  it('refuses a whitespace-only message with the authored French', () => {
    const res = sendMessageSchema.safeParse({ body: '   ' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]?.message).toBe('Votre message est vide.');
  });

  it('refuses a body over the cap', () => {
    const res = sendMessageSchema.safeParse({ body: 'a'.repeat(MESSAGE_BODY_MAX + 1) });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]?.message).toBe('Message trop long.');
  });

  it('accepts a body at exactly the cap', () => {
    expect(sendMessageSchema.safeParse({ body: 'a'.repeat(MESSAGE_BODY_MAX) }).success).toBe(true);
  });

  it('accepts an empty body when photoPath is present (CF3-11)', () => {
    const res = sendMessageSchema.safeParse({ body: '', photoPath: 'conversations/c1/photo.jpg' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.photoPath).toBe('conversations/c1/photo.jpg');
    }
  });

  it('refuses an empty body when photoPath is absent or null', () => {
    const res = sendMessageSchema.safeParse({ body: '', photoPath: null });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe('Votre message est vide.');
    }
  });
});

describe('createConversationSchema', () => {
  it('requires repairerUserId', () => {
    expect(createConversationSchema.safeParse({ demandeId: 'd1' }).success).toBe(false);
    expect(
      createConversationSchema.safeParse({ demandeId: 'd1', repairerUserId: 'u1' }).success,
    ).toBe(true);
  });

  it('allows omitting demandeId for direct profile quotes/contacts (CF3-07)', () => {
    const res = createConversationSchema.safeParse({ repairerUserId: 'u1' });
    expect(res.success).toBe(true);
  });

  it('strips unknown keys, so a hostile body cannot smuggle a field', () => {
    const parsed = createConversationSchema.parse({
      demandeId: 'd1',
      repairerUserId: 'u1',
      clientUserId: 'someone-else',
    });
    expect(parsed).toEqual({ demandeId: 'd1', repairerUserId: 'u1' });
  });
});

describe('signChatPhotoSchema (CF3-11)', () => {
  it('accepts image/jpeg and image/png', () => {
    expect(signChatPhotoSchema.safeParse({ contentType: 'image/jpeg' }).success).toBe(true);
    expect(signChatPhotoSchema.safeParse({ contentType: 'image/png' }).success).toBe(true);
  });

  it('rejects unsupported content types with French error message', () => {
    const res = signChatPhotoSchema.safeParse({ contentType: 'application/pdf' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe(
        'Seuls les formats JPEG et PNG sont acceptés.',
      );
    }
  });

  it('rejects empty or missing contentType', () => {
    expect(signChatPhotoSchema.safeParse({}).success).toBe(false);
    expect(signChatPhotoSchema.safeParse({ contentType: '' }).success).toBe(false);
  });
});
