import type { OrgStatus, UserRole } from '@/modules/auth/user.types';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      role: UserRole;
      orgId: string;
      orgStatus: OrgStatus;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRole;
    orgId?: string;
    orgStatus?: OrgStatus;
  }
}
