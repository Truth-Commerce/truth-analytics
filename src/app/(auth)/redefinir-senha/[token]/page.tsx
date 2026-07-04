import { ResetForm } from './reset-form';

export default function RedefinirSenhaPage({ params }: { params: { token: string } }) {
  return <ResetForm token={params.token} />;
}
