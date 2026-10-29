// Menyiapkan database Supabase E-HSE melalui Management API (butuh SUPABASE_TOKEN).
//   node --env-file=../prohaba-center/.env.management.local scripts/setup-db.mjs development roles
//   npm run db:migrate
//   node --env-file=../prohaba-center/.env.management.local scripts/setup-db.mjs development grants
// "roles": role migrasi (pemilik tabel) + role runtime (NOBYPASSRLS, tanpa DDL) dan schema.
// "grants": setelah migrasi — hak DML runtime, RLS di semua tabel, AuditLog/ApprovalLog/riwayat laporan append-only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const REF = 'crysaxbpngmscobrukzb';
const POOLER = 'aws-0-ap-southeast-2.pooler.supabase.com';
const [envName, phase] = process.argv.slice(2);
if (!['development', 'production'].includes(envName) || !['roles', 'grants'].includes(phase)) {
  throw new Error('Pemakaian: setup-db.mjs <development|production> <roles|grants>');
}
const prod = envName === 'production';
const schema = prod ? 'public' : 'hse_dev';
const migrate = prod ? 'hse_migrate' : 'hse_migrate_dev';
const runtime = prod ? 'hse_runtime' : 'hse_runtime_dev';
const migFile = `.env.migrations.${envName}.local`;
const rtFile = `.env.runtime.${envName}.local`;
const token = process.env.SUPABASE_TOKEN;
if (!token) throw new Error('SUPABASE_TOKEN diperlukan.');

const q = (v) => "'" + v.replaceAll("'", "''") + "'";
const ident = (v) => '"' + v.replaceAll('"', '""') + '"';
const passwordFrom = (file, key) => (existsSync(file) ? new URL(readFileSync(file, 'utf8').match(new RegExp(key + '="(.*)"'))[1]).password : null);

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Query gagal (${res.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const url = (role, password, port) => {
  const u = new URL(`postgresql://${POOLER}:${port}/postgres`);
  u.username = `${role}.${REF}`;
  u.password = password;
  u.searchParams.set('sslmode', 'verify-full');
  u.searchParams.set('sslrootcert', 'prisma/certs/supabase-ca.crt');
  u.searchParams.set('schema', schema);
  return u.toString();
};

if (phase === 'roles') {
  const migPw = passwordFrom(migFile, 'DIRECT_URL') ?? randomBytes(32).toString('hex');
  const rtPw = passwordFrom(rtFile, 'DATABASE_URL') ?? randomBytes(32).toString('hex');
  const role = (name, pw, inherit) => `DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=${q(name)}) THEN
      CREATE ROLE ${name} LOGIN PASSWORD ${q(pw)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS ${inherit ? 'INHERIT' : 'NOINHERIT'};
    ELSE ALTER ROLE ${name} WITH LOGIN PASSWORD ${q(pw)} NOBYPASSRLS; END IF; END $$;`;
  await sql(`BEGIN;
    ${role(migrate, migPw, true)}
    ${role(runtime, rtPw, false)}
    ${prod ? '' : `CREATE SCHEMA IF NOT EXISTS ${schema};`}
    GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${migrate};
    GRANT USAGE ON SCHEMA ${schema} TO ${runtime};
    REVOKE CREATE ON SCHEMA ${schema} FROM ${runtime};
    ALTER ROLE ${migrate} SET search_path TO ${schema};
    ALTER ROLE ${runtime} SET search_path TO ${schema};
    COMMIT;`);
  writeFileSync(migFile, `# Kredensial migrasi ${envName} — jangan dipakai runtime, jangan di-commit.\nDATABASE_URL="${url(migrate, migPw, 5432)}"\nDIRECT_URL="${url(migrate, migPw, 5432)}"\n`);
  writeFileSync(rtFile, `DATABASE_URL="${url(runtime, rtPw, 6543)}"\n`);
  console.log(`Role ${migrate} & ${runtime} siap untuk schema ${schema}. Kredensial: ${migFile}, ${rtFile}`);
} else {
  // Dijalankan sebagai role migrasi (pemilik tabel); Management API berjalan sebagai postgres yang bukan pemilik.
  const { default: pg } = await import('pg');
  const direct = new URL(readFileSync(migFile, 'utf8').match(/DIRECT_URL="(.*)"/)[1]);
  direct.search = '';
  const client = new pg.Client({ connectionString: direct.toString(), ssl: { ca: readFileSync('prisma/certs/supabase-ca.crt', 'utf8'), rejectUnauthorized: true } });
  await client.connect();
  const ownerSql = async (query) => (await client.query(query)).rows;
  const appendOnly = ['AuditLog', 'ApprovalLog', 'HseReportHistory', 'CsmsFindingHistory'];
  await ownerSql(`BEGIN;
    DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname=${q(schema)} AND tablename<>'_prisma_migrations' LOOP
        EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I.%I TO ${runtime}', ${q(schema)}, t.tablename);
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', ${q(schema)}, t.tablename);
        IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname=${q(schema)} AND tablename=t.tablename AND policyname=${q(runtime + '_access')}) THEN
          EXECUTE format('CREATE POLICY ${runtime}_access ON %I.%I TO ${runtime} USING (true) WITH CHECK (true)', ${q(schema)}, t.tablename);
        END IF;
      END LOOP;
    END $$;
    REVOKE ALL ON TABLE ${schema}."_prisma_migrations" FROM ${runtime};
    REVOKE UPDATE, DELETE ON ${appendOnly.map((t) => `${schema}.${ident(t)}`).join(', ')} FROM ${runtime};
    COMMIT;`);
  await client.end();
  const check = await sql(`SELECT count(*)::int AS tables, count(*) FILTER (WHERE rowsecurity)::int AS rls FROM pg_tables WHERE schemaname=${q(schema)} AND tablename<>'_prisma_migrations'`);
  console.log(`Hak runtime & RLS diterapkan pada schema ${schema}:`, check[0]);
}
