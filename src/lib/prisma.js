import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { supabaseCa } from './supabase-ca.js';
import { serialize } from './serialization.js';

const globalForPrisma = globalThis;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL belum dikonfigurasi.');
  const url = new URL(connectionString);
  const local = LOCAL_HOSTS.has(url.hostname);
  if (!local || process.env.VERCEL) {
    // pg URL SSL options override the explicit CA; keep filesystem paths CLI-only.
    url.searchParams.delete('sslrootcert');
    url.searchParams.delete('sslmode');
  }
  const schema = url.searchParams.get('schema') ?? 'public';
  url.searchParams.delete('schema');
  const adapter = new PrismaPg({
    connectionString: url.toString(),
    ...(local && !process.env.VERCEL ? {} : { ssl: { ca: supabaseCa, rejectUnauthorized: true } }),
    max: local ? 1 : 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
  }, { schema });

  return new PrismaClient({
    adapter,
    omit: { user: { password: true }, operator: { pinHash: true } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }).$extends({ query: { async $allOperations({ args, query }) { return serialize(await query(args)); } } });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
