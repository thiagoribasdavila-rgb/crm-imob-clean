/**
 * QUANDO UM AVISO PODE SER APAGADO POR TER SIDO LIDO — E QUANDO NÃO PODE.
 *
 * ── O defeito medido em 03/08/2026 ────────────────────────────────────────
 *
 * Quatro leads da Inside entraram às 15:31:03, :04, :06 e :07. As quatro
 * geraram aviso. E as quatro foram marcadas como VISTAS às 16:41:49 — no mesmo
 * segundo, 70 minutos depois.
 *
 * Não foram quatro pessoas percebendo quatro leads. Foi uma chamada ao POST de
 * `/api/v1/crm/alertas-de-lead`, que carimba a lista inteira quando alguém abre
 * a tela. Três horas depois, as quatro leads seguiam SEM DONO.
 *
 * O cabeçalho daquele arquivo já dizia a regra certa, sobre outro caminho:
 * devolver zero quando não se conseguiu ler "confirma a falsa tranquilidade de
 * uma fila parada". O POST fabricava exatamente essa tranquilidade — e ninguém
 * viu, porque o contador ia a zero e zero parece bom.
 *
 * ── A DISTINÇÃO QUE FALTAVA ──────────────────────────────────────────────
 *
 * Há duas espécies de aviso, e tratá-las igual é o erro:
 *
 *   · aviso de FATO — "esta lead passou a ser sua". O fato aconteceu e não
 *     volta atrás; ler é suficiente para encerrá-lo.
 *
 *   · aviso de CONDIÇÃO — "esta lead chegou e não tem dono". A condição
 *     PERSISTE depois da leitura. Apagá-lo ao ler é apagar o sintoma e manter
 *     a doença: a lead continua esperando, e o painel diz que não há nada.
 *
 * Aviso de condição só se encerra quando a condição acaba — aqui, quando a lead
 * ganha dono. Até lá ele volta, toda vez, de propósito.
 *
 * PURO: sem banco, sem rede.
 */

/** Os motivos que a tabela `lead_alerts` usa hoje. */
export type MotivoDoAlerta = "criacao" | "atribuicao";

export type AlertaPendente = {
  id: string;
  leadId: string;
  motivo: string;
  /** `null` quando o aviso é do bolo sem dono — não há a quem endereçar. */
  destinatarioId: string | null;
  /** A lead AINDA está sem dono? É isto que decide se a condição persiste. */
  leadSemDono: boolean;
};

export type Triagem = {
  /** Podem ser carimbados como vistos: o fato já se encerrou. */
  paraMarcar: string[];
  /**
   * NÃO podem: a condição que os gerou continua de pé. Vão reaparecer na
   * próxima leitura, e é isso que os torna úteis.
   */
  persistentes: string[];
  /** Para a tela poder dizer POR QUE alguns não somem. */
  motivoDaPersistencia: string | null;
};

/**
 * Decide o que pode ser apagado ao ler.
 *
 * A regra, em uma frase: **aviso de lead que chegou e ainda não tem dono
 * sobrevive à leitura.** Todo o resto é fato consumado e pode ir.
 */
export function triarAlertasParaMarcar(alertas: readonly AlertaPendente[]): Triagem {
  const paraMarcar: string[] = [];
  const persistentes: string[] = [];

  for (const alerta of alertas) {
    // A condição é "chegou e está sem dono". O motivo `criacao` é o que nomeia
    // a chegada; `destinatarioId` nulo é o que diz que ninguém foi encarregado.
    const ehAvisoDeCondicao = alerta.motivo === "criacao" && alerta.destinatarioId === null;
    if (ehAvisoDeCondicao && alerta.leadSemDono) {
      persistentes.push(alerta.id);
      continue;
    }
    paraMarcar.push(alerta.id);
  }

  return {
    paraMarcar,
    persistentes,
    motivoDaPersistencia: persistentes.length
      ? `${persistentes.length} aviso(s) continuam abertos porque a lead ainda não tem responsável. ` +
        "Eles somem quando alguém assumir — não por terem sido lidos."
      : null,
  };
}

/**
 * A frase do painel. Existe aqui, e não na tela, porque duas telas mostram esta
 * contagem e já divergiram antes neste repositório.
 */
export function fraseDaFila(entrada: { novas: number; semDono: number }): string {
  if (!entrada.novas && !entrada.semDono) return "Nenhuma lead nova esperando.";
  if (!entrada.semDono) return `${entrada.novas} lead(s) nova(s) desde a última olhada.`;
  if (!entrada.novas) return `${entrada.semDono} lead(s) sem responsável — ninguém foi encarregado.`;
  return `${entrada.novas} lead(s) nova(s), sendo ${entrada.semDono} SEM responsável.`;
}
