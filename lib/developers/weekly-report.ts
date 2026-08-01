/**
 * RELATÓRIO SEMANAL DO INCORPORADOR PARCEIRO.
 *
 * Toda semana, aos domingos, cada incorporadora parceira recebe a prestação de
 * contas dos empreendimentos dela: quantas leads a mídia trouxe, quantas a
 * operação atendeu, em quanto tempo, e o que virou visita e proposta.
 *
 * ── A REGRA QUE ORGANIZA ESTE ARQUIVO ───────────────────────────────────────
 *
 * Um relatório que vai para FORA da casa não pode conter número inventado. É
 * documento comercial: a incorporadora decide verba e renovação de parceria com
 * base nele, e um dado inflado hoje é uma conversa constrangedora daqui a um
 * mês.
 *
 * Por isso, o que não foi medido aparece como `null` e vira uma linha explícita
 * em `naoMedido` — nunca como zero. "CPL: R$ 0,00" diz que a mídia foi de graça.
 * "CPL: não medido — a conta de anúncios não libera leitura de gasto" diz a
 * verdade, e ainda explica o que falta destravar.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
 *
 * Não vai ao banco, não manda e-mail, não formata HTML de envio. Recebe números
 * já apurados e devolve o relatório com o texto pronto. Assim a mesma apuração
 * serve a tela, ao envio automático de domingo e ao teste — e o teste não
 * precisa de banco para provar que a conta está certa.
 */

/** Uma semana fechada de segunda a domingo. */
export type Semana = {
  /** ISO da segunda-feira, 00:00. */
  inicio: string;
  /** ISO do domingo, 23:59:59.999. */
  fim: string;
  rotulo: string;
};

export type NumerosDoEmpreendimento = {
  developmentId: string;
  nome: string;
  /** Leads que entraram DENTRO da semana. */
  leadsRecebidas: number;
  /** Dessas, quantas tiveram primeiro contato registrado. */
  leadsContatadas: number;
  /**
   * Mediana do tempo até o primeiro contato, em minutos. `null` quando nenhuma
   * lead da semana foi contatada — e aí não há mediana, não há "zero".
   */
  medianaDeRespostaMin: number | null;
  /** Leads cujo prazo de primeiro contato venceu sem contato. */
  leadsComSlaVencido: number;
  visitasAgendadas: number;
  propostas: number;
  vendas: number;
  /** Campanhas ativas apontando para este empreendimento. */
  campanhas: string[];
  /** Gasto de mídia no período. `null` = não lido, e não R$ 0. */
  gasto: number | null;
};

export type EntradaDoRelatorio = {
  incorporador: { id: string; nome: string };
  semana: Semana;
  empreendimentos: NumerosDoEmpreendimento[];
  /** Os mesmos números da semana anterior, para comparação. Pode faltar. */
  semanaAnterior?: { leadsRecebidas: number; leadsContatadas: number } | null;
};

export type RelatorioSemanal = {
  incorporador: { id: string; nome: string };
  semana: Semana;
  total: {
    leadsRecebidas: number;
    leadsContatadas: number;
    /** Fração de 0 a 1. `null` quando não houve lead — dividir por zero não é 0%. */
    taxaDeAtendimento: number | null;
    leadsComSlaVencido: number;
    visitasAgendadas: number;
    propostas: number;
    vendas: number;
    gasto: number | null;
    cpl: number | null;
  };
  empreendimentos: NumerosDoEmpreendimento[];
  /** Variação percentual de leads contra a semana anterior. `null` sem base. */
  variacaoDeLeads: number | null;
  /** O que NÃO foi possível apurar, dito com a razão. */
  naoMedido: string[];
  /** Leitura em uma frase, para abrir o e-mail. */
  resumo: string;
  /** Texto pronto para envio. Sem HTML: cola em e-mail, WhatsApp ou PDF. */
  book: string;
  /** Semana sem nenhuma lead: o relatório sai mesmo assim, dizendo isso. */
  vazio: boolean;
};

const dinheiro = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const porcento = (fracao: number) => `${Math.round(fracao * 100)}%`;

/**
 * A semana fechada que TERMINA no domingo informado.
 *
 * O relatório de domingo cobre a semana que acabou de fechar, e não a que está
 * começando. Parece óbvio até alguém rodar o worker à meia-noite de domingo e
 * mandar à incorporadora um relatório de sete dias com zero em tudo.
 */
