import { api, formData, json, params } from '@/lib/http';
import { linkEvidence, uploadEvidence } from '@/lib/services/csms';
// multipart = unggah file bukti baru; JSON = tautkan bukti/dokumen yang sudah ada.
export const POST = api(async (request, context, user) => {
  const { id } = await params(context);
  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    const form = await formData(request);
    return uploadEvidence(user, id, JSON.parse(form.get('data') ?? '{}'), form.getAll('files'));
  }
  return linkEvidence(user, id, await json(request));
});
