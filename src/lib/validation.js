export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function ensure(condition, message, status = 400) {
  if (!condition) throw new InputError(message, status);
}
export function object(value, allowed) {
  ensure(
    value && typeof value === "object" && !Array.isArray(value),
    "Payload harus object.",
  );
  ensure(
    Object.keys(value).every((key) => allowed.includes(key)),
    "Field tidak diizinkan.",
  );
  return value;
}
export function text(value, name, max = 200, optional = false) {
  // Isian opsional yang hanya berisi spasi dianggap kosong.
  if (optional && (value === undefined || value === null || (typeof value === "string" && value.trim() === "")))
    return null;
  ensure(value !== undefined && value !== null && String(value).trim() !== "", name + " wajib diisi.");
  ensure(typeof value === "string", name + " tidak valid.");
  ensure(value.trim().length <= max, name + " maksimal " + max + " karakter.");
  return value.trim();
}
export function number(value, name, min = 0, max = 1e12) {
  ensure(
    (typeof value === "number" || typeof value === "string") &&
      value !== "" &&
      value !== null,
    name + " wajib berupa angka.",
  );
  const n = Number(value);
  ensure(Number.isFinite(n) && n >= min && n <= max, name + " di luar batas.");
  return n;
}
export function money(value, name = "Nominal", min = 0) {
  const n = number(value, name, min);
  ensure(
    Math.abs(n * 100 - Math.round(n * 100)) < 0.01,
    name + " maksimum dua desimal.",
  );
  return n;
}
export function choice(value, values, name = "Status") {
  ensure(value !== undefined && value !== null && value !== "", name + " wajib diisi.");
  ensure(values.includes(value), name + " tidak valid (pilihan: " + values.join(", ") + ").");
  return value;
}
export function date(value, name = "Tanggal") {
  const str = text(value, name, 30);
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(str), name + " harus YYYY-MM-DD.");
  const d = new Date(str + "T00:00:00Z");
  ensure(
    Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === str,
    name + " tidak valid.",
  );
  return d;
}
export function month(value) {
  ensure(
    typeof value === "string" && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(value),
    "Bulan harus YYYY-MM (2000–2099).",
  );
  return value;
}
export function array(value, name, max = 500) {
  ensure(
    Array.isArray(value) && value.length > 0 && value.length <= max,
    name + " harus berisi 1–" + max + " item.",
  );
  return value;
}
export function pagination(params, defaultLimit = 50) {
  const page = number(params.get("page") || 1, "Halaman", 1, 100000),
    limit = number(params.get("limit") || defaultLimit, "Limit", 1, 100);
  ensure(
    Number.isInteger(page) && Number.isInteger(limit),
    "Halaman/limit harus bulat.",
  );
  return { skip: (page - 1) * limit, take: limit, page, limit };
}
export function optionalDate(value, name = "Tanggal") {
  return value === undefined || value === null || value === "" ? null : date(value, name);
}
export function int(value, name, min = 0, max = 1e9) {
  const n = number(value, name, min, max);
  ensure(Number.isInteger(n), name + " harus bilangan bulat.");
  return n;
}
export function optionalNumber(value, name, min = 0, max = 1e12) {
  return value === undefined || value === null || value === "" ? null : number(value, name, min, max);
}
export function bool(value) {
  return value === true || value === "true" || value === "on" || value === 1;
}
export function id(value, name = "ID") {
  ensure(typeof value === "string" && /^[a-z0-9]{8,40}$/i.test(value), name + " tidak valid.");
  return value;
}
export function optionalId(value, name) {
  return value === undefined || value === null || value === "" ? null : id(value, name);
}
export function optionalChoice(value, values, name) {
  return value === undefined || value === null || value === "" ? null : choice(value, values, name);
}
export function npwp(value) {
  if (value === undefined || value === null || value === "") return null;
  const s = String(value).replace(/[\s.\-/]/g, "");
  ensure(/^(\d{15}|\d{16})$/.test(s), "NPWP harus 15 atau 16 digit angka.");
  return s;
}
// No rekening: opsional. Bila diisi, spasi/titik/strip dibuang lalu harus 5–30 digit angka.
export function bankAccount(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const s = String(value).replace(/[\s.\-]/g, "");
  ensure(/^\d{5,30}$/.test(s), "No rekening hanya angka (5–30 digit).");
  return s;
}
// NIP perusahaan: opsional dan bebas format (disimpan apa adanya, hanya spasi di awal/akhir dibuang).
export function nip(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const s = String(value).trim();
  ensure(s.length <= 100, "NIP maksimal 100 karakter.");
  return s;
}
export function nik(value) {
  const s = typeof value === "number" ? String(value) : String(value ?? "").replace(/\s/g, "");
  ensure(/^\d{16}$/.test(s), "NIK harus 16 digit angka.");
  return s;
}
