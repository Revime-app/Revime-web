/**
 * V7 A4. A failed document upload carries a French reason the screen shows as is. It used to be a
 * plain `Error('Upload failed: 400 …')`, which `entreprise.tsx` could only reduce to « Une erreur est
 * survenue lors de l'envoi. », so the client never learnt that storage had refused his PNG's type.
 */
export class DocumentUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentUploadError';
  }
}

/**
 * Uploads file bytes to a presigned Supabase uploadUrl.
 * Ensures the binary Blob has the correct MIME type so React Native networking doesn't fallback to octet-stream.
 */
export async function uploadDocumentToUrl(
  uploadUrl: string,
  localUri: string,
  mimeType: string,
): Promise<void> {
  let raw: Blob;
  try {
    raw = await (await fetch(localUri)).blob();
  } catch {
    throw new DocumentUploadError('Impossible de lire le fichier sur votre téléphone. Choisissez-le à nouveau.');
  }
  const blob = new Blob([raw], { type: mimeType });

  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': mimeType },
    });
  } catch {
    throw new DocumentUploadError('Connexion impossible. Vérifiez votre connexion internet et réessayez.');
  }
  if (!res.ok) {
    throw new DocumentUploadError(storageRefusal(res.status, await res.text().catch(() => '')));
  }
}

/**
 * Supabase Storage answers a refused upload with HTTP 400 and the real status inside the body, e.g.
 * `{"statusCode":"415","error":"invalid_mime_type","message":"mime type image/png is not supported"}`
 * (the client's PNG, storage log of 2026-10-27 20:58:57 UTC). So the body is read first and the HTTP
 * status is the fallback.
 */
function storageRefusal(httpStatus: number, text: string): string {
  let body: { statusCode?: string | number; error?: string; message?: string } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    // Not JSON: a proxy page or an empty body. The HTTP status decides.
  }
  const code = Number(body.statusCode) || httpStatus;
  const reason = `${body.error ?? ''} ${body.message ?? ''}`.toLowerCase();

  if (code === 415 || reason.includes('mime')) {
    return "Ce format de fichier n'est pas accepté. Choisissez un PDF, un JPG ou un PNG.";
  }
  if (code === 413 || reason.includes('too large') || reason.includes('maximum allowed size')) {
    return 'Le fichier dépasse 10 Mo. Choisissez un fichier plus léger.';
  }
  if (code === 401 || code === 403 || reason.includes('jwt')) {
    return "Le lien d'envoi a expiré. Réessayez.";
  }
  if (code >= 500) {
    return 'Le service de stockage est momentanément indisponible. Réessayez dans quelques minutes.';
  }
  return `L'envoi du fichier a échoué (erreur ${code}). Réessayez.`;
}
