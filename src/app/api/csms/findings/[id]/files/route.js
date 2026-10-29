import { api, formData, params } from '@/lib/http';
import { uploadFindingFiles } from '@/lib/services/csms-findings';
export const POST = api(async (request, context, user) => uploadFindingFiles(user, (await params(context)).id, (await formData(request)).getAll('files')));
