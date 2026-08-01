/**
 * ESCREVER A REGRA DE COMISSÃO E DE PRÊMIO — o lado que faltava.
 *
 * ── O que existia ───────────────────────────────────────────────────────────
 *
 * `commission_rules` (migration 20260727040000) já guarda o rateio em quatro
 * partes e o prêmio à parte, e `lib/crm/commission-rules.ts` já LÊ e apura. Mas
 * não havia rota nem tela para ESCREVER: a tabela tinha 0 linhas, e o diretor
 * não tinha por onde dizer quanto cada projeto paga.
 *
 * ── O RISCO QUE ESTE MÓDULO EXISTE PARA FECHAR ──────────────────────────────
 *
 * `regraQueVale` filtra por `ativo = true` e usa `find()` — a PRIMEIRA que
 * aparecer. Ele NÃO olha `vigente_desde` nem `vigente_ate`, que a tabela tem.
 *
 * Então, se a escrita apenas inserisse a regra nova, duas ficariam ativas para o
 * mesmo empreendimento e o rateio de uma venda passaria a depender da ordem que o
 * Postgres devolveu as linhas. Numa venda de R$ 470.000, trocar 40% por 30% é
 * R$ 4.700 na mão de alguém — e o erro não apareceria em tela nenhuma, porque as
 * duas regras são válidas isoladamente.
 *
 * Por isso escrever é sempre DOIS passos: fechar a vigente e abrir a nova. O
 * histórico fica (`ativo = false` + `vigente_ate` preenchido), que é o que
 * permite conferir uma comissão paga em março com a regra de março, e não com a
 * de hoje.
 *
 * ── Prêmio não é comissão ───────────────────────────────────────────────────
 *
 * Mantido separado, como a migration decidiu: vem da incorporadora, por unidade,
 * em outra data e outro extrato. Percentual e prêmio se validam por regras
 * diferentes — o percentual disputa os 100% da comissão bruta, o prêmio não
 * disputa nada, é um valor em reais que entra por fora.
 *
 * Módulo puro, sem `server-only`: um contrato precisa conseguir exercitá-lo.
 */

export type RegraParaGravar = {
  pctCorretor: number;
  pctGerente: number;
  pctDiretor: number;
  pctImobiliaria: number;
  premioValor: number;
  premioObservacao?: string | null;
  /** ISO `AAAA-MM-DD`. A vigência começa aqui; a regra anterior fecha na véspera. */
  vigenteDesde?: string | null;
};

export type Problema = {
  campo: string;
  motivo: string;
};

export type Validacao = {
  ok: boolean;
  problemas: Problema[];
  /**
   * Quanto da comissão bruta NÃO foi atribuído a ninguém. Pode ser intencional
   * (retenção, imposto) — mas é devolvido sempre, para a tela poder mostrar, e
   * nunca vira erro sozinho.
   */
  naoRateado: number;
};

const PERCENTUAIS = [
  ["pctCorretor", "corretor"],
  ["pctGerente", "gerente"],
  ["pctDiretor", "diretor"],
  ["pctImobiliaria", "imobiliária"],
] as const;

const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Centésimo de ponto percentual — a coluna é numeric(6,3). */
const arredondarPct = (n: number) => Math.round(n * 1000) / 1000;
const arredondarValor = (n: number) => Math.round(n * 100) / 100;

/**
 * A data em que a regra ANTERIOR deixa de valer: a véspera do início da nova.
 *
 * Fechar no MESMO dia criaria um dia com duas regras vigentes, que é o defeito
 * que este módulo existe para impedir — só que disfarçado de intervalo.
 */
export function vesperaDe(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function validarRegra(entrada: RegraParaGravar): Validacao {
  const problemas: Problema[] = [];

  for (const [campo, rotulo] of PERCENTUAIS) {
    const valor = entrada[campo];
    if (!finito(valor)) {
      problemas.push({ campo, motivo: `Informe o percentual do ${rotulo}.` });
      continue;
    }
    if (valor < 0) {
      problemas.push({ campo, motivo: `O percentual do ${rotulo} não pode ser negativo.` });
    }
    if (valor > 100) {
      problemas.push({ campo, motivo: `O percentual do ${rotulo} não pode passar de 100%.` });
    }
  }

  const soma = PERCENTUAIS.reduce(
    (acc, [campo]) => acc + (finito(entrada[campo]) ? entrada[campo] : 0),
    0,
  );

  // O banco tem o mesmo `check`. Validar aqui também não é redundância: o erro do
  // Postgres chega como "violates check constraint soma_ate_cem", que não diz a
  // quem pertence o percentual errado nem quanto passou.
  if (arredondarPct(soma) > 100) {
    problemas.push({
      campo: "soma",
      motivo: `Os quatro percentuais somam ${arredondarPct(soma)}%, e a comissão bruta é 100%. Tire ${arredondarPct(soma - 100)}% de alguém.`,
    });
  }

  if (!finito(entrada.premioValor)) {
    problemas.push({ campo: "premioValor", motivo: "Informe o prêmio em reais, ou zero se não houver." });
  } else if (entrada.premioValor < 0) {
    problemas.push({ campo: "premioValor", motivo: "O prêmio não pode ser negativo." });
  }

  if (entrada.vigenteDesde != null && !/^\d{4}-\d{2}-\d{2}$/.test(entrada.vigenteDesde)) {
    problemas.push({ campo: "vigenteDesde", motivo: "A data de início precisa estar no formato AAAA-MM-DD." });
  }

  return {
    ok: problemas.length === 0,
    problemas,
    naoRateado: arredondarPct(100 - soma),
  };
}

/** O que vai para o `insert`, já arredondado à precisão de cada coluna. */
export function linhaParaGravar(
  entrada: RegraParaGravar,
  contexto: { organizationId: string; developmentId: string; autorId: string; hoje: string },
) {
  return {
    organization_id: contexto.organizationId,
    development_id: contexto.developmentId,
    // NUNCA os dois: a tabela tem `check (development_id is null or developer_id is null)`.
    developer_id: null,
    pct_corretor: arredondarPct(entrada.pctCorretor),
    pct_gerente: arredondarPct(entrada.pctGerente),
    pct_diretor: arredondarPct(entrada.pctDiretor),
    pct_imobiliaria: arredondarPct(entrada.pctImobiliaria),
    premio_valor: arredondarValor(entrada.premioValor),
    premio_observacao: entrada.premioObservacao?.trim() || null,
    vigente_desde: entrada.vigenteDesde || contexto.hoje,
    ativo: true,
    criado_por: contexto.autorId,
  };
}
