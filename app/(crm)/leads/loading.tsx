/**
 * ESQUELETO DE CARREGAMENTO — a casca aparece antes do dado.
 *
 * ── O que foi MEDIDO em 2026-07-31, build de produção ──────────────────────
 *
 *   /pipeline .......... FCP 280 ms · LCP 4.080 ms
 *   /leads ............. FCP 688 ms · LCP 3.472 ms
 *
 * A distância entre os dois é o diagnóstico inteiro: **a casca é rápida, o dado
 * é lento**. O maior elemento da tela é sempre o conteúdo vindo da API, e o LCP
 * marca o instante em que ele aparece — 3 a 4 segundos depois de a estrutura
 * estar pronta.
 *
 * Não é peso de JavaScript: /pipeline baixa 58 KB.
 *
 * Este arquivo dá ao App Router uma fronteira de carregamento por rota. Com ela,
 * a navegação pinta ESTE conteúdo imediatamente em vez de segurar a rota inteira
 * esperando a consulta mais lenta.
 *
 * ── Por que blocos e não um spinner ────────────────────────────────────────
 *
 * Spinner não reserva espaço: quando o dado chega, o layout salta. O CLS medido
 * hoje é 0,012–0,038 (bom) justamente porque a estrutura reserva o espaço — e um
 * esqueleto genérico jogaria isso fora. As proporções abaixo imitam a forma real
 * da tela: cabeçalho, faixa de indicadores, lista.
 *
 * `aria-busy` e o texto para leitor de tela existem porque "está carregando" é
 * informação, e ela não pode ser transmitida só pela animação.
 */
export default function Carregando() {
  return (
    <div className="p-5 sm:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando os dados desta tela.</span>
      <div className="h-7 w-56 animate-pulse rounded-lg bg-white/[.06]" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded bg-white/[.04]" />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="atlas-panel h-24 animate-pulse rounded-2xl" />
        ))}
      </div>
      <div className="mt-6 space-y-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[.03]" />
        ))}
      </div>
    </div>
  );
}
