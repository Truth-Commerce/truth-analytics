import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { serverEnv } from '@/lib/env';
import { authConfig } from '@/modules/auth/auth-config';
import { verifyPassword } from '@/modules/auth/password';
import {
  getUserAccessById,
  getUserByEmail,
  normalizeEmail,
} from '@/modules/auth/user.repository';

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  secret: serverEnv.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: { email: {}, senha: {} },
      authorize: async (credentials) => {
        const email = normalizeEmail(String(credentials?.email ?? ''));
        const senha = String(credentials?.senha ?? '');
        if (!email || !senha) return null;

        const user = await getUserByEmail(email);
        if (!user) return null;

        const ok = await verifyPassword(senha, user.senha_hash);
        if (!ok) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        const access = await getUserAccessById(user.id);
        token.role = access?.role ?? 'client';
        token.orgId = access?.orgId ?? '';
        token.orgStatus = access?.orgStatus ?? 'pending';
        // `plano` é deliberadamente NÃO persistido no JWT: ele governa limites (ex.: tracked_products)
        // e deve ser sempre lido do banco via getUserAccessById (autoritativo). Não leia plano da sessão/JWT.
      }
      return token;
    },
  },
});
