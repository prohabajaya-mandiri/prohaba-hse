import { prisma } from './prisma.js';
import { SETTING_DEFAULTS } from './settings-defaults.js';

export async function getSetting(key, db = prisma) {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key]?.value;
}

export async function getSettings(keys, db = prisma) {
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(keys.map((k) => [k, map[k] ?? SETTING_DEFAULTS[k]?.value]));
}
