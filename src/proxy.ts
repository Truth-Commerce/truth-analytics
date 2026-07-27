import NextAuth from 'next-auth';

import { authConfig } from '@/modules/auth/auth-config';

const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
