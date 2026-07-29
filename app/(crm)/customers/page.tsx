/**
 * "Clientes 360" (`/customers`) MORREU em 2026-07-29. Aqui só resta a porta.
 *
 * ── POR QUE ─────────────────────────────────────────────────────────────────
 *
 * 1. Era a MESMA tabela. `readCompatibleCustomers` era um alias de
 *    `readCompatibleLeads` — mesma `public.leads`, mesmo select, só trocava o
 *    rótulo da origem. Duas telas para a mesma lista é o corretor reaprendendo
 *    o app, e duas verdades que divergem com o tempo.
 *
 * 2. Não tinha SLA, filtros, seleção em lote nem ordenação. Tudo isso já
 *    existia em `/leads`.
 *
 * 3. O motivo grave: NÃO APLICAVA O PISO DE CARTEIRA. A rota
 *    `GET /api/v1/customers` (apagada junto) chamava o repositório apenas com
 *    `{ organizationId, limit: 5000 }` — sem `ownerId` — e delegava a fronteira
 *    ao RLS, cuja política `leads_org_access` é PERMISSIVE por organização e
 *    portanto ANULA o recorte por dono. Na prática: um corretor abria
 *    `/customers` e via as 469 leads da imobiliária inteira, com telefone,
 *    e-mail e botão de copiar. `/leads` sempre aplicou o piso
 *    (`filtroDaMinhaCarteira` / `leSoAPropriaCarteira`).
 *
 * ── O QUE SOBREVIVEU, E ONDE ────────────────────────────────────────────────
 *
 * As duas únicas capacidades próprias dela foram migradas para `/leads`:
 *   • segmentos por vínculo  → regra em `lib/crm/vinculo-do-cliente.ts`,
 *     chips em `app/(crm)/leads/page.tsx`, filtro servidor-side no parâmetro
 *     `vinculo` de `app/api/v1/crm/leads/route.ts` (filtra a carteira inteira,
 *     não só a página visível);
 *   • copiar telefone / e-mail em um clique → chips na tabela de `/leads`.
 *
 * ── POR QUE UM REDIRECT E NÃO UM 404 ────────────────────────────────────────
 *
 * A rota precisa continuar respondendo: a memória de workspace do usuário
 * guarda "/customers" no localStorage, `scripts/test-real-routes.mjs` faz probe
 * HTTP nela e vários documentos a citam. 404 seria pior que redirect — quem
 * tinha a tela aberta cai direto na carteira, com piso aplicado.
 */
import { redirect } from "next/navigation";

export default function ClientesRedirecionado() {
  redirect("/leads");
}
