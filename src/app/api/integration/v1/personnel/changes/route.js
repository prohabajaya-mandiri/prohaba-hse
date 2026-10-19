import { integrationApi } from '@/lib/integration';
import { personnelChanges } from '@/lib/services/personnel';

// Umpan perubahan untuk salinan lokal (pull, idempoten): ?since=ISO&after=id&limit=500 atau ?ids=a,b
export const GET = integrationApi(async (request) => personnelChanges(Object.fromEntries(new URL(request.url).searchParams)));
