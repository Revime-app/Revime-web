import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentUploadError, uploadDocumentToUrl } from '../src/lib/document-upload';

/**
 * V7 A4 (2026-10-28). The upload of the client's PNG was refused by storage, and the app showed
 * « Une erreur est survenue lors de l'envoi. » because `uploadDocumentToUrl` threw a plain `Error`
 * the screen could not read. The client asked to « afficher le vrai motif de l'erreur ».
 *
 * The 415 body below is the one Supabase returned at 2026-10-27 20:58:57 UTC (storage log:
 * HTTP 400, `error: invalid_mime_type`, `statusCode: 415`, « mime type image/png is not supported »).
 */

const LOCAL = 'file:///data/user/0/fr.revime.app/cache/kbis.png';
const SIGNED = 'https://x.supabase.co/storage/v1/object/upload/sign/business-documents/u1/a.png?token=t';

function stubFetch(put: () => Promise<Response>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === LOCAL) return new Response(new Blob([new Uint8Array(13_493)]));
    return put();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function failure(): Promise<DocumentUploadError> {
  const err = await uploadDocumentToUrl(SIGNED, LOCAL, 'image/png').then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DocumentUploadError);
  return err as DocumentUploadError;
}

afterEach(() => vi.unstubAllGlobals());

describe('V7 A4: a refused document upload says why', () => {
  it('names the accepted formats when storage refuses the type (the client\'s case)', async () => {
    stubFetch(async () =>
      json(400, { statusCode: '415', error: 'invalid_mime_type', message: 'mime type image/png is not supported' }),
    );
    expect((await failure()).message).toBe(
      "Ce format de fichier n'est pas accepté. Choisissez un PDF, un JPG ou un PNG.",
    );
  });

  it('names the size limit when storage refuses the size', async () => {
    stubFetch(async () =>
      json(400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }),
    );
    expect((await failure()).message).toBe('Le fichier dépasse 10 Mo. Choisissez un fichier plus léger.');
  });

  it('says the link expired when the signed token is refused', async () => {
    stubFetch(async () => json(400, { statusCode: '403', error: 'InvalidJWT', message: '"exp" claim timestamp check failed' }));
    expect((await failure()).message).toBe("Le lien d'envoi a expiré. Réessayez.");
  });

  it('says storage is down on a 5xx', async () => {
    stubFetch(async () => new Response('bad gateway', { status: 502 }));
    expect((await failure()).message).toBe(
      'Le service de stockage est momentanément indisponible. Réessayez dans quelques minutes.',
    );
  });

  it('gives the status for anything else', async () => {
    stubFetch(async () => new Response('', { status: 409 }));
    expect((await failure()).message).toBe("L'envoi du fichier a échoué (erreur 409). Réessayez.");
  });

  it('says the connection failed when the PUT never reaches storage', async () => {
    stubFetch(async () => {
      throw new TypeError('Network request failed');
    });
    expect((await failure()).message).toBe(
      'Connexion impossible. Vérifiez votre connexion internet et réessayez.',
    );
  });

  it('says the file could not be read when the local file is gone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Network request failed');
      }),
    );
    expect((await failure()).message).toBe(
      'Impossible de lire le fichier sur votre téléphone. Choisissez-le à nouveau.',
    );
  });

  it('PUTs the bytes with the declared type and resolves on 200', async () => {
    const fetchMock = stubFetch(async () => new Response('{"Key":"x"}', { status: 200 }));
    await expect(uploadDocumentToUrl(SIGNED, LOCAL, 'image/png')).resolves.toBeUndefined();
    const put = fetchMock.mock.calls.find(([url]) => url === SIGNED) as unknown as [string, RequestInit];
    expect(put[1].method).toBe('PUT');
    expect((put[1].headers as Record<string, string>)['Content-Type']).toBe('image/png');
  });
});
