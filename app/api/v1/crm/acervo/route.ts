import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateReactivationPlan } from "@/lib/commercial/consented-reactivation-policy";
import {
  avaliarPedidoDeLote,
  avisoDeCanal,
  fraseDoContador,
  LOTE_PADRAO,
  LIMITE_SEM_TOQUE,
  LOTES_POR_DIA,
  PRAZO_RESGATE_MINUTOS,
  traduzirRecusaDoAcervo,
} from "@/lib/crm/acervo-de-resgate";

/**
 * OFERTA ATIVA DO ACERVO DE RESGATE — a rota do CORRETOR.
 *
 * ── POR QUE ROTA PRÓPRIA, E NÃO UMA AÇÃO EM `crm/distribution` ──────────────
 *
 * Porque o primeiro ato daquela rota é RECUSAR o corretor. Medido: o GET devolve
 * 403 na linha 27 ("A fila comercial é gerenciada pela liderança") antes de
 * qualquer coisa, e o `distribute` do POST devolve 403 na 257 ("A distribuição é
 * uma ação da liderança"). Enfiar auto-serviço numa rota cuja porta de entrada
 * nega o corretor é convite a que a próxima pessoa mova a checagem de papel para
 * cima e mate a feature sem perceber.
 *
 * ── OS CÓDIGOS HTTP, E POR QUE NÃO É TUDO 403 ───────────────────────────────
 *
 * 403 só quando a porta está fechada PARA A PESSOA (não é corretor). "Acervo
 * esgotado" e "recarga bloqueada" são 409: não falta permissão, o estado do
 * mundo é que não permite agora — e a diferença importa porque a tela escreve
 * frases diferentes, e o corretor precisa saber se o problema é dele ou do
 * acervo.
 */

export const dynamic = "force-dynamic";

const rpcAusente = (codigo: unknown) => codigo === "42883" || codigo === "PGRST202";

/** O mesmo cálculo de `crm/reactivation`: presença das duas variáveis. */
const apiOficialPronta = () =>
  Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);

type EstadoBruto = {
  papel?: string | null;
  disponivel?: number;
  semToque?: number;
  lotesHoje?: number;
  tetoDeCarteira?: number | null;
  carteiraTotal?: number | null;
  prazoMinutos?: number;
  previa?: Array<Record<string, unknown>>;
  resumo?: Record<string, number>;
};

