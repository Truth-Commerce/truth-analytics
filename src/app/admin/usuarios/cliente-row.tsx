'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { TD, TR } from '@/components/ui/Table';
import { PLANO_LABEL, STATUS_ORG_LABEL } from '@/lib/labels';
import type { OrgStatus, Plano } from '@/modules/auth/user.types';

import { PapelForm } from './papel-form';
import { ResetLinkButton } from './reset-link-button';

type Props = {
  id: string;
  email: string;
  orgId: string;
  orgName: string;
  orgStatus: OrgStatus;
  plano: Plano | null;
  criadoEm: string;
};

const STATUS_VARIANT: Record<OrgStatus, 'success' | 'warn' | 'danger'> = {
  active: 'success',
  pending: 'warn',
  suspended: 'danger',
};

export function ClienteRow({ id, email, orgId, orgName, orgStatus, plano, criadoEm }: Props) {
  return (
    <TR data-testid={`cliente-row-${id}`}>
      <TD className="font-mono text-xs">{email}</TD>
      <TD>
        <Link href={`/admin/${orgId}`} className="text-ink/90 hover:text-brand hover:underline">
          {orgName}
        </Link>
      </TD>
      <TD>
        <Badge variant={STATUS_VARIANT[orgStatus]}>{STATUS_ORG_LABEL[orgStatus]}</Badge>
      </TD>
      <TD className="font-mono text-muted">{plano ? PLANO_LABEL[plano] : '—'}</TD>
      <TD className="text-muted">{criadoEm}</TD>
      <TD>
        <div className="space-y-2">
          <ResetLinkButton userId={id} />
          <PapelForm userId={id} role="client" />
        </div>
      </TD>
    </TR>
  );
}
