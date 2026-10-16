import { api } from '@/lib/http';
import { listSettings } from '@/lib/services/settings-admin';
export const GET = api(async () => listSettings());
