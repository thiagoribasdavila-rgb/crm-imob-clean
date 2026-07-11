"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[65vh] items-center justify-center">
      <section className="atlas-panel max-w-xl p-8 text-center sm:p-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-rose-400/20 bg-rose-400/10 text-xl text-rose-300">!</div>
        <p className="atlas-eyebrow mt-6">Atlas recovery</p>
        <h2 className="mt-3 text-2xl font-semibold text-white">O módulo encontrou uma falha.</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">Nenhuma alteração foi executada automaticamente. Tente carregar novamente ou retorne ao Command Center.</p>
        <p className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-left text-xs text-slate-500">{error.message || "Erro inesperado"}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={reset} className="atlas-button-primary">Tentar novamente</button><a href="/dashboard" className="atlas-button-secondary">Voltar ao dashboard</a></div>
      </section>
    </div>
  );
}
