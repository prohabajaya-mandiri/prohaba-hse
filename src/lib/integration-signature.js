// Tanda tangan permintaan antar-aplikasi (E-HSE ⇄ ERP Center). Fungsi murni tanpa database agar dapat diuji.
// BERKAS INI IDENTIK di prohaba-hse/src/lib/integration-signature.js dan prohaba-center/src/lib/integration-signature.js.
//
// Setiap permintaan membawa header:
//   X-PJM-Client     : kode klien (mis. "center")
//   X-PJM-Timestamp  : detik Unix saat permintaan dibuat (toleransi ±5 menit)
//   X-PJM-Actor      : base64url(JSON { id, name, role }) — pengguna yang melakukan aksi di aplikasi asal
//   X-PJM-Signature  : "v1=" + HMAC-SHA256(secret, kanonik) dalam hex
// Kanonik = v1 \n client \n timestamp \n METHOD \n path+query \n sha256(body) \n actor
// sehingga metode, URL, isi, waktu dan identitas pelaku tidak dapat diubah tanpa merusak tanda tangan.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_VERSION = 'v1';
export const MAX_SKEW_SECONDS = 300;
export const HEADERS = {
  client: 'x-pjm-client',
  timestamp: 'x-pjm-timestamp',
  actor: 'x-pjm-actor',
  signature: 'x-pjm-signature',
};

export const encodeActor = (actor) => Buffer.from(JSON.stringify({ id: actor.id, name: actor.name, role: actor.role })).toString('base64url');

export function decodeActor(value) {
  try {
    const actor = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    return actor && typeof actor.id === 'string' && typeof actor.name === 'string' && typeof actor.role === 'string' ? actor : null;
  } catch {
    return null;
  }
}

export function canonical({ client, timestamp, method, path, body, actor }) {
  const bodyHash = createHash('sha256').update(body ?? '').digest('hex');
  return [SIGNATURE_VERSION, client, String(timestamp), String(method).toUpperCase(), path, bodyHash, actor].join('\n');
}

export const sign = (secret, parts) => SIGNATURE_VERSION + '=' + createHmac('sha256', secret).update(canonical(parts)).digest('hex');

/** Header lengkap untuk satu permintaan. `path` = pathname + query persis seperti yang diterima server. */
export function signedHeaders(secret, { client, method, path, body, actor, now = Date.now() }) {
  const timestamp = Math.floor(now / 1000);
  const actorHeader = encodeActor(actor);
  return {
    [HEADERS.client]: client,
    [HEADERS.timestamp]: String(timestamp),
    [HEADERS.actor]: actorHeader,
    [HEADERS.signature]: sign(secret, { client, timestamp, method, path, body, actor: actorHeader }),
  };
}

/** true bila tanda tangan cocok dan waktu permintaan masih dalam toleransi. */
export function verify(secret, { client, timestamp, method, path, body, actor }, signature, now = Date.now()) {
  if (!secret || !client || !actor || typeof signature !== 'string' || !/^\d{9,11}$/.test(String(timestamp ?? ''))) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
  const expected = Buffer.from(sign(secret, { client, timestamp, method, path, body, actor }));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
