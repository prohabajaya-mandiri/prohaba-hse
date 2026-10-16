import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

// Driver "s3": Supabase Storage (bucket privat) melalui protokol S3 — kredensial khusus storage,
// bukan service role database. Driver "local": hanya untuk development.
const driver = () => process.env.STORAGE_DRIVER || 'local';
const LOCAL_DIR = path.join(process.cwd(), '.storage');

let s3;
async function client() {
  if (s3) return s3;
  const { S3Client } = await import('@aws-sdk/client-s3');
  for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
    if (!process.env[k]) throw new Error(k + ' belum dikonfigurasi.');
  }
  s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'ap-southeast-1',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });
  return s3;
}

function localPath(key) {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error('Storage lokal tidak boleh dipakai di produksi. Set STORAGE_DRIVER=s3.');
  }
  const full = path.join(LOCAL_DIR, key);
  if (!full.startsWith(LOCAL_DIR + path.sep)) throw new Error('Kunci storage tidak valid.');
  return full;
}

export async function putObject(key, body, contentType = 'application/octet-stream') {
  if (driver() === 's3') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (await client()).send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const full = localPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

export async function getObject(key) {
  if (driver() === 's3') {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await (await client()).send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return Buffer.from(await res.Body.transformToByteArray());
  }
  return readFile(localPath(key));
}

export async function deleteObject(key) {
  if (driver() === 's3') {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await (await client()).send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return;
  }
  await unlink(localPath(key)).catch(() => {});
}
