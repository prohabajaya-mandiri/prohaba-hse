// API integrasi server-ke-server. E-HSE adalah sumber data tunggal (system of record) master karyawan;
// aplikasi lain (ERP Center) membaca & menulis melalui endpoint /api/integration/v1/* yang ditandatangani HMAC.
// Hak akses tetap memakai matriks E-HSE: peran aplikasi asal dipetakan ke peran E-HSE di CLIENTS.
import { canWrite } from './access.js';
import { errorResponse } from './http-errors.js';
import { decodeActor, HEADERS, verify } from './integration-signature.js';
import { serialize } from './serialization.js';

// Peran yang tidak ada di peta ditolak. TOP_MANAGEMENT = Direksi (baca + data HR, tanpa ubah data personel).
// SYSTEM = sinkronisasi otomatis salinan lokal (hanya baca).
export const CLIENTS = {
  center: { secretEnv: 'INTEGRATION_CENTER_SECRET', label: 'ERP Center', roles: { HRD: 'HRD', TOP_MANAGEMENT: 'DIREKSI', SYSTEM: 'DIREKSI' } },
};

/** Pengguna sintetis untuk layanan E-HSE. `integration` membuat audit log mencatat nama pelaku tanpa userId lokal. */
export function integrationUser(clientKey, actor) {
  const client = Object.hasOwn(CLIENTS, clientKey) ? CLIENTS[clientKey] : null;
  const role = client && Object.hasOwn(client.roles, actor?.role) ? client.roles[actor.role] : null;
  if (!role) return null;
  return {
    id: `${clientKey}:${actor.id}`.slice(0, 120),
    name: `${String(actor.name).slice(0, 100)} (${client.label})`,
    role,
    siteIds: [],
    integration: clientKey,
  };
}

/** Verifikasi tanda tangan. Mengembalikan pengguna integrasi atau null. */
export function authenticate(request, body, now = Date.now()) {
  const clientKey = request.headers.get(HEADERS.client) ?? '';
  const client = Object.hasOwn(CLIENTS, clientKey) ? CLIENTS[clientKey] : null;
  const secret = client ? process.env[client.secretEnv] : null;
  if (!secret || secret.length < 32) return null;
  const url = new URL(request.url);
  const actorHeader = request.headers.get(HEADERS.actor) ?? '';
  const ok = verify(secret, {
    client: clientKey,
    timestamp: request.headers.get(HEADERS.timestamp),
    method: request.method,
    path: url.pathname + url.search,
    body,
    actor: actorHeader,
  }, request.headers.get(HEADERS.signature), now);
  return ok ? integrationUser(clientKey, decodeActor(actorHeader)) : null;
}

/**
 * Pembungkus route integrasi (pengganti api() yang berbasis sesi). Permintaan selain GET memerlukan
 * hak tulis modul `module` sesuai peran hasil pemetaan.
 */
export function integrationApi(handler, { module = 'personnel' } = {}) {
  return async (request, context) => {
    try {
      const body = Buffer.from(await request.arrayBuffer());
      const user = authenticate(request, body);
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const reading = ['GET', 'HEAD'].includes(request.method);
      if (!reading && !canWrite(user.role, module)) return Response.json({ error: 'Peran Anda hanya dapat melihat data karyawan.' }, { status: 403 });
      // Body sudah dibaca untuk verifikasi; buat ulang Request agar handler tetap dapat memakai json()/formData().
      const replay = new Request(request.url, { method: request.method, headers: request.headers, body: reading ? undefined : body });
      const result = await handler(replay, context, user);
      return result instanceof Response ? result : Response.json(serialize(result ?? { ok: true }));
    } catch (error) {
      return errorResponse(error);
    }
  };
}
