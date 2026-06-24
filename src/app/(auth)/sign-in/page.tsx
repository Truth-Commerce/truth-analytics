interface SignInPageProps {
  searchParams: { error?: string };
}

export default function SignInPage({ searchParams }: SignInPageProps) {
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-xl font-semibold">Entrar</h1>
      <form method="POST" action="/api/sign-in" className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="E-mail" className="border p-2" />
        <input name="senha" type="password" placeholder="Senha" className="border p-2" />
        {searchParams.error ? (
          <p className="text-sm text-red-600">{searchParams.error}</p>
        ) : null}
        <button type="submit" className="bg-black p-2 text-white">
          Entrar
        </button>
      </form>
    </main>
  );
}
