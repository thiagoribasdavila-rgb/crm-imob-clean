/**
 * QUEM GANHA QUANTO — a regra, não a apuração.
 *
 * ── O que já existia e o que faltava ────────────────────────────────────────
 *
 * O banco já tinha `opportunities.commission_*` (bruto, líquido, recebido,
 * status) e `commission_events` para auditoria. Ambos com ZERO linhas — schema
 * pronto, nunca usado.
 *
 * Mas os dois tratam da APURAÇÃO de um negócio fechado: quanto entrou, quanto
 * falta receber. Nenhum diz **quem ganha quanto** — e é isso que o diretor
 * precisa definir antes, não depois.
 *
 * `commission_split_percentage` era um número só. Não dá para escrever "40% do
 * corretor, 10% do gerente, 5% do diretor, 45% da imobiliária" num campo.
 *
 * ── Por que o prêmio é separado ─────────────────────────────────────────────
 *
 * Prêmio de incorporadora não sai da comissão: é dinheiro de outra origem, por
 * unidade vendida, pago em outra data e conferido em outro extrato. Somar junto
 * faria o rateio parecer maior do que é e quebraria a conferência com o
 * parceiro no fim do mês.
 *
 * ── A ordem de busca ────────────────────────────────────────────────────────
 *
 * Do específico para o geral: empreendimento → incorporadora → padrão da
 * imobiliária. A regra do Inside vence a regra genérica da incorporadora dele,
 * porque foi escrita depois e com aquele produto em mente.
 *
 * Sem nenhuma das três, devolve `null` — e null NÃO é zero. Não saber quanto
 * cada um ganha é diferente de saber que ninguém ganha nada, e o CRM não pode
 * fingir que sabe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RegraDeComissao = {
  id: string;
  /** De onde a regra veio — o que o diretor precisa ver antes de confiar nela. */
  escopo: "empreendimento" | "incorporadora" | "padrao";
  pctCorretor: number;
  pctGerente: number;
  pctDiretor: number;
  pctImobiliaria: number;
  premioValor: number;
  premioObservacao: string | null;
};

export type RateioApurado = {
  regra: RegraDeComissao;
  comissaoBruta: number;
  corretor: number;
  gerente: number;
  diretor: number;
  imobiliaria: number;
  /** Sobra quando os percentuais não fecham 100. Declarada, nunca escondida. */
  naoRateado: number;
  /** Somado à parte de quem vendeu, mas contabilizado à parte. */
  premio: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function daLinha(linha: Record<string, unknown>): RegraDeComissao {
  return {
    id: String(linha.id),
    escopo: linha.development_id ? "empreendimento" : linha.developer_id ? "incorporadora" : "padrao",
    pctCorretor: num(linha.pct_corretor),
    pctGerente: num(linha.pct_gerente),
    pctDiretor: num(linha.pct_diretor),
    pctImobiliaria: num(linha.pct_imobiliaria),
    premioValor: num(linha.premio_valor),
    premioObservacao: (linha.premio_observacao as string) ?? null,
  };
}

/**
 * Busca a regra que vale para este negócio.
 *
 * Uma consulta só, trazendo as três candidatas — três idas ao banco no
 * fechamento de cada venda seria caro sem motivo.
 */
export async function regraQueVale(
  admin: SupabaseClient,
  organizationId: string,
  alvo: { developmentId?: string | null; developerId?: string | null },
): Promise<RegraDeComissao | null> {
  const { data } = await admin
    .from("commission_rules")
    .select("id,developer_id,development_id,pct_corretor,pct_gerente,pct_diretor,pct_imobiliaria,premio_valor,premio_observacao")
    .eq("organization_id", organizationId)
    .eq("ativo", true);

  const linhas = data ?? [];
  const porEmpreendimento = alvo.developmentId
    ? linhas.find((l) => l.development_id === alvo.developmentId)
    : undefined;
  if (porEmpreendimento) return daLinha(porEmpreendimento);

  const porIncorporadora = alvo.developerId
    ? linhas.find((l) => l.developer_id === alvo.developerId)
    : undefined;
  if (porIncorporadora) return daLinha(porIncorporadora);

  const padrao = linhas.find((l) => !l.development_id && !l.developer_id);
  return padrao ? daLinha(padrao) : null;
}

/**
 * Aplica a regra sobre a comissão bruta.
 *
 * Arredonda para centavos no fim de cada parcela, não no total: somar valores
 * de precisão infinita e arredondar depois faz a soma das partes não bater com
 * o todo, e é sempre no contracheque de alguém que isso aparece.
 */
export function apurarRateio(
  regra: RegraDeComissao,
  comissaoBruta: number,
): RateioApurado {
  const bruta = Math.max(0, num(comissaoBruta));
  const parte = (pct: number) => Math.round((bruta * pct) / 100 * 100) / 100;

  const corretor = parte(regra.pctCorretor);
  const gerente = parte(regra.pctGerente);
  const diretor = parte(regra.pctDiretor);
  const imobiliaria = parte(regra.pctImobiliaria);

  return {
    regra,
    comissaoBruta: bruta,
    corretor, gerente, diretor, imobiliaria,
    // O que sobra quando os percentuais não somam 100. Pode ser intencional
    // (parte retida, imposto) — mas tem que aparecer, senão vira dinheiro que
    // ninguém sabe de quem é.
    naoRateado: Math.round((bruta - corretor - gerente - diretor - imobiliaria) * 100) / 100,
    // O prêmio NÃO sai da comissão: entra por fora, da incorporadora.
    premio: regra.premioValor,
  };
}

/** A regra fecha 100% da comissão bruta? */
export function somaDosPercentuais(regra: RegraDeComissao): number {
  return Math.round(
    (regra.pctCorretor + regra.pctGerente + regra.pctDiretor + regra.pctImobiliaria) * 1000,
  ) / 1000;
}

/**
 * Frase para a tela do diretor. Null quando está tudo coerente — avisar sobre
 * o que está certo treina a pessoa a ignorar o aviso.
 */
export function avisoDaRegra(regra: RegraDeComissao): string | null {
  const soma = somaDosPercentuais(regra);
  if (soma > 100) return `Os percentuais somam ${soma}% — acima da comissão bruta.`;
  if (soma < 100) return `Os percentuais somam ${soma}%: ${(100 - soma).toFixed(2)}% da comissão não está atribuído a ninguém.`;
  return null;
}
