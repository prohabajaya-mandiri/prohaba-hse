import { api } from '@/lib/http';
import { permitSuggestion } from '@/lib/services/permits';
export const GET = api(async (request, context, user) => {
  const sp = new URL(request.url).searchParams;
  return permitSuggestion(user, sp.get('personnelId'), sp.get('startDate'));
});
