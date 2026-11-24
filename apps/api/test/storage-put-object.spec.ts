import { describe, expect, it } from 'vitest';
import { FakeStorageGateway } from '../src/storage/gateway.js';

describe('StorageGateway.putObject (Livraison Boxtal)', () => {
  it('stores bytes under a bucket + path and signs a read URL for THAT bucket', async () => {
    const s = new FakeStorageGateway();
    await s.putObject('shipping-labels', 'labels/c1/OUTBOUND.pdf', Buffer.from('%PDF-1.4'), 'application/pdf');
    expect(s.bytesAt('shipping-labels', 'labels/c1/OUTBOUND.pdf')?.toString()).toBe('%PDF-1.4');
    const urls = await s.createSignedReadUrls(['labels/c1/OUTBOUND.pdf'], 3600, 'shipping-labels');
    expect(urls.get('labels/c1/OUTBOUND.pdf')).toContain('shipping-labels/labels/c1/OUTBOUND.pdf');
  });

  it('a path stored in one bucket is ABSENT from another, and from the photo bucket by default', async () => {
    const s = new FakeStorageGateway();
    await s.putObject('shipping-labels', 'labels/c1/RETURN.pdf', Buffer.from('x'), 'application/pdf');
    expect((await s.createSignedReadUrls(['labels/c1/RETURN.pdf'], 3600)).size).toBe(0);
    expect((await s.createSignedReadUrls(['labels/c1/RETURN.pdf'], 3600, 'other')).size).toBe(0);
  });

  it('existing photo behaviour is unchanged: seed() still lands in the photo bucket', async () => {
    const s = new FakeStorageGateway();
    s.seed('demandes/u/d/o.jpg');
    expect((await s.createSignedReadUrls(['demandes/u/d/o.jpg'], 3600)).size).toBe(1);
  });
});
