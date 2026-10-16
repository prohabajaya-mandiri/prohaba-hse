export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.siteIds = token.siteIds ?? [];
        session.user.isShared = Boolean(token.isShared);
        session.user.operatorId = token.operatorId ?? null;
        session.user.operatorName = token.operatorName ?? null;
      }
      return session;
    },
  },
  providers: [], // Add providers with Node.js APIs in auth.js
};