export function semanaFechadaAte(referencia: Date): Semana {
  const fim = new Date(referencia);
  // Recua até o domingo (getDay() === 0). Se já é domingo, é este mesmo.
  fim.setDate(fim.getDate() - fim.getDay());
  fim.setHours(23, 59, 59, 999);

  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - 6);
  inicio.setHours(0, 0, 0, 0);

  const dia = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

  return {
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    rotulo: `${dia(inicio)} a ${dia(fim)}`,
  };
}

/** A semana imediatamente anterior à informada. Serve à comparação. */
export function semanaAnteriorA(semana: Semana): Semana {
  const fimAnterior = new Date(semana.inicio);
  fimAnterior.setMilliseconds(fimAnterior.getMilliseconds() - 1);
  return semanaFechadaAte(fimAnterior);
}

export function montarRelatorioSemanal(entrada: EntradaDoRelatorio): RelatorioSemanal {
  const emp = entrada.empreendimentos;
  const soma = (pegar: (e: NumerosDoEmpreendimento) => number) =>
    emp.reduce((total, item) => total + pegar(item), 0);

  const leadsRecebidas = soma((e) => e.leadsRecebidas);
  const leadsContatadas = soma((e) => e.leadsContatadas);
  const leadsComSlaVencido = soma((e) => e.leadsComSlaVencido);

  // Gasto só soma quando ALGUM empreendimento tem leitura. Somar tratando null
  // como zero produziria um total que parece medido e não é.
  const comGasto = emp.filter((e) => e.gasto !== null);
  const gasto = comGasto.length ? comGasto.reduce((t, e) => t + (e.gasto ?? 0), 0) : null;

  const naoMedido: string[] = [];
  if (gasto === null) {
    naoMedido.push(
      "Gasto de mídia e CPL: a conta de anúncios ainda não libera leitura de investimento para o Atlas. Os números de leads e atendimento são medidos; o custo, não.",
    );
  } else if (comGasto.length < emp.length) {
    const sem = emp.filter((e) => e.gasto === null).map((e) => e.nome);
    naoMedido.push(
      `Gasto parcial: sem leitura de investimento em ${sem.join(", ")}. O CPL abaixo considera apenas os empreendimentos com gasto medido.`,
    );
  }

  const semMediana = emp.filter((e) => e.leadsRecebidas > 0 && e.medianaDeRespostaMin === null);
  if (semMediana.length) {
    naoMedido.push(
      `Tempo de resposta sem medição em ${semMediana.map((e) => e.nome).join(", ")}: nenhuma lead da semana chegou a receber primeiro contato registrado.`,
    );
  }

  const taxaDeAtendimento = leadsRecebidas > 0 ? leadsContatadas / leadsRecebidas : null;
  // CPL só existe com as DUAS pontas medidas.
  const leadsComGasto = comGasto.reduce((t, e) => t + e.leadsRecebidas, 0);
  const cpl = gasto !== null && leadsComGasto > 0 ? gasto / leadsComGasto : null;

  const anterior = entrada.semanaAnterior;
  const variacaoDeLeads =
    anterior && anterior.leadsRecebidas > 0
      ? (leadsRecebidas - anterior.leadsRecebidas) / anterior.leadsRecebidas
      : null;

  const vazio = leadsRecebidas === 0;

  const resumo = vazio
    ? `Nenhuma lead nova entrou para ${entrada.incorporador.nome} entre ${entrada.semana.rotulo}.`
    : taxaDeAtendimento !== null && taxaDeAtendimento < 0.5
      ? `${leadsRecebidas} lead(s) na semana e apenas ${porcento(taxaDeAtendimento)} atendidas — o gargalo está no atendimento, não na mídia.`
      : `${leadsRecebidas} lead(s) na semana, ${porcento(taxaDeAtendimento ?? 0)} atendidas${
          leadsComSlaVencido ? `, ${leadsComSlaVencido} fora do prazo` : " dentro do prazo"
        }.`;

  return {
    incorporador: entrada.incorporador,
    semana: entrada.semana,
    total: {
      leadsRecebidas,
      leadsContatadas,
      taxaDeAtendimento,
      leadsComSlaVencido,
      visitasAgendadas: soma((e) => e.visitasAgendadas),
      propostas: soma((e) => e.propostas),
      vendas: soma((e) => e.vendas),
      gasto,
      cpl,
    },
    empreendimentos: emp,
    variacaoDeLeads,
    naoMedido,
    resumo,
    vazio,
    book: montarBook({ entrada, leadsRecebidas, leadsContatadas, taxaDeAtendimento, leadsComSlaVencido, gasto, cpl, variacaoDeLeads, naoMedido, resumo, vazio }),
  };
}

