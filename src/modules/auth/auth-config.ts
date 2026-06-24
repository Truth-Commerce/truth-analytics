import type { NextAuthConfig } from 'next-auth';

import type { OrgStatus, UserRole } from '@/modules/auth/user.types';

type SharedAuthConfig = Pick<NextAuthConfig, 'pages' | 'session' | 'callbacks' | 'providers'>;

const clientRoutes = ['/dashboard'];
const adminRoutes = ['/admin'];

export const authConfig = {
  pages: { signIn: '/sign-in', error: '/sign-in' },
  session: { strategy: 'jwt' },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // Checagem barata na BORDA usando o snapshot do JWT (`auth.user.role`).
      // O JWT é só um retrato do login e pode estar defasado (ex.: admin
      // rebaixado cujo token ainda não expirou). A AUTORIDADE de acesso é a
      // reconsulta ao banco nos helpers de página (`requireAdmin`/`requireActiveOrg`,
      // que chamam `getUserAccessById`). NUNCA troque essa reconsulta por
      // `session.user.role`/`status` — isso quebraria o modelo de segurança.
      const isLoggedIn = Boolean(auth?.user);
      const isAdminRoute = adminRoutes.some((r) => nextUrl.pathname.startsWith(r));
      const isClientRoute = clientRoutes.some((r) => nextUrl.pathname.startsWith(r));

      if (isAdminRoute) {
        if (!isLoggedIn) return false;
        if (auth?.user?.role !== 'admin_truth') {
          return Response.redirect(new URL('/dashboard', nextUrl));
        }
        return true;
      }

      if (isClientRoute) return isLoggedIn;

      if (isLoggedIn && nextUrl.pathname === '/sign-in') {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }

      return true;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as UserRole | undefined) ?? 'client';
        session.user.orgId = (token.orgId as string | undefined) ?? '';
        session.user.orgStatus =
          (token.orgStatus as OrgStatus | undefined) ?? 'pending';
      }
      return session;
    },
  },
} satisfies SharedAuthConfig;
