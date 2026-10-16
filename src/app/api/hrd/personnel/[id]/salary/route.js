import { api, json, params } from '@/lib/http';
import { saveSalary } from '@/lib/services/hrd';
export const POST = api(async (request, context, user) => saveSalary(user, (await params(context)).id, await json(request)));
