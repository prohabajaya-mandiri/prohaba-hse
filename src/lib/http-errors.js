// Pemetaan error ke respons HTTP. Terpisah dari http.js (yang memuat sesi) agar dapat dipakai route integrasi & diuji.
import { InputError } from './validation.js';

export function errorResponse(error) {
  if (error instanceof InputError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return Response.json({ error: 'JSON tidak valid.' }, { status: 400 });
  if (error.code === 'P2002') return Response.json({ error: 'Data sudah ada (duplikat).' }, { status: 409 });
  if (error.code === 'P2025') return Response.json({ error: 'Data tidak ditemukan.' }, { status: 404 });
  if (error.code === 'P2003') return Response.json({ error: 'Data masih digunakan atau relasi tidak valid.' }, { status: 409 });
  console.error('API failure', error.code ?? error.name, error.message);
  return Response.json({ error: 'Transaksi gagal. Silakan coba lagi.' }, { status: 500 });
}
