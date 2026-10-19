import { authorizeApi } from './api-access.js';
import { InputError } from './validation.js';
import { errorResponse } from './http-errors.js';
import { serialize } from './serialization.js';

export { errorResponse };

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
