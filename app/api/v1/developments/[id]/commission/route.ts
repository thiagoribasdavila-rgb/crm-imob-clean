/**
 * COMISSÃO E PRÊMIO DE UM EMPREENDIMENTO — a escrita que faltava.
 *
 * `commission_rules` existe desde 2026-07-27 e `lib/crm/commission-rules.ts` já
 * lê e apura o rateio. Não havia por onde ESCREVER: a tabela tinha 0 linhas e o
 * diretor não tinha como dizer quanto cada projeto paga. Esta rota fecha isso.
 *
 * ── A ORDEM DAS DUAS ESCRITAS É UMA DECISÃO DE SEGURANÇA ────────────────────
 *
 * Gravar é sempre fechar a vigente e abrir a nova. Sem transação pela PostgREST,
 * a ordem decide qual é o estado ruim quando a segunda falha:
 *
 *   inserir → fechar ....... falha deixa DUAS regras ativas. `regraQueVale` usa
 *                            `find()` sobre `ativo = true` e escolheria uma pela
 *                            ordem que o banco devolveu. Numa venda de R$ 470 mil,
 *                            40% contra 30% é R$ 4.700 na mão de alguém — e
 *                            nenhuma tela acusaria, porque as duas regras são
 *                            válidas isoladamente.
 *
 *   fechar → inserir ....... falha deixa NENHUMA regra ativa. `regraQueVale`
 *                            devolve `null`, e o leitor documenta que null NÃO é
 *                            zero: o sistema passa a dizer que não sabe.
 *
 * Não saber é recuperável e visível. Pagar errado em silêncio não é. Por isso a
 * ordem é fechar primeiro — e, se a inserção falhar, a rota tenta reabrir o que
 * fechou e DECLARA no erro se não conseguiu.
 */

import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { avisoDaRegra, type RegraDeComissao } from "@/lib/crm/commission-rules";
import {
  linhaParaGravar,
  validarRegra,
  vesperaDe,
  type RegraParaGravar,
} from "@/lib/crm/escrita-de-regra-de-comissao";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const COLUNAS =
  "id,development_id,developer_id,pct_corretor,pct_gerente,pct_diretor,pct_imobiliaria," +
  "premio_valor,premio_moeda,premio_observacao,vigente_desde,vigente_ate,ativo,criado_por,created_at";

/** Comissão é dinheiro de terceiro: quem define não é quem vende. */
const PAPEIS = ["admin", "director"] as const;

const hojeISO = () => new Date().toISOString().slice(0, 10);

const numero = (v: unknown) => {
  if (typeof v === "number") return v;
  const bruto = String(v ?? "").trim().replace(/%/g, "").replace(/\s/g, "");
  if (!bruto) return Number.NaN;
  const normalizado = bruto.includes(",")
    ? bruto.replace(/\./g, "").replace(",", ".")
    : bruto;
  return Number(normalizado);
};

function paraLeitura(linha: Record<string, unknown>): RegraDeComissao {
  return {
    id: String(linha.id),
    escopo: linha.development_id ? "empreendimento" : linha.developer_id ? "incorporadora" : "padrao",
    pctCorretor: Number(linha.pct_corretor ?? 0),
    pctGerente: Number(linha.pct_gerente ?? 0),
    pctDiretor: Number(linha.pct_diretor ?? 0),
    pctImobiliaria: Number(linha.pct_imobiliaria ?? 0),
    premioValor: Number(linha.premio_valor ?? 0),
    premioObservacao: (linha.premio_observacao as string) ?? null,
  };
}

export async function GET(request: NextRequest, { params }: Context) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "commission.rule.read" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, { roles: [...PAPEIS] });
  if (!identity.ok) return identity.response;

  const { id } = await params;
  const organizationId = identity.access.organization.id;
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("commission_rules")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("development_id", id)
    .order("vigente_desde", { ascending: false })
    .limit(50);

  // Leitura que falhou NÃO pode virar "não há regra": a tela mostraria o
  // empreendimento como se ninguém tivesse definido comissão.
  if (error) {
    return apiError(
      "COMMISSION_RULE_READ_FAILED",
      "Não foi possível ler a regra de comissão deste empreendimento.",
      identity.meta,
      { status: 503, details: { motivo: error.message } },
    );
  }

  // `COLUNAS` é montada por concatenação, então o cliente tipado não consegue
  // inferir a forma da linha e cai em `GenericStringError`. O elenco é sobre o
  // TIPO, não sobre o dado: `error` já foi tratado acima, então aqui só há linha.
  const linhas = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const vigente = linhas.find((l) => l.ativo);
  const regra = vigente ? paraLeitura(vigente) : null;

  return apiSuccess(
    {
      vigente: vigente ?? null,
      // `null` é "ninguém definiu ainda" — diferente de zero, que seria "definiram
      // que ninguém ganha nada". A tela precisa dizer coisas diferentes nos dois.
      definida: Boolean(vigente),
      aviso: regra ? avisoDaRegra(regra) : null,
      historico: linhas.filter((l) => !l.ativo),
      podeEditar: true,
    },
    identity.meta,
  );
}

