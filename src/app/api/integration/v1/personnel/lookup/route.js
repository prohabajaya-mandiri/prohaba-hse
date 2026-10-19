import { json } from '@/lib/http';
import { integrationApi } from '@/lib/integration';
import { lookupByNik } from '@/lib/services/personnel';

// POST { niks: [...] } → { matches: [baris sinkronisasi | null] } sesuai urutan. Untuk menautkan data lama.
export const POST = integrationApi(async (request) => lookupByNik(await json(request)));
