import { describe, expect, it } from 'vitest';
import { PHOTO_BUCKET } from '../src/storage/photo-paths.js';
import {
  attachmentBucket,
  attachmentExtension,
  bucketFor,
  conversationAttachmentPath,
  disputeAttachmentPath,
  checkConversationAttachment,
  checkDisputeAttachment,
  cleanDocumentName,
} from '../src/storage/attachment-paths.js';

describe('Attachment Paths and Validation', () => {
  const convId = '11111111-1111-1111-1111-111111111111';
  const cmdId = '22222222-2222-2222-2222-222222222222';

  it('attachmentBucket returns env value or default attachments', () => {
    expect(attachmentBucket()).toBe(process.env.ATTACHMENT_BUCKET ?? 'attachments');
  });

  it('attachmentExtension handles allowed types and throws on others', () => {
    expect(attachmentExtension('image/jpeg')).toBe('jpg');
    expect(attachmentExtension('image/png')).toBe('png');
    expect(attachmentExtension('application/pdf')).toBe('pdf');
    expect(() => attachmentExtension('text/plain')).toThrow();
  });

  it('bucketFor routes pdf to attachmentBucket and others to PHOTO_BUCKET', () => {
    expect(bucketFor('pdf')).toBe(attachmentBucket());
    expect(bucketFor('jpg')).toBe(PHOTO_BUCKET);
    expect(bucketFor('png')).toBe(PHOTO_BUCKET);
  });

  it('built conversation paths match their checkers', () => {
    const photoJpg = conversationAttachmentPath(convId, 'image/jpeg');
    expect(checkConversationAttachment(photoJpg, convId, 'photo')).toBe(true);
    expect(checkConversationAttachment(photoJpg, convId, 'document')).toBe(false);

    const photoPng = conversationAttachmentPath(convId, 'image/png');
    expect(checkConversationAttachment(photoPng, convId, 'photo')).toBe(true);

    const docPdf = conversationAttachmentPath(convId, 'application/pdf');
    expect(checkConversationAttachment(docPdf, convId, 'document')).toBe(true);
    expect(checkConversationAttachment(docPdf, convId, 'photo')).toBe(false);
  });

  it('built dispute paths match their checkers', () => {
    const clientPhoto = disputeAttachmentPath(cmdId, 'CLIENT', 'image/jpeg');
    expect(clientPhoto).toContain('/litige/client/');
    expect(checkDisputeAttachment(clientPhoto, cmdId, 'CLIENT', 'photo')).toBe(true);
    expect(checkDisputeAttachment(clientPhoto, cmdId, 'REPAIRER', 'photo')).toBe(false);

    const repDoc = disputeAttachmentPath(cmdId, 'REPAIRER', 'application/pdf');
    expect(repDoc).toContain('/litige/reparateur/');
    expect(checkDisputeAttachment(repDoc, cmdId, 'REPAIRER', 'document')).toBe(true);
    expect(checkDisputeAttachment(repDoc, cmdId, 'CLIENT', 'document')).toBe(false);
  });

  it('checkDisputeAttachment rejects malicious or mismatched paths', () => {
    const validClientDoc = disputeAttachmentPath(cmdId, 'CLIENT', 'application/pdf');

    // Other side prefix
    expect(checkDisputeAttachment(validClientDoc, cmdId, 'REPAIRER', 'document')).toBe(false);

    // Another commande id
    const otherCmdId = '33333333-3333-3333-3333-333333333333';
    expect(checkDisputeAttachment(validClientDoc, otherCmdId, 'CLIENT', 'document')).toBe(false);

    // Traversal segments
    expect(checkDisputeAttachment(`commandes/${cmdId}/litige/client/../hack.pdf`, cmdId, 'CLIENT', 'document')).toBe(false);

    // .pdf under kind photo
    expect(checkDisputeAttachment(validClientDoc, cmdId, 'CLIENT', 'photo')).toBe(false);

    // .jpg under kind document
    const validClientPhoto = disputeAttachmentPath(cmdId, 'CLIENT', 'image/jpeg');
    expect(checkDisputeAttachment(validClientPhoto, cmdId, 'CLIENT', 'document')).toBe(false);
  });

  it('cleanDocumentName normalizes file names', () => {
    expect(cleanDocumentName('../../a/b\\facture.pdf')).toBe('facture.pdf');

    const longName = 'a'.repeat(200) + '.pdf';
    expect(cleanDocumentName(longName)).toHaveLength(120);

    expect(cleanDocumentName('')).toBe('document.pdf');
    expect(cleanDocumentName(undefined)).toBe('document.pdf');
    expect(cleanDocumentName('   ')).toBe('document.pdf');
  });
});
