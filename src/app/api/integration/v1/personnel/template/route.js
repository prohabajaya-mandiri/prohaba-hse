import { xlsxResponse } from '@/lib/files';
import { integrationApi } from '@/lib/integration';
import { importTemplate } from '@/lib/services/personnel';

export const GET = integrationApi(async () => xlsxResponse(importTemplate(), 'Template_Import_Karyawan_PJM.xlsx'));