/**
 * O BOOK — texto pronto para mandar à incorporadora.
 *
 * Texto puro de propósito: cola em e-mail, no WhatsApp e num PDF sem perder
 * nada. HTML bonito que chega quebrado no cliente de e-mail do parceiro é pior
 * que texto simples que chega inteiro.
 *
 * A ordem é a da conversa que a incorporadora quer ter: primeiro quantas leads
 * a campanha trouxe, depois o que a operação fez com elas, depois o que não deu
 * para medir — e nunca o contrário, porque enterrar a ressalva no fim é o mesmo
 * que escondê-la.
 */
function montarBook(dados: {
  entrada: EntradaDoRelatorio;
  leadsRecebidas: number;
  leadsContatadas: number;
  taxaDeAtendimento: number | null;
  leadsComSlaVencido: number;
  gasto: number | null;
  cpl: number | null;
  variacaoDeLeads: number | null;
  naoMedido: string[];
  resumo: string;
  vazio: boolean;
}): string {
  const { entrada } = dados;
  const linhas: string[] = [];

  linhas.push(`RELATÓRIO SEMANAL · ${entrada.incorporador.nome.toUpperCase()}`);
  linhas.push(`Semana de ${entrada.semana.rotulo}`);
  linhas.push("");
  linhas.push(dados.resumo);
  linhas.push("");

  if (!dados.vazio) {
    linhas.push("RESULTADO CONSOLIDADO");
    linhas.push(`  Leads recebidas ......... ${dados.leadsRecebidas}`);
    linhas.push(
      `  Leads atendidas ......... ${dados.leadsContatadas}${
        dados.taxaDeAtendimento !== null ? ` (${porcento(dados.taxaDeAtendimento)})` : ""
      }`,
    );
    if (dados.leadsComSlaVencido) {
      linhas.push(`  Fora do prazo ........... ${dados.leadsComSlaVencido}`);
    }
    if (dados.variacaoDeLeads !== null) {
      const sinal = dados.variacaoDeLeads >= 0 ? "+" : "";
      linhas.push(`  Contra a semana anterior  ${sinal}${Math.round(dados.variacaoDeLeads * 100)}%`);
    }
    if (dados.gasto !== null) linhas.push(`  Investimento ............ ${dinheiro(dados.gasto)}`);
    if (dados.cpl !== null) linhas.push(`  Custo por lead .......... ${dinheiro(dados.cpl)}`);
    linhas.push("");

    linhas.push("POR EMPREENDIMENTO");
    for (const e of entrada.empreendimentos) {
      linhas.push(`  ${e.nome}`);
      linhas.push(
        `    ${e.leadsRecebidas} lead(s) · ${e.leadsContatadas} atendida(s)` +
          (e.medianaDeRespostaMin !== null
            ? ` · resposta em ${e.medianaDeRespostaMin} min (mediana)`
            : " · sem tempo de resposta medido"),
      );
      if (e.visitasAgendadas || e.propostas || e.vendas) {
        linhas.push(
          `    ${e.visitasAgendadas} visita(s) · ${e.propostas} proposta(s) · ${e.vendas} venda(s)`,
        );
      }
      if (e.campanhas.length) linhas.push(`    campanhas: ${e.campanhas.join(", ")}`);
      linhas.push("");
    }
  }

  if (dados.naoMedido.length) {
    linhas.push("O QUE NÃO FOI MEDIDO NESTA SEMANA");
    for (const item of dados.naoMedido) linhas.push(`  - ${item}`);
    linhas.push("");
  }

  linhas.push("Relatório gerado pelo Atlas com os dados registrados no CRM.");
  linhas.push("Números não apurados aparecem declarados acima, nunca como zero.");

  return linhas.join("\n");
}