function montarResposta(bruto: EstadoBruto, pedido: number) {
  const estado = {
    papel: bruto.papel ?? null,
    semToque: Number(bruto.semToque ?? 0),
    lotesHoje: Number(bruto.lotesHoje ?? 0),
    disponivel: Number(bruto.disponivel ?? 0),
    tetoDeCarteira: bruto.tetoDeCarteira ?? null,
    carteiraTotal: bruto.carteiraTotal ?? null,
  };
  const veredito = avaliarPedidoDeLote(estado, pedido);
  const resumo = bruto.resumo ?? {};

  // ── A HONESTIDADE DE CANAL, ANTES DO CLIQUE ───────────────────────────────
  //
  // O plano é avaliado com os números REAIS do pool. Medido no pool de hoje:
  // devolve `eligible:false` com ["consent_missing","approved_template_missing"].
  //
  // ⚠ `official_whatsapp_api_missing` NÃO dispara neste ambiente, porque
  // `officialApiReady` é só a presença de duas variáveis — e elas estão
  // preenchidas. Presença de variável não é verificação na Meta: o número está
  // NOT_VERIFIED do lado de lá e este código não tem como ver isso. Por isso a
  // tela NUNCA promete canal oficial com base nesse sinal; ela diz que o caminho
  // é ligação individual.
  const plano = evaluateReactivationPlan({
    quality: "unknown",
    requestedDailyCap: LOTE_PADRAO,
    requestedIntervalSeconds: 120,
    consentBasis: null,
    approvedTemplate: false,
    eligibleContacts: Number(resumo.comTelefone ?? 0),
    officialApiReady: apiOficialPronta(),
  });
  const canal = avisoDeCanal({
    bloqueiosDeReativacao: plano.blockers,
    semConsentimento: Number(resumo.semConsentimento ?? 0),
    comTelefone: Number(resumo.comTelefone ?? 0),
    comEmail: Number(resumo.comEmail ?? 0),
    total: estado.disponivel,
  });

  return {
    ...estado,
    prazoMinutos: Number(bruto.prazoMinutos ?? PRAZO_RESGATE_MINUTOS),
    previa: bruto.previa ?? [],
    resumo,
    veredito,
    contador: fraseDoContador(estado.semToque),
    canal,
    regras: {
      lote: LOTE_PADRAO,
      limiteSemToque: LIMITE_SEM_TOQUE,
      lotesPorDia: LOTES_POR_DIA,
      prazoResgateMinutos: PRAZO_RESGATE_MINUTOS,
      /** O que o acervo é. A tela precisa dizer isto antes do clique. */
      leadHistorica: true,
      naoPediuContato: true,
      /** Nada de PII até o corretor pegar — mesma régua da fila da liderança. */
      piiExposed: false,
    },
    // "Acervo esgotado" é diferente de "você já pegou seu lote", e a tela precisa
    // dos dois estados separados para não mentir no vazio.
    vazio: {
      acervoEsgotado: estado.disponivel < 1,
      voceJaPegouSeuLote: estado.disponivel > 0 && !veredito.pode
        && (veredito.motivo === "acervo_recarga_bloqueada" || veredito.motivo === "acervo_lotes_do_dia_esgotados"),
    },
    geradoEm: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const limitado = enforceRateLimit(request, { limit: 90, scope: "crm-acervo-read" });
  if (!limitado.ok) return limitado.response;
  const identidade = await requireAccessContext(request);
  if (!identidade.ok) return identidade.response;

  const pedido = Math.min(Math.max(Number(new URL(request.url).searchParams.get("lote") ?? LOTE_PADRAO) || LOTE_PADRAO, 1), LOTE_PADRAO);

  // A LEITURA não é restrita a corretor de propósito: a liderança precisa poder
  // diagnosticar o balcão sem pedir a tela de alguém. O que ela NÃO pode é pegar
  // — e é o POST que recusa, com nome. Nenhuma PII sai daqui.
  const leitura = await getSupabaseAdmin().rpc("oferta_do_acervo", {
    p_actor_id: identidade.access.profile.id,
    p_organization_id: identidade.access.organization.id,
    p_previa: pedido,
  });

  if (leitura.error) {
    if (rpcAusente(leitura.error.code)) {
      return apiError(
        "OFERTA_CAPACIDADE_PENDENTE",
        "A oferta ativa depende de uma atualização do banco que ainda não foi aplicada neste ambiente.",
        identidade.meta,
        { status: 503, headers: limitado.headers },
      );
    }
    // Recusa NOMEADA vem traduzida (a cerca de organização é uma delas); só o
    // resto é 503. Devolver 503 para "este acervo é de outra imobiliária"
    // esconderia uma decisão de segurança atrás de "instabilidade".
    const recusa = traduzirRecusaDoAcervo(leitura.error.message);
    structuredApiLog("warn", "crm.acervo.leitura_falhou", request, identidade.meta, {
      organizationId: identidade.access.organization.id,
      code: leitura.error.code,
      motivo: recusa.motivo,
    });
    return recusa.motivo
      ? apiError(recusa.codigo, recusa.frase, identidade.meta, {
          status: recusa.status,
          headers: limitado.headers,
          details: { motivo: recusa.motivo },
        })
      : apiError("OFERTA_LEITURA_FALHOU", "Não foi possível ler o acervo de resgate agora.", identidade.meta, {
          status: 503,
          headers: limitado.headers,
        });
  }

  return apiSuccess(montarResposta((leitura.data ?? {}) as EstadoBruto, pedido), identidade.meta, {
    headers: limitado.headers,
  });
}

export async function POST(request: NextRequest) {
  const limitado = enforceRateLimit(request, { limit: 30, scope: "crm-acervo-write" });
  if (!limitado.ok) return limitado.response;
  const identidade = await requireAccessContext(request);
  if (!identidade.ok) return identidade.response;

  const corpo = (await request.json().catch(() => null)) as { action?: string; lote?: number } | null;
  if (corpo?.action !== "pegar") {
    return apiError("OFERTA_ACAO_INVALIDA", "Ação inválida para a oferta ativa. Use action=pegar.", identidade.meta, {
      status: 400,
      headers: limitado.headers,
    });
  }

  const lote = Math.min(Math.max(Math.trunc(Number(corpo.lote ?? LOTE_PADRAO)) || LOTE_PADRAO, 1), LOTE_PADRAO);

  // TODA a regra vive na RPC, dentro de uma transação. O Node não recalcula
  // carteira, não escolhe leads e não decide recarga: se decidisse, existiriam
  // duas verdades — e é assim que nasce a lead com dois donos.
  const claim = await getSupabaseAdmin().rpc("reservar_leads_do_acervo", {
    p_actor_id: identidade.access.profile.id,
    p_organization_id: identidade.access.organization.id,
    p_limit: lote,
  });

  if (claim.error) {
    if (rpcAusente(claim.error.code)) {
      return apiError(
        "OFERTA_CAPACIDADE_PENDENTE",
        "A oferta ativa depende de uma atualização do banco que ainda não foi aplicada neste ambiente.",
        identidade.meta,
        { status: 503, headers: limitado.headers },
      );
    }
    const recusa = traduzirRecusaDoAcervo(claim.error.message);
    structuredApiLog("warn", "crm.acervo.recusado", request, identidade.meta, {
      organizationId: identidade.access.organization.id,
      actorId: identidade.access.profile.id,
      motivo: recusa.motivo,
      code: claim.error.code,
    });
    return apiError(recusa.codigo, recusa.frase, identidade.meta, {
      status: recusa.status,
      headers: limitado.headers,
      details: { motivo: recusa.motivo },
    });
  }

  const resultado = (claim.data ?? {}) as Record<string, unknown>;
  structuredApiLog("info", "crm.acervo.lote_pego", request, identidade.meta, {
    organizationId: identidade.access.organization.id,
    actorId: identidade.access.profile.id,
    pegos: Number(resultado.pegos ?? 0),
  });

  return apiSuccess(
    {
      ...resultado,
      autoServico: true,
      /** Onde a tela leva depois de pegar: a lista já recortada no acervo. */
      proximoPasso: "/leads?acervo=1",
      regras: {
        lote: LOTE_PADRAO,
        limiteSemToque: LIMITE_SEM_TOQUE,
        lotesPorDia: LOTES_POR_DIA,
        prazoResgateMinutos: PRAZO_RESGATE_MINUTOS,
      },
    },
    identidade.meta,
    { headers: limitado.headers },
  );
}
