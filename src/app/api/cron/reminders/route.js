import { timingSafeEqual } from 'node:crypto';
import { runReminders } from '@/lib/services/reminders';
import { errorResponse } from '@/lib/http';

// Dipanggil Vercel Cron dengan header Authorization: Bearer CRON_SECRET (bukan sesi pengguna).
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get('authorization') ?? '';
  const expected = 'Bearer ' + (secret ?? '');
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return Response.json(await runReminders());
  } catch (error) {
    return errorResponse(error);
  }
}
