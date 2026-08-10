import Link from "next/link";

const destinations = [
  ["Command Center", "/dashboard"],
  ["Leads", "/leads"],
  ["Pipeline", "/pipeline"],
  ["Empreendimentos", "/developments"],
] as const;

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050914] px-4 py-12 text-white">
      <section className="atlas-grid-glow w-full max-w-3xl rounded-[32px] border border-sky-400/10 bg-gradient-to-br from-sky-500/[0.08] via-slate-950 to-violet-500/[0.1] p-6 text-center shadow-2xl sm:p-10">
        <p className="atlas-eyebrow">Atlas route recovery</p>
        <p className="mt-5 text-7xl font-semibold tracking-[-.08em] text-sky-200">404</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Esta rota não está disponível</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-400">
          O endereço pode ter sido alterado, removido ou ainda não pertence ao ambiente atual. Escolha um destino seguro para continuar.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {destinations.map(([label, href]) => (
            <Link key={href} href={href} className="atlas-button-secondary text-center">{label}</Link>
          ))}
        </div>
        <Link href="/" className="mt-7 inline-flex text-xs font-semibold text-slate-500 transition hover:text-sky-300">Voltar ao início</Link>
      </section>
    </main>
  );
}
