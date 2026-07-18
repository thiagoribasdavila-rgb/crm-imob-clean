"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AtlasRecoverableError } from "@/components/ui/AtlasUI";

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
      <section className="atlas-grid-glow w-full max-w-2xl rounded-[30px] border border-rose-400/15 bg-gradient-to-br from-rose-500/[0.08] via-slate-950 to-violet-500/[0.08] p-6 shadow-2xl sm:p-10">
        <p className="atlas-eyebrow mb-5">Recuperação operacional</p>
        <AtlasRecoverableError
          scope="page"
          title="Esta tela precisa ser recarregada"
          description="Tente novamente. Se a falha continuar, registre o diagnóstico ou volte ao Command Center."
          onRetry={reset}
          secondaryAction={
            <>
              <button type="button" onClick={reportError} className="atlas-button-secondary min-h-11">Registrar erro</button>
              <Link href="/dashboard" className="atlas-button-secondary min-h-11 text-center">Ir ao Command Center</Link>
            </>
          }
        />
      </section>
    </main>
  );
}
