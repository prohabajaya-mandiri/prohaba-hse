import { api, json } from '@/lib/http';
import { listCompetencies, saveCompetency } from '@/lib/services/training';
export const GET = api(async () => listCompetencies());
export const POST = api(async (request, context, user) => saveCompetency(user, null, await json(request)));
