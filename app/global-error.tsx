"use client";

/**
 * ERRO NA RAIZ — o último anteparo.
 *
 * `app/(crm)/error.tsx` cobre o CRM. O que ficava descoberto era a falha no
 * próprio layout raiz: ali o React desmonta tudo, e o usuário vê uma tela
 * branca sem nada. Tela branca é o pior estado possível — não diz o que houve,
 * não diz se o dado sobreviveu e não dá o que fazer.
 *
 * Esta tela responde as três, e nada mais: sem stack trace, sem código HTTP,
 * sem nome de tabela. O `digest` aparece porque é o que liga o relato da pessoa
 * ao log do servidor, e não revela nada sobre a estrutura do sistema.
 */
export default function ErroGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#0b0f14", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 460, textAlign: "center" }}>
            <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#64748b", margin: 0 }}>Atlas One</p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: "12px 0 0" }}>Algo falhou ao carregar a tela</h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#94a3b8", margin: "8px 0 0" }}>
              O erro foi registrado. Nenhum dado que você já tinha salvo foi perdido. Tente carregar de novo — se
              continuar, avise o suporte com o código abaixo.
            </p>
            {error.digest ? (
              <p style={{ fontSize: 12, color: "#64748b", margin: "12px 0 0", fontFamily: "ui-monospace, monospace" }}>
                código {error.digest}
              </p>
            ) : null}
            <button
              onClick={reset}
              style={{ marginTop: 24, borderRadius: 12, border: 0, background: "#0ea5e9", color: "#fff", fontSize: 14, fontWeight: 600, padding: "10px 18px", cursor: "pointer" }}
            >
              Tentar de novo
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
