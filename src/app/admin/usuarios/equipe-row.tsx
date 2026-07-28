'use client';

import { Badge } from '@/components/ui/Badge';
import { TD, TR } from '@/components/ui/Table';
import type { UserRole } from '@/modules/auth/user.types';

import { MoverParaInterna } from './mover-para-interna';
import { PapelForm } from './papel-form';
import { ResetLinkButton } from './reset-link-button';

type Props = {
  id: string;
  email: string;
  role: UserRole;
  orgName: string;
  carteira: number;
  naOrgInterna: boolean;
  criadoEm: string;
};

export function EquipeRow({ id, email, role, orgName, carteira, naOrgInterna, criadoEm }: Props) {
  return (
    <TR data-testid={`equipe-row-${id}`}>
      <TD className="font-mono text-xs">{email}</TD>
      <TD>
        <PapelForm userId={id} role={role} />
      </TD>
      <TD>
        <div className="space-y-1">
          <span className="text-ink/90">{orgName}</span>
          {naOrgInterna ? null : (
            <div className="space-y-1">
              <Badge variant="warn">Fora da operação interna</Badge>
              <p className="max-w-xs text-xs text-muted">
                Está lotado na empresa de um cliente — se essa empresa for excluída, esta conta vai
                junto.
              </p>
              <MoverParaInterna userId={id} />
            </div>
          )}
        </div>
      </TD>
      <TD data-testid={`equipe-carteira-${id}`}>
        {role === 'analista' ? (
          <span className={carteira === 0 ? 'text-muted' : 'text-ink/90'}>
            {carteira === 1 ? '1 empresa' : `${carteira} empresas`}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </TD>
      <TD className="text-muted">{criadoEm}</TD>
      <TD>
        <ResetLinkButton userId={id} />
      </TD>
    </TR>
  );
}
