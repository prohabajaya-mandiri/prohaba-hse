import { params } from '@/lib/http';
import { integrationApi } from '@/lib/integration';
import { revealSensitive } from '@/lib/services/personnel';

export const GET = integrationApi(async (request, context, user) =>
  revealSensitive(user, (await params(context)).id, new URL(request.url).searchParams.get('kind')));
