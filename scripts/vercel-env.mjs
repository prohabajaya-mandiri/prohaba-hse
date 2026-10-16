// Mengisi environment variable project Vercel prohaba-hse (butuh VERCEL_TOKEN).
//   node --env-file=../prohaba-center/.env.management.local scripts/vercel-env.mjs
// Production ← .env.production.local (schema public). Preview & Development ← .env (schema hse_dev).
// Kredensial migrasi, token management dan S3 key yang kosong tidak pernah dikirim.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const PROJECT = 'prj_dgt7q3GQ3EznEq5GxTq3jPxED3XF';
const TEAM = 'team_FZcdU7toXUA6qTBVJ0poIPx4';
const token = process.env.VERCEL_TOKEN;
if (!token) throw new Error('VERCEL_TOKEN diperlukan.');

const KEYS = ['DATABASE_URL', 'AUTH_SECRET', 'AUTH_URL', 'DATA_ENCRYPTION_KEY', 'CRON_SECRET', 'APP_TIMEZONE', 'STORAGE_DRIVER', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
const FORBIDDEN = ['DIRECT_URL', 'SUPABASE_TOKEN', 'VERCEL_TOKEN'];

async function api(path, method = 'GET', body) {
  const res = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM}`, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vercel ${method} ${path.split('?')[0]} gagal: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const production = parseEnv(readFileSync('.env.production.local', 'utf8'));
const development = {
  ...parseEnv(readFileSync('.env', 'utf8')),
  // Preview memakai bucket terpisah; AUTH_URL lokal tidak berlaku di Vercel (host dipercaya otomatis).
  STORAGE_DRIVER: 's3', S3_ENDPOINT: production.S3_ENDPOINT, S3_REGION: production.S3_REGION, S3_BUCKET: 'hse-dev-private',
  AUTH_URL: undefined, APP_TIMEZONE: production.APP_TIMEZONE,
};
const s3Dev = existsSync('.env.storage.development.local') ? parseEnv(readFileSync('.env.storage.development.local', 'utf8')) : {};
Object.assign(development, s3Dev);

if (new URL(production.DATABASE_URL).searchParams.get('schema') !== 'public' || !production.DATABASE_URL.includes('hse_runtime.')) throw new Error('DATABASE_URL produksi harus role hse_runtime, schema public.');
if (new URL(development.DATABASE_URL).searchParams.get('schema') !== 'hse_dev') throw new Error('DATABASE_URL development harus schema hse_dev.');

const { envs } = await api(`/v10/projects/${PROJECT}/env`);
for (const e of envs.filter((x) => FORBIDDEN.includes(x.key))) await api(`/v9/projects/${PROJECT}/env/${e.id}`, 'DELETE');

const sent = [];
for (const [target, values] of [[['production'], production], [['preview', 'development'], development]]) {
  for (const key of KEYS) {
    if (!values[key]) continue;
    await api(`/v10/projects/${PROJECT}/env?upsert=true`, 'POST', { key, value: values[key], type: 'encrypted', target });
    sent.push(`${key}@${target.join('/')}`);
  }
}
await api(`/v9/projects/${PROJECT}`, 'PATCH', { nodeVersion: '22.x', installCommand: 'npm ci', buildCommand: 'npm run verify' });
console.log('Env terkirim:', sent.join(', '));