export async function PUT(request: NextRequest, { params }: Context) {
  const rate = enforceRateLimit(request, { limit: 20, windowMs: 60_000, scope: "commission.rule.write" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, { roles: [...PAPEIS] });
  if (!identity.ok) return identity.response;

  const { id } = await params;
  const organizationId = identity.access.organization.id;
  const admin = getSupabaseAdmin();

  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) {
    return apiError("COMMISSION_RULE_BODY_INVALID", "Envie os percentuais e o prêmio em JSON.", identity.meta, {
      status: 400,
    });
  }

  const entrada: RegraParaGravar = {
    pctCorretor: numero(corpo.pctCorretor),
    pctGerente: numero(corpo.pctGerente),
    pctDiretor: numero(corpo.pctDiretor),
    pctImobiliaria: numero(corpo.pctImobiliaria),
    premioValor: numero(corpo.premioValor),
    premioObservacao: typeof corpo.premioObservacao === "string" ? corpo.premioObservacao : null,
    vigenteDesde: typeof corpo.vigenteDesde === "string" ? corpo.vigenteDesde : null,
  };

  const validacao = validarRegra(entrada);
  if (!validacao.ok) {
    return apiError(
      "COMMISSION_RULE_INVALID",
      validacao.problemas[0].motivo,
      identity.meta,
      { status: 422, details: { problemas: validacao.problemas } },
    );
  }

  const desenvolvimento = await admin
    .from("developments")
    .select("id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!desenvolvimento.data) {
    return apiError("DEVELOPMENT_NOT_FOUND", "Empreendimento não encontrado.", identity.meta, { status: 404 });
  }

  const inicio = entrada.vigenteDesde || hojeISO();

  // ── PASSO 1: fechar o que está vigente ───────────────────────────────────
  const { data: fechadas, error: erroAoFechar } = await admin
    .from("commission_rules")
    .update({ ativo: false, vigente_ate: vesperaDe(inicio), updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("development_id", id)
    .eq("ativo", true)
    .select("id");

  if (erroAoFechar) {
    return apiError(
      "COMMISSION_RULE_CLOSE_FAILED",
      "Não foi possível encerrar a regra anterior; nada foi alterado.",
      identity.meta,
      { status: 503, details: { motivo: erroAoFechar.message } },
    );
  }

  // ── PASSO 2: abrir a nova ────────────────────────────────────────────────
  const { data: nova, error: erroAoInserir } = await admin
    .from("commission_rules")
    .insert(linhaParaGravar(entrada, {
      organizationId,
      developmentId: id,
      autorId: identity.access.profile.id,
      hoje: inicio,
    }))
    .select(COLUNAS)
    .single();

  if (erroAoInserir) {
    // Melhor esforço para desfazer o passo 1. Se ele também falhar, o
    // empreendimento fica SEM regra ativa — estado recuperável e visível, e a
    // resposta diz isso em vez de deixar o diretor achar que nada mudou.
    const ids = (fechadas ?? []).map((f) => f.id);
    let reaberto = ids.length === 0;
    if (ids.length > 0) {
      const { error } = await admin
        .from("commission_rules")
        .update({ ativo: true, vigente_ate: null })
        .in("id", ids);
      reaberto = !error;
    }
    return apiError(
      "COMMISSION_RULE_WRITE_FAILED",
      reaberto
        ? "Não foi possível gravar a nova regra. A anterior continua valendo."
        : "Não foi possível gravar a nova regra E a anterior não pôde ser reaberta: este empreendimento está SEM regra de comissão ativa. Grave novamente.",
      identity.meta,
      { status: 503, details: { motivo: erroAoInserir.message, anteriorReaberta: reaberto } },
    );
  }

  return apiSuccess(
    {
      vigente: nova,
      encerradas: (fechadas ?? []).length,
      aviso: avisoDaRegra(paraLeitura(nova as unknown as Record<string, unknown>)),
      naoRateado: validacao.naoRateado,
    },
    identity.meta,
    { status: 201 },
  );
}
