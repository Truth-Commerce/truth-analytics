import type { Metadata } from 'next';

import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Redefinir senha' };

export default async function RedefinirSenhaPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return <ResetForm token={params.token} />;
}
