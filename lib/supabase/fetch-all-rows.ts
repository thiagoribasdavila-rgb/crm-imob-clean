import "server-only";

/**
 * Paginação exaustiva contra o max-rows do PostgREST (1000 no Supabase).
 *
 * Um `.limit(20000)` é letra morta: o servidor corta a resposta em 1000
 * linhas SEM erro, e agregados calculados sobre a amostra truncada saem
 * errados em silêncio (lição F1 desta base — ver attention-signals e
 * capi-feedback, que carregam variantes locais deste mesmo padrão).
 *
 * Este é o helper canônico para rotas de agregação: devolve as linhas, o
 * primeiro erro encontrado (para o chamador decidir 503 vs degradação) e a
 * flag honesta de truncamento quando o teto de páginas é atingido.
 *
 * ── POR QUE O CORPO MORA EM OUTRO ARQUIVO ──────────────────────────────────
 *
 * O `server-only` no topo é o que garante que uma rota não vaze a chave de
 * serviço para o bundle do cliente. Mas ele também tornava esta regra
 * INALCANÇÁVEL para as telas de cliente — e foram exatamente elas que ficaram
 * com `.limit(5000)` sem paginação e sem sentinela (medido em
 * `app/(crm)/reports/page.tsx`, a tela canônica de relatório do diretor).
 *
 * O corpo vive em `paginacao-exaustiva.ts`, sem `server-only`; este arquivo
 * continua sendo a porta do servidor e reexporta. Nenhum chamador muda.
 */
export { fetchAllRowsPure as fetchAllRows, type PagedRows } from "./paginacao-exaustiva.ts";
