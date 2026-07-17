"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function CRMError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("atlas.crm_error", {
      digest: error.digest,
      path: window.location.pathname,
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  function reportError() {
    window.dispatchEvent(new Event("atlas:open-feedback"));
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <section className="atlas-grid-glow w-full max-w-2xl rounded-[30px] border border-rose-400/15 bg-gradient-to-br from-rose-500/[0.08] via-slate-950 to-violet-500/[0.08] p-6 text-center shadow-2xl sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-400/10 text-2xl text-rose-200">!</div>
        <p className="atlas-eyebrow mt-6">Recuperação operacional</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-white">Esta área encontrou uma falha</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-400">
          Seus dados permanecem protegidos. Tente carregar novamente; se o problema continuar, registre o diagnóstico para correção.
        </p>
        {error.digest ? <p className="mt-4 text-xs text-slate-600">Código de diagnóstico: {error.digest}</p> : null}
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <button onClick={reset} className="atlas-button-primary">Tentar novamente</button>
          <button onClick={reportError} className="atlas-button-secondary">Registrar erro</button>
          <Link href="/dashboard" className="atlas-button-secondary text-center">Ir ao Command Center</Link>
        </div>
      </section>
    </main>
  );
}
