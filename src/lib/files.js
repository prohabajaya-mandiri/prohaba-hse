import { createHash, randomUUID } from 'node:crypto';
import { ensure } from './validation.js';
import { encryptFile, decryptFile } from './crypto.js';
import { putObject, getObject } from './storage.js';

const MAX = 4 * 1024 * 1024; // batas body Vercel 4.5 MB; foto dikompres di browser sebelum diunggah
const TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const SENSITIVITIES = ['GENERAL', 'KTP', 'MEDICAL', 'HR'];

export async function readUpload(file, { imagesOnly = false } = {}) {
  ensure(file && typeof file.arrayBuffer === 'function' && file.size > 0 && file.size <= MAX, 'File harus berukuran 1 byte–4 MB.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  ensure(file.name.length <= 200 && Object.hasOwn(TYPES, ext), 'Jenis file tidak diizinkan.');
  ensure(!imagesOnly || ['png', 'jpg', 'jpeg', 'webp', 'pdf'].includes(ext), 'Hanya foto (JPG/PNG/WEBP) atau PDF.');
  const data = Buffer.from(await file.arrayBuffer());
  const magic = {
    pdf: () => data.subarray(0, 5).toString() === '%PDF-',
    png: () => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    jpg: () => data[0] === 255 && data[1] === 216 && data[2] === 255,
    webp: () => data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP',
    zip: () => data[0] === 0x50 && data[1] === 0x4b,
    ole: () => data.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])),
  };
  const check = { pdf: 'pdf', png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', docx: 'zip', xlsx: 'zip', doc: 'ole', xls: 'ole' }[ext];
  ensure(magic[check](), 'Isi file tidak sesuai jenisnya.');
  return { data, fileName: file.name, mimeType: TYPES[ext] };
}

// Simpan file ke storage privat dan kembalikan data untuk baris FileObject.
export async function storeFile(upload, { sensitivity = 'GENERAL', entityType, entityId = null, siteId = null, label = null, uploadedBy }) {
  ensure(SENSITIVITIES.includes(sensitivity), 'Klasifikasi file tidak valid.');
  const encrypted = sensitivity !== 'GENERAL';
  const body = encrypted ? encryptFile(upload.data) : upload.data;
  const storageKey = `${(entityType || 'misc').toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
  await putObject(storageKey, body, encrypted ? 'application/octet-stream' : upload.mimeType);
  return {
    storageKey,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    size: upload.data.length,
    sha256: createHash('sha256').update(upload.data).digest('hex'),
    sensitivity,
    encrypted,
    entityType,
    entityId,
    siteId,
    label,
    uploadedBy,
  };
}

export async function loadFile(row) {
  const raw = await getObject(row.storageKey);
  return row.encrypted ? decryptFile(raw) : raw;
}

export function fileResponse(data, row, inline = false) {
  const canInline = inline && /^(image\/(png|jpeg|webp)|application\/pdf)$/.test(row.mimeType);
  return new Response(data, {
    headers: {
      'Content-Type': canInline ? row.mimeType : 'application/octet-stream',
      'Content-Disposition': (canInline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(row.fileName),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}

export function xlsxResponse(buffer, fileName) {
  return new Response(buffer, {
    headers: {
      'Content-Type': TYPES.xlsx,
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(fileName),
      'Cache-Control': 'private, no-store',
    },
  });
}
