import type { Metadata } from 'next';

import { EsqueciSenhaForm } from './esqueci-senha-form';

export const metadata: Metadata = { title: 'Esqueci minha senha' };

export default function EsqueciSenhaPage() {
  return <EsqueciSenhaForm />;
}
