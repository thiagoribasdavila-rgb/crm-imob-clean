import Link from "next/link";

/**
 * PÁGINA NÃO ENCONTRADA — global.
 *
 * O produto tinha 198 páginas e ZERO `not-found.tsx`. Uma URL errada caía no
 * padrão do Next: uma tela preta e branca, em inglês, sem caminho de volta e
 * sem a marca. Para quem clicou num link antigo, isso é indistinguível de "o
 * sistema caiu".
 *
 * Esta tela faz três coisas que a padrão não faz: diz em português o que
 * aconteceu, diz que nenhum dado foi perdido, e oferece os dois caminhos que a
 * pessoa realmente quer — voltar ao trabalho ou procurar de novo.
 */
export default function NaoEncontrada() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--atlas-bg,#0b0f14)] p-6">
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Atlas One</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Esta página não existe</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          O endereço pode ter mudado ou o link estar desatualizado. Nada foi perdido — seus dados
          continuam no lugar.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/command-center"
            className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            Ir para a sala de comando
          </Link>
          <Link
            href="/leads"
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            Abrir a lista de leads
          </Link>
        </div>
      </div>
    </main>
  );
}
