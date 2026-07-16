import type { Metadata } from 'next';

import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: 'Criar conta' };

export default function SignUpPage() {
  return <SignUpForm />;
}
