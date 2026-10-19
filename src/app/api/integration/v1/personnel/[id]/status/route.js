import { json, params } from '@/lib/http';
import { integrationApi } from '@/lib/integration';
import { setWorkStatus } from '@/lib/services/personnel';

export const POST = integrationApi(async (request, context, user) => setWorkStatus(user, (await params(context)).id, await json(request)));
