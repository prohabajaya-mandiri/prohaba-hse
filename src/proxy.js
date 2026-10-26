import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canAccess } from '@/lib/access';

export default auth((req) => {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith('/api/')) return NextResponse.next();
  // Form pendaftaran pegawai baru: publik, tanpa login.
  if (pathname === '/daftar') return NextResponse.next();
  if (pathname === '/' || pathname === '/login') {
    return req.auth?.user ? NextResponse.redirect(new URL('/dashboard', req.url)) : NextResponse.next();
  }
  if (!req.auth?.user) return NextResponse.redirect(new URL('/login', req.url));
  if (!canAccess(req.auth.user.role, pathname)) return NextResponse.redirect(new URL('/dashboard', req.url));
  return NextResponse.next();
});
export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|brand/|favicon.ico|icon.png|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
