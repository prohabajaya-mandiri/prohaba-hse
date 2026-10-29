// Klien server-ke-server ke ERP Center (arah E-HSE → ERP) untuk data operasional yang sudah dicatat di ERP:
// alat/unit & pemeliharaan, absensi harian. Ditandatangani HMAC (integration-signature.js) dengan secret bersama
// INTEGRATION_CENTER_SECRET dan kode klien "hse". Hanya dipakai di server; secret tidak pernah dikirim ke browser.
import { signedHeaders } from './integration-signature.js';
import { InputError } from './validation.js';

const CLIENT = 'hse';

export function centerConfigured() {
  return Boolean(process.env.CENTER_API_URL && (process.env.INTEGRATION_CENTER_SECRET ?? '').length >= 32);
}

/** URL publik ERP untuk tautan "buka di ERP" (tanpa data rahasia). */
export const centerPublicUrl = () => (process.env.CENTER_API_URL ? new URL(process.env.CENTER_API_URL).origin : null);

/** GET /api/integration/v1/hse{path} atas nama pengguna E-HSE. Galat ERP diteruskan sebagai InputError. */
export async function centerFetch(user, path, query = {}, { timeout = 15000 } = {}) {
  if (!centerConfigured()) throw new InputError('Integrasi ERP Center belum dikonfigurasi (CENTER_API_URL dan INTEGRATION_CENTER_SECRET).', 503);
  const url = new URL('/api/integration/v1/hse' + path, process.env.CENTER_API_URL);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const headers = signedHeaders(process.env.INTEGRATION_CENTER_SECRET, {
    client: CLIENT, method: 'GET', path: url.pathname + url.search, body: '',
    actor: { id: String(user.id), name: String(user.operatorName ?? user.name ?? 'Pengguna E-HSE'), role: String(user.role) },
  });
  let res;
  try {
    res = await fetch(url, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeout) });
  } catch {
    throw new InputError('ERP Center tidak dapat dihubungi. Coba lagi beberapa saat.', 503);
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401) throw new InputError('Koneksi ke ERP Center ditolak: kredensial integrasi atau peran tidak cocok.', 502);
    throw new InputError(data?.error ?? 'ERP Center mengembalikan galat ' + res.status + '.', res.status >= 500 ? 502 : res.status);
  }
  return data;
}
