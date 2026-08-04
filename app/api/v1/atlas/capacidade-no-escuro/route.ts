import type { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CATALOGO, montarPainel, resumo, type FatoMedido } from "@/lib/atlas/capacidade-no-escuro";

export const dynamic = "force-dynamic";

/**
 * O QUE ESTÁ CONSTRUÍDO E APAGADO — medido, não declarado.
 *
 * Levantado em 03/08/2026: 82 tabelas com zero linhas, 67 com código que as lê.
 * Nenhuma quebrada; todas esperando configuração que ninguém sabia que faltava,
 * porque o produto não tinha onde dizer.
 *
 * A regra mora em `lib/atlas/capacidade-no-escuro.ts`, pura e testada. Esta rota
 * só CONTA — e conta dentro da organização de quem pergunta, nunca no total do
 * banco: "3 corretores com WhatsApp" da empresa vizinha não acende nada aqui.
 *
 * ── O QUE ESTA ROTA NUNCA FAZ ──────────────────────────────────────────────
 *
 * Devolver zero quando a contagem falhou. Zero aqui vira "apagada" e manda a
 * pessoa configurar o que já está configurado; pior, uma falha de leitura em
 * `whatsapp_broker_sessions` acenderia um alarme falso de "toda lead
 * represada". Contagem que não pôde ser lida NÃO entra na lista de fatos, e o
 * módulo puro trata a ausência como estado desconhecido — nunca como saudável.
 */
export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "atlas.capacidade-no-escuro" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager"],
  });
  if (!identity.ok) return identity.response;

  const admin = getSupabaseAdmin();
  const org = identity.access.organization.id;
  const contar = async (tabela: string, filtro?: (q: ReturnType<typeof admin.from>) => unknown) => {
    let consulta = admin.from(tabela).select("*", { count: "exact", head: true }).eq("organization_id", org);
    if (filtro) consulta = filtro(consulta as never) as typeof consulta;
    const { count, error } = await consulta;
    // `null` significa "não consegui contar" e é diferente de 0. O módulo puro
    // depende dessa distinção para não inventar boa notícia.
    return error ? null : (count ?? 0);
  };

  const [
    whatsappConectado, elenco, verbas, canalDoCorretor,
    limites, prioridades, datasets, tokenDaCapi, gastoDoMes,
  ] = await Promise.all([
    contar("whatsapp_broker_sessions", (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("status", "conectado")),
    contar("distribution_roster", (q) => (q as never as { eq: (a: string, b: boolean) => unknown }).eq("ativo", true)),
    contar("product_budgets"),
    admin.from("profiles").select("*", { count: "exact", head: true })
      .eq("organization_id", org).eq("active", true).not("telegram_chat_id", "is", null)
      .then((r) => (r.error ? null : r.count ?? 0)),
    contar("broker_capacity_limits"),
    contar("lead_distribution_priority_rules"),
    // `mode='live'` e não apenas "existe linha": medido em 03/08/2026, há 1
    // dataset cadastrado e ZERO em produção. Em modo teste a Meta recebe o
    // evento e NÃO o usa para otimizar entrega — contar a linha como capacidade
    // no ar diria que o retorno da venda chega nela, quando não chega.
    contar("meta_conversion_configs", (q) => (q as never as { eq: (a: string, b: string) => unknown }).eq("mode", "live")),
    // O pré-requisito do dataset é o token, que é de AMBIENTE e não de banco.
    Promise.resolve(Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN)),
    admin.from("marketing_spend").select("amount")
      .eq("organization_id", org)
      .gte("spend_date", new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString().slice(0, 10))
      .then((r) => (r.error ? null : (r.data ?? []).reduce((s, l) => s + (Number(l.amount) || 0), 0))),
  ]);

  // Só entram fatos MEDIDOS. Contagem nula fica de fora e vira "desconhecido".
  const fatos: FatoMedido[] = [];
  const add = (chave: string, valor: number | null, extra: Partial<FatoMedido> = {}) => {
    if (valor !== null) fatos.push({ chave, configuradas: valor, ...extra });
  };
  add("whatsapp_do_corretor", whatsappConectado);
  add("fila_de_atendimento", elenco);
  add("verba_por_produto", verbas);
  add("canal_de_aviso_do_corretor", canalDoCorretor);
  add("limites_de_carteira", limites);
  add("prioridade_por_origem", prioridades);
  add("dataset_da_capi", datasets, { prerequisitoPronto: tokenDaCapi });

  // O custo de hoje, medido. É ele que faz alguém agir — a instrução sozinha
  // nunca fez.
  const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const custos: Record<string, string> = {};
  if (gastoDoMes !== null && gastoDoMes > 0) {
    custos.verba_por_produto = `${moeda(gastoDoMes)} saíram nos últimos 30 dias e nenhum orçamento foi cadastrado:`;
  }

  const painel = montarPainel(CATALOGO, fatos, custos);
  return apiSuccess({
    painel,
    resumo: resumo(painel),
    // Quantas contagens não puderam ser feitas. Zero aqui é o que autoriza ler
    // o resto como retrato fiel.
    naoMedidas: CATALOGO.length - fatos.length,
    medidoEm: new Date().toISOString(),
  }, identity.meta, { headers: rate.headers });
}
