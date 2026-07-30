import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { aplicarPisoDeCarteira, leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";
import {
  agregarOfertas,
  CRITERIOS,
  diagnosticarCarteira,
  recomendarPara,
  QUANTOS_RECOMENDAR,
  type ClienteParaMatching,
} from "@/lib/crm/compatibilidade-imovel";

/**
 * COMPATIBILIDADE CLIENTE × IMÓVEL — a rota de LEITURA.
 *
 * ── O QUE ELA DEVOLVE ───────────────────────────────────────────────────────
 *
 * `?leadId=<uuid>` → a recomendação de UM cliente: os três imóveis mais
 * compatíveis, critérios atendidos, não atendidos, o que falta do cliente, o que
 * falta do catálogo, risco de estoque velho e as duas alternativas.
 *
 * Sem `leadId` → o DIAGNÓSTICO da carteira visível: para quantos clientes o motor
 * consegue recomendar hoje, e a fila de perguntas que destrava o resto.
 *
 * ── POR QUE O DIAGNÓSTICO É O MODO PADRÃO ───────────────────────────────────
 *
 * Porque foi ele que produziu o achado desta frente. Medido no banco canônico em
 * 2026-07-30, executando o motor contra o dado real: das 482 leads da
 * organização que TEM catálogo, o motor consegue recomendar para 12 — 2,5%. As
 * outras 268 leads da base vivem em organizações com ZERO empreendimentos, onde
 * matching é impossível por falta de oferta.
 *
 * Uma tela que só soubesse responder "por lead" esconderia isso: cada corretor
 * veria "faltam dados deste cliente" e ninguém veria que o problema é do
 * CATÁLOGO. Daí o modo carteira.
 *
 * ── DETERMINÍSTICA, E ISSO É PARTE DO CONTRATO ──────────────────────────────
 *
 * Nenhum provedor de IA é chamado aqui — nem para ordenar, nem para explicar.
 * "Regras determinísticas antes de IA" é o que permite ao corretor DISCORDAR do
 * resultado: cada critério sai com o número que o produziu. Isto também é o que
 * mantém o custo desta frente em R$ 0: sem token, sem serviço novo.
 *
 * A fundação do matching híbrido da Fase 2 é esta: quando houver embedding, ele
 * entra DEPOIS deste filtro, não no lugar dele.
 *
 * ── O RECORTE DE QUEM VÊ O QUÊ ──────────────────────────────────────────────
 *
 * O piso de carteira vem de `lib/crm/escopo-de-leitura` e é APLICADO aqui — não
 * reescrito. Corretor lê a própria carteira (mais lead sem dono, pelo mesmo
 * motivo do resto do CRM: alguém precisa vê-la para adotá-la); liderança lê o
 * funil inteiro. Uma segunda cópia dessa regra é a classe de defeito mais cara
 * deste repositório, e não nasce aqui.
 */

export const dynamic = "force-dynamic";

/** Teto de clientes por leitura de carteira. Diagnóstico não é exportação. */
const TETO_DE_CLIENTES = 1000;

/** As colunas do cliente que o motor sabe ler. Nada de `select("*")`. */
const COLUNAS_DO_CLIENTE =
  "id,name,budget_min,budget_max,preferred_bedrooms,bedrooms,preferred_min_area," +
  "preferred_neighborhoods,preferred_regions,purpose,monthly_income,available_down_payment," +
  "fgts_balance,desired_monthly_payment,financing_required,financing_term_months," +
  "payment_method,purchase_timeline,assigned_to,assigned_user_id";

const COLUNAS_DO_IMOVEL =
  "id,organization_id,name,neighborhood,city,latitude,longitude,market_segment,product_type," +
  "bedrooms_min,bedrooms_max,private_area_min,private_area_max,price_min,price_max," +
  "sales_cycle_status,delivery_date,status,updated_at";

export async function GET(request: NextRequest) {
  const limitado = enforceRateLimit(request, { limit: 60, scope: "crm-compatibilidade-read" });
  if (!limitado.ok) return limitado.response;
  const identidade = await requireAccessContext(request);
  if (!identidade.ok) return identidade.response;

  const admin = getSupabaseAdmin();
  const organizationId = identidade.access.organization.id;
  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId");

  // ── O CATÁLOGO DA PRÓPRIA ORGANIZAÇÃO, E SÓ DELE ──────────────────────────
  const { data: desenvolvimentos, error: erroCatalogo } = await admin
    .from("developments")
    .select(COLUNAS_DO_IMOVEL)
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (erroCatalogo) {
    structuredApiLog("warn", "crm.compatibilidade.catalogo_falhou", request, identidade.meta, {
      organizationId,
      code: erroCatalogo.code,
    });
    return apiError("COMPATIBILIDADE_CATALOGO_FALHOU", "Não foi possível ler o catálogo de imóveis agora.", identidade.meta, {
      status: 503,
      headers: limitado.headers,
    });
  }

  // O cast passa por `unknown` de propósito: o `select` é uma string montada, e a
  // inferência do cliente Supabase não a resolve para o tipo gerado. O motor lê
  // as colunas por nome e trata ausência como ausência, então a forma frouxa aqui
  // não vira veredito errado lá.
  const catalogo = (desenvolvimentos ?? []) as unknown as Array<Record<string, unknown>>;
  const ids = catalogo.map((d) => String(d.id));

  let tipologias: Array<Record<string, unknown>> = [];
  if (ids.length > 0) {
    const { data } = await admin
      .from("development_typologies")
      .select("id,development_id,bedrooms,parking_spaces,private_area,price_from,price_to,units_available,status,updated_at")
      .in("development_id", ids);
    tipologias = (data ?? []) as unknown as Array<Record<string, unknown>>;
  }

  // ── A REGRA DE PAGAMENTO DECLARADA, COM OS NÚMEROS ────────────────────────
  //
  // Não basta saber que ela EXISTE: entrada e parcela só podem ser comparadas
  // com `down_payment_percent` e `installments_count` na mão. Sem eles o motor
  // deixa os critérios financeiros como lacuna de catálogo em vez de arbitrar
  // juros — "não inventar condições" é lei aqui. Medido: 0 linhas hoje.
  //
  // `active` e a vigência entram no filtro porque regra vencida não é regra: usar
  // uma tabela fora de validade para dizer "cabe no seu bolso" é pior que não
  // responder.
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: regras } = await admin
    .from("developer_payment_flow_rules")
    .select("down_payment_percent,installments_count,valid_from,valid_until,version")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .or(`valid_until.is.null,valid_until.gte.${hoje}`)
    .order("version", { ascending: false })
    .limit(1);

  const regra = (regras ?? [])[0] ?? null;
  const ofertas = agregarOfertas(catalogo, tipologias, regra);

  // ── UM CLIENTE ────────────────────────────────────────────────────────────
  if (leadId) {
    // O piso entra ANTES do `maybeSingle`: se a lead não é da carteira de quem
    // pergunta, ela não volta — e a resposta é 404, não "acesso negado". Dizer
    // "existe mas não é sua" já entrega informação sobre a carteira do colega.
    let consulta = admin
      .from("leads")
      .select(COLUNAS_DO_CLIENTE)
      .eq("organization_id", organizationId)
      .eq("id", leadId);
    consulta = aplicarPisoDeCarteira(consulta, identidade.access.profile, identidade.access.user.id);

    const { data: lead, error } = await consulta.maybeSingle();
    if (error) {
      return apiError("COMPATIBILIDADE_LEAD_FALHOU", "Não foi possível ler este cliente agora.", identidade.meta, {
        status: 503,
        headers: limitado.headers,
      });
    }
    if (!lead) {
      return apiError("COMPATIBILIDADE_LEAD_AUSENTE", "Cliente não encontrado na sua carteira.", identidade.meta, {
        status: 404,
        headers: limitado.headers,
      });
    }

    const recomendacao = recomendarPara(lead as ClienteParaMatching, ofertas, { quantos: QUANTOS_RECOMENDAR });
    return apiSuccess(
      {
        modo: "cliente" as const,
        ...recomendacao,
        catalogo: resumoDoCatalogo(ofertas),
        motor: DECLARACAO_DO_MOTOR,
      },
      identidade.meta,
      { headers: limitado.headers },
    );
  }

  // ── A CARTEIRA VISÍVEL ────────────────────────────────────────────────────
  let consulta = admin
    .from("leads")
    .select(COLUNAS_DO_CLIENTE)
    .eq("organization_id", organizationId)
    .limit(TETO_DE_CLIENTES);
  consulta = aplicarPisoDeCarteira(consulta, identidade.access.profile, identidade.access.user.id);

  const { data: leads, error } = await consulta;
  if (error) {
    return apiError("COMPATIBILIDADE_CARTEIRA_FALHOU", "Não foi possível ler a carteira agora.", identidade.meta, {
      status: 503,
      headers: limitado.headers,
    });
  }

  const clientes = (leads ?? []) as ClienteParaMatching[];
  const diagnostico = diagnosticarCarteira(clientes, ofertas);

  structuredApiLog("info", "crm.compatibilidade.diagnostico", request, identidade.meta, {
    organizationId,
    clientes: diagnostico.clientes,
    comRecomendacao: diagnostico.comRecomendacao,
    ofertas: ofertas.length,
  });

  return apiSuccess(
    {
      modo: "carteira" as const,
      ...diagnostico,
      /** Liderança vê o funil inteiro; corretor vê a própria carteira. */
      escopo: leLiderancaInteira(identidade.access.profile) ? "organizacao" : "carteira",
      /**
       * O teto foi atingido? Sem isto, "12 de 1000" pareceria a carteira inteira
       * quando é só a primeira página — o defeito que a medição desta frente
       * cometeu antes de paginar, e que quase publicou o número errado.
       */
      truncado: clientes.length >= TETO_DE_CLIENTES,
      catalogo: resumoDoCatalogo(ofertas),
      motor: DECLARACAO_DO_MOTOR,
    },
    identidade.meta,
    { headers: limitado.headers },
  );
}

