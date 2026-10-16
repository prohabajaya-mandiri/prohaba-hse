import { api } from '@/lib/http';
import { xlsxResponse } from '@/lib/files';
import { importTemplate } from '@/lib/services/personnel';
export const GET = api(async () => xlsxResponse(importTemplate(), 'Template_Import_Personel_EHSE.xlsx'));
