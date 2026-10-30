import { api, formData, params } from '@/lib/http';
import { uploadCapaFiles } from '@/lib/services/capa';
export const POST = api(async (request, context, user) => uploadCapaFiles(user, (await params(context)).id, (await formData(request)).getAll('files')));