/**
 * O estado do CATÁLOGO, em números.
 *
 * Vai na resposta porque a lacuna dominante desta frente é do lado da oferta, e
 * uma tela que só mostrasse "faltam dados do cliente" mandaria 12 corretores
 * ligarem para resolver um problema de cadastro.
 */
function resumoDoCatalogo(ofertas: ReturnType<typeof agregarOfertas>) {
  const contar = (f: (o: (typeof ofertas)[number]) => boolean) => ofertas.filter(f).length;
  return {
    imoveis: ofertas.length,
    semPreco: contar((o) => o.price_min === null && o.price_max === null),
    semDormitorios: contar((o) => o.bedrooms_min === null && o.bedrooms_max === null),
    semBairro: contar((o) => !o.neighborhood && !o.city),
    semGeo: contar((o) => o.latitude === null || o.longitude === null),
    semDataDeEntrega: contar((o) => !o.delivery_date),
    semContagemDeEstoque: contar((o) => o.units_available === null),
    semRegraDePagamento: contar((o) => !o.tem_regra_de_pagamento),
  };
}

/**
 * O que o motor é e o que ele não faz — na própria resposta.
 *
 * A tela não precisa saber disto para funcionar, mas quem lê a API precisa: é o
 * que impede a próxima pessoa de apresentar `aderencia` como probabilidade de
 * compra.
 */
const DECLARACAO_DO_MOTOR = {
  tipo: "deterministico" as const,
  usaIA: false,
  criterios: CRITERIOS.length,
  /** Ausência tem estado próprio: não conta como atendida nem como reprovada. */
  ausenciaNaoEVeredito: true,
  /** `aderencia` é fração dos critérios AVALIÁVEIS, nunca chance de venda. */
  aderenciaNaoEProbabilidade: true,
  naoEstima: [
    "faixa de preço a partir de renda",
    "parcela sem regra de pagamento declarada",
    "dormitório ou vaga lidos do texto da tipologia",
  ],
};
