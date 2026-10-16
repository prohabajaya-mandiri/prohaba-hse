import { api, json } from '@/lib/http';
import { listNotifications, markRead, unreadCount } from '@/lib/services/inbox';

export const GET = api(async (request, context, user) => {
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  return sp.count ? unreadCount(user) : listNotifications(user, sp);
});
export const POST = api(async (request, context, user) => markRead(user, await json(request)));
