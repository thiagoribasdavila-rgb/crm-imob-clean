"use client";

import { useEffect } from "react";

/**
 * Erro global — última rede de segurança quando algo falha FORA do grupo (crm)
 * (ex.: rotas de outros route groups, ou falha no próprio layout raiz). Sem
 * isto, o Next mostra a tela branca padrão. global-error substitui o layout
 * raiz, então renderiza o próprio <html>/<body>. Espelha o tom de (crm)/error.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("atlas.global_error", {
      digest: error.digest,
      path: typeof window !== "undefined" ? window.location.pathname : "",
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#070a0f", color: "#f4f7fb", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
          <section
            style={{
              maxWidth: "520px", width: "100%", padding: "32px",
              border: "1px solid rgba(251,113,133,.18)", borderRadius: "24px",
              background: "linear-gradient(160deg, rgba(251,113,133,.08), #0d121b)",
            }}
          >
            <p style={{ fontSize: "11px", letterSpacing: ".2em", textTransform: "uppercase", color: "#6d6a7a", margin: 0 }}>
              Recuperação operacional
            </p>
            <h1 style={{ fontSize: "22px", fontWeight: 650, margin: "10px 0 8px" }}>
              Algo falhou nesta tela
            </h1>
            <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#a8b3c2", margin: "0 0 22px" }}>
              Tente recarregar. Se continuar, volte ao início — nada foi perdido.
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={reset}
                style={{ border: 0, cursor: "pointer", padding: "10px 18px", borderRadius: "11px", fontSize: "13px", fontWeight: 600, background: "#4b8df8", color: "#04122e" }}
              >
                Tentar de novo
              </button>
              <a
                href="/"
                style={{ padding: "10px 18px", borderRadius: "11px", fontSize: "13px", fontWeight: 600, background: "transparent", color: "#f4f7fb", border: "1px solid rgba(255,255,255,.12)", textDecoration: "none" }}
              >
                Ir ao início
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
