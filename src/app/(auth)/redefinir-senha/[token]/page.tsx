import type { Metadata } from 'next';

import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Redefinir senha' };

export default function RedefinirSenhaPage({ params }: { params: { token: string } }) {
  return <ResetForm token={params.token} />;
}
