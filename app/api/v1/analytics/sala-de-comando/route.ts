/**
 * SALA DE COMANDO — os números do topo e o funil, medidos.
 *
 * ── POR QUE ESTA ROTA EXISTE, E O QUE ELA SE RECUSA A FAZER ─────────────────
 *
 * O layout pedido mostra seis indicadores e um funil de seis etapas. Medido na
 * organização real em 2026-07-30:
 *
 *   novo 336 · contato 27 · qualificacao 6 · visita 0 · proposta 0
 *   negociacao 0 · ganho 1 · perdido 110
 *
 * Três das seis etapas do funil estão VAZIAS, e 336 das 482 leads nunca saíram de
 * "novo". Um funil desenhado sobre isso mostra três barras de largura zero — e a
 * tentação, sempre, é preencher com número de exemplo para a tela "ficar bonita".
 *
 * Esta rota devolve o zero E o motivo dele. Zero com explicação é diagnóstico;
 * zero mudo é uma tela que parece quebrada; número inventado é mentira que vira
 * decisão de verba.
 *
 * ── A CONVERSÃO SÓ É AFIRMADA QUANDO PODE SER ──────────────────────────────
 *
 * Uma venda em 482 leads dá 0,21%. Com amostra de UMA, esse número não distingue
 * uma operação de 0,2% de uma de 2%: ganhar a segunda venda dobraria a taxa. Por
 * isso `conversao.afirmavel` viaja junto — a tela mostra a taxa OU diz que ainda
 * não dá para afirmar, e nunca imprime um percentual com cara de medida.
 */
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** A ordem do funil comercial. `perdido` e `comprou_outro` ficam fora: são saída, não etapa. */
const ETAPAS = [
  { chave: "novo", rotulo: "Novos" },
  { chave: "contato", rotulo: "Contato" },
  { chave: "qualificacao", rotulo: "Qualificação" },
  { chave: "visita", rotulo: "Visita" },
  { chave: "proposta", rotulo: "Proposta" },
  { chave: "negociacao", rotulo: "Negociação" },
] as const;

/** Abaixo disto, uma taxa de conversão é ruído estatístico com cara de medida. */
const VENDAS_PARA_AFIRMAR_TAXA = 5;

const normalizar = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "analytics.sala-de-comando" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, { roles: ["admin", "director", "superintendent", "manager"] });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("leads")
    .select("id,status,assigned_to,assigned_user_id,created_at,sale_value_brl,development_id,first_contacted_at")
    .eq("organization_id", organizationId)
    .limit(5000);

  // Leitura que falhou não pode virar "operação vazia": a tela diria que não há
  // lead nenhuma sobre uma consulta que ninguém conseguiu fazer.
  if (error) {
    return apiError("SALA_DE_COMANDO_INDISPONIVEL", "Não foi possível medir a operação agora.", identity.meta, {
      status: 503,
      details: { motivo: error.message },
    });
  }

  const leads = data ?? [];
  const porEtapa = new Map<string, number>();
  for (const lead of leads) {
    const st = normalizar(lead.status) || "novo";
    porEtapa.set(st, (porEtapa.get(st) ?? 0) + 1);
  }

  const ganhos = porEtapa.get("ganho") ?? 0;
  const perdidos = porEtapa.get("perdido") ?? 0;
  const emAberto = ETAPAS.reduce((soma, e) => soma + (porEtapa.get(e.chave) ?? 0), 0);
  const topo = porEtapa.get("novo") ?? 0;

  const funil = ETAPAS.map((etapa) => {
    const quantidade = porEtapa.get(etapa.chave) ?? 0;
    return {
      chave: etapa.chave,
      rotulo: etapa.rotulo,
      quantidade,
      /** Proporção contra o TOPO do funil, que é como funil se lê. */
      percentualDoTopo: topo > 0 ? Math.round((quantidade / topo) * 1000) / 10 : null,
      // Zero com motivo é diagnóstico; zero mudo parece tela quebrada.
      porqueVazia:
        quantidade > 0
          ? null
          : `Nenhuma lead nesta etapa. ${topo} das ${leads.length} ainda estão em "novo" — o funil não está travado aqui, ele não chegou até aqui.`,
    };
  });

  // "Em negociação" no sentido do dinheiro: proposta + negociação em aberto.
  const emNegociacao = (porEtapa.get("proposta") ?? 0) + (porEtapa.get("negociacao") ?? 0);
  const vgvFechado = leads
    .filter((l) => normalizar(l.status) === "ganho" && Number(l.sale_value_brl) > 0)
    .reduce((soma, l) => soma + Number(l.sale_value_brl), 0);

  const semValor = leads.filter((l) => normalizar(l.status) === "ganho" && !(Number(l.sale_value_brl) > 0)).length;

  const donos = new Set(leads.map((l) => l.assigned_to ?? l.assigned_user_id).filter(Boolean));
  const comPrimeiroContato = leads.filter((l) => l.first_contacted_at).length;

  return apiSuccess(
    {
      indicadores: {
        leadsTotais: leads.length,
        emAberto,
        emAtendimento: porEtapa.get("contato") ?? 0,
        emNegociacao,
        vgvFechado,
        // O VGV que a tela do mockup chama "em negociação" é R$ 0 aqui, e o
        // motivo importa mais que o número: não há lead em proposta.
        vgvEmNegociacaoIndisponivel:
          emNegociacao === 0 ? "Nenhuma lead em proposta ou negociação — não há VGV em disputa para somar." : null,
        vendasSemValorInformado: semValor,
        corretoresComCarteira: donos.size,
        comPrimeiroContato,
      },
      conversao: {
        ganhos,
        perdidos,
        base: leads.length,
        taxa: leads.length > 0 ? Math.round((ganhos / leads.length) * 10000) / 100 : null,
        /**
         * Com uma venda, a taxa não distingue 0,2% de 2%: a segunda venda a
         * dobraria. A tela mostra a taxa OU diz que não dá para afirmar.
         */
        afirmavel: ganhos >= VENDAS_PARA_AFIRMAR_TAXA,
        porqueNaoAfirmavel:
          ganhos >= VENDAS_PARA_AFIRMAR_TAXA
            ? null
            : `${ganhos} venda${ganhos === 1 ? "" : "s"} fechada${ganhos === 1 ? "" : "s"}: a próxima mudaria a taxa em mais de 100%. Abaixo de ${VENDAS_PARA_AFIRMAR_TAXA} vendas isto é contagem, não taxa.`,
      },
      funil,
      geradoEm: new Date().toISOString(),
    },
    identity.meta,
  );
}
