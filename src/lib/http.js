import { authorizeApi } from './api-access.js';
import { InputError } from './validation.js';
import { serialize } from './serialization.js';

export function api(handler) {
  return async (request, context) => {
    try {
      const { session, error } = await authorizeApi(request);
      if (error) return error;
      const result = await handler(request, context, session.user);
      return result instanceof Response ? result : Response.json(serialize(result ?? { ok: true }));
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function errorResponse(error) {
  if (error instanceof InputError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return Response.json({ error: 'JSON tidak valid.' }, { status: 400 });
  if (error.code === 'P2002') return Response.json({ error: 'Data sudah ada (duplikat).' }, { status: 409 });
  if (error.code === 'P2025') return Response.json({ error: 'Data tidak ditemukan.' }, { status: 404 });
  if (error.code === 'P2003') return Response.json({ error: 'Data masih digunakan atau relasi tidak valid.' }, { status: 409 });
  console.error('API failure', error.code ?? error.name, error.message);
  return Response.json({ error: 'Transaksi gagal. Silakan coba lagi.' }, { status: 500 });
}

export async function json(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new InputError('Content-Type harus application/json.', 415);
  const raw = await request.text();
  if (raw.length > 2_000_000) throw new InputError('Payload terlalu besar.', 413);
  return JSON.parse(raw);
}

export async function formData(request) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new InputError('Gunakan multipart/form-data.', 415);
  return request.formData();
}

export const params = async (context) => (await context.params) ?? {};
