import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';
import { consumeLoginAttempt, validSession } from './lib/login-security.js';
import { loadSessionUser } from './lib/session-user.js';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  // Vercel terminates HTTPS before forwarding requests to server components.
  ...(process.env.VERCEL ? { useSecureCookies: true } : {}),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      const id = user?.id ?? token.id;
      if (!id) return null;
      const current = await loadSessionUser(prisma, id, user?.operatorId ?? token.operatorId);
      if (!validSession(user ? { sessionVersion: user.sessionVersion } : token, current)) return null;
      // Akun bersama wajib memiliki operator aktif yang teridentifikasi.
      if (current.isShared && !current.operatorName) return null;
      return {
        ...token,
        id: current.id,
        name: current.name,
        email: current.email,
        role: current.role,
        sessionVersion: current.sessionVersion,
        siteIds: current.siteIds,
        isShared: current.isShared,
        operatorId: current.operatorId,
        operatorName: current.operatorName,
      };
    },
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        operator: { label: 'Operator', type: 'text' },
        pin: { label: 'PIN', type: 'password' },
      },
      async authorize(credentials, request) {
        if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string') return null;
        const email = credentials.email.trim().toLowerCase();
        if (email.length > 254 || !email.includes('@') || Buffer.byteLength(credentials.password) > 72) return null;
        const ip = request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
        if (!(await consumeLoginAttempt(prisma, email, ip))) return null;
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, password: true, role: true, isActive: true, isShared: true, sessionVersion: true },
        });
        if (!user || !user.isActive || !user.password) return null;
        if (!(await bcrypt.compare(credentials.password, user.password))) return null;

        let operatorId = null;
        if (user.isShared) {
          // Nama operator diketik (tidak ada daftar operator yang dibuka sebelum login).
          if (typeof credentials.operator !== 'string' || typeof credentials.pin !== 'string' || credentials.pin.length > 12) return null;
          const operator = await prisma.operator.findFirst({
            where: { name: { equals: credentials.operator.trim(), mode: 'insensitive' }, userId: user.id, isActive: true },
            select: { id: true, pinHash: true },
          });
          if (!operator || !(await bcrypt.compare(credentials.pin, operator.pinHash))) return null;
          operatorId = operator.id;
        }
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, name: user.name, email: user.email, role: user.role, sessionVersion: user.sessionVersion, operatorId };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
});
