import { fileResponse, loadFile } from '@/lib/files';
import { params } from '@/lib/http';
import { integrationApi } from '@/lib/integration';
import { ktpFile } from '@/lib/services/personnel';

export const GET = integrationApi(async (request, context, user) => {
  const row = await ktpFile(user, (await params(context)).id);
  return fileResponse(await loadFile(row), row, new URL(request.url).searchParams.get('inline') === '1');
});
