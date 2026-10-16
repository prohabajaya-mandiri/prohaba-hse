import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

// Kunci induk 32 byte (base64) dari DATA_ENCRYPTION_KEY; diturunkan terpisah untuk enkripsi dan hash.
let cached;
function keys() {
  if (cached) return cached;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) throw new Error('DATA_ENCRYPTION_KEY belum dikonfigurasi.');
  const master = Buffer.from(raw, 'base64');
  if (master.length !== 32) throw new Error('DATA_ENCRYPTION_KEY harus 32 byte base64.');
  const derive = (info) => Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
  cached = { enc: derive('ehse-field-encryption'), hash: derive('ehse-lookup-hash'), file: derive('ehse-file-encryption') };
  return cached;
}

function seal(key, plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

function open(key, sealed) {
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}

export function encrypt(value) {
  if (value === null || value === undefined || value === '') return null;
  return 'v1:' + seal(keys().enc, Buffer.from(String(value), 'utf8')).toString('base64');
}

export function decrypt(value) {
  if (!value) return null;
  if (!value.startsWith('v1:')) throw new Error('Format data terenkripsi tidak dikenal.');
  return open(keys().enc, Buffer.from(value.slice(3), 'base64')).toString('utf8');
}

export const encryptFile = (buffer) => seal(keys().file, buffer);
export const decryptFile = (buffer) => open(keys().file, buffer);

// Hash deterministik untuk deteksi duplikasi NIK tanpa menyimpan NIK terbuka.
export function lookupHash(value) {
  return createHmac('sha256', keys().hash).update(String(value)).digest('hex');
}

export function maskNik(last4) {
  return last4 ? '************' + last4 : '-';
}

export function maskAccount(plain) {
  if (!plain) return null;
  return plain.length <= 4 ? '****' : '*'.repeat(plain.length - 4) + plain.slice(-4);
}
