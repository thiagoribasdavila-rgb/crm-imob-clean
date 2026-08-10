"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#050914] text-white">
        <main className="flex min-h-screen items-center justify-center px-4 py-12">
          <section className="w-full max-w-2xl rounded-[32px] border border-rose-400/15 bg-[#091120] p-6 text-center shadow-2xl sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">
              Recuperação segura
            </p>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              O Atlas encontrou uma inconsistência
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-400">
              Seus dados permanecem protegidos. Tente recuperar a tela; se a
              falha continuar, volte ao acesso e registre o horário do ocorrido.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={reset}
                className="min-h-11 rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
              >
                Tentar novamente
              </button>
              <a
                href="/login"
                className="min-h-11 rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-sky-300/40 hover:text-white"
              >
                Voltar ao acesso
              </a>
            </div>
            {error.digest ? (
              <p className="mt-6 text-xs text-slate-600">
                Referência: {error.digest}
              </p>
            ) : null}
          </section>
        </main>
      </body>
    </html>
  );
}
