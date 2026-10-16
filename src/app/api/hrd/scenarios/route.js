import { api, json } from '@/lib/http';
import { listScenarios, saveScenario } from '@/lib/services/hrd';
export const GET = api(async () => listScenarios());
export const POST = api(async (request, context, user) => saveScenario(user, null, await json(request)));
