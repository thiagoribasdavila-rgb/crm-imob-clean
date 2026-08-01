/**
 * SINAIS DE AQUISIÇÃO — a saúde da porta de entrada, sem custo de IA.
 *
 * O motor proativo já vigiava plano de mídia, saúde criativa, aprovações e SLA
 * de time. Não vigiava a PORTA: se a lead sequer entra, e se entra medida.
 *
 * O teste real de ingestão em 2026-07-26 mostrou por que isso importa. Todos os
 * defeitos encontrados eram silenciosos — nenhum produzia erro, todos produziam
 * ausência:
 *
 *   - o único formulário registrado tinha id inexistente na Meta: o backfill
 *     buscava e recebia lista vazia, para sempre;
 *   - 25 formulários com 119 leads não existiam no CRM, e o webhook descartava
 *     o que vinha deles em meta.webhook.unmapped_payload;
 *   - o backfill não pedia os campos de atribuição, então lead paga entrava sem
 *     campanha, sem plataforma e sem formulário;
 *   - lead da Meta entrava sem responsável, e o vigia de SLA não cobra lead sem
 *     dono — o relógio de 5 minutos corria para ninguém.
 *
 * Nenhum desses aparece num painel de CPL. Todos custam dinheiro.
 *
 * Esta função é PURA de propósito: recebe números já medidos e devolve sinais.
 * Sem rede, sem banco, sem relógio — testável, e sem gastar um token sequer de
 * IA num diagnóstico que é aritmética.
 */

export type EstadoDaAquisicao = {
  /** Fontes registradas cujo form_id não existe mais (ou nunca existiu) na Meta. */
  fontesOrfas: number;
  /** Formulários que existem na Meta e o CRM desconhece. */
  formulariosForaDoCrm: number;
  /** Leads acumuladas nesses formulários desconhecidos. */
  leadsForaDoCrm: number;
  /** Leads pagas (is_organic=false) que entraram sem campanha atribuída. */
  leadsPagasSemCampanha: number;
  /** Leads vindas de campanha que estão sem responsável. */
  leadsDeCampanhaSemDono: number;
  /** Leads de campanha com prazo de primeiro contato vencido. */
  leadsDeCampanhaComSlaVencido: number;
  /** Dias desde a última lead entrar por qualquer fonte Meta. null = nunca entrou. */
  diasSemLeadNova: number | null;
  /** A conta de anúncios responde? Sem ela não há gasto, CPL nem CAC. */
  contaDeAnunciosAcessivel: boolean;
};

export type SinalDeAquisicao = {
  chave: string;
  emoji: string;
  titulo: string;
  detalhe: string;
  acao: string;
  /** 5 = dinheiro saindo agora; 1 = melhoria. Mesma escala dos nudges. */
  urgencia: 1 | 2 | 3 | 4 | 5;
};

/** Acima disto, "faz dias que não entra lead" deixa de ser variação e vira sintoma. */
const DIAS_DE_SILENCIO_SUSPEITO = 3;

export function sinaisDeAquisicao(estado: EstadoDaAquisicao): SinalDeAquisicao[] {
  const sinais: SinalDeAquisicao[] = [];

  // Ordem de gravidade: primeiro o que impede a lead de existir, depois o que a
  // impede de ser atendida, por último o que a impede de ser medida.

  if (estado.leadsForaDoCrm > 0) {
    sinais.push({
      chave: "formularios-fora-do-crm",
      emoji: "🚪",
      titulo: `${estado.leadsForaDoCrm} lead(s) presas em formulário que o CRM não conhece`,
      detalhe: `${estado.formulariosForaDoCrm} formulário(s) ativos na Meta não estão registrados. Lead que chega deles é descartada sem erro.`,
      acao: "Marketing → Formulários da Meta → Conferir e registrar.",
      urgencia: 5,
    });
  }

  if (estado.fontesOrfas > 0) {
    sinais.push({
      chave: "fontes-orfas",
      emoji: "🧭",
      titulo: `${estado.fontesOrfas} fonte(s) apontam para formulário inexistente`,
      detalhe: "O backfill dessas fontes sempre traz zero. Não há erro: só ausência.",
      acao: "Conferir os ids na tela de formulários e desativar o que não existe mais.",
      urgencia: 4,
    });
  }

  if (estado.leadsDeCampanhaSemDono > 0) {
    sinais.push({
      chave: "lead-de-campanha-sem-dono",
      emoji: "🫥",
      titulo: `${estado.leadsDeCampanhaSemDono} lead(s) de campanha sem responsável`,
      detalhe: "O relógio de primeiro contato corre, e a cobrança de SLA não alcança lead sem dono — ninguém é avisado.",
      acao: "Definir a regra de distribuição, ou distribuir a fila agora.",
      urgencia: 5,
    });
  }

  if (estado.leadsDeCampanhaComSlaVencido > 0) {
    sinais.push({
      chave: "sla-vencido-em-campanha",
      emoji: "⏰",
      titulo: `${estado.leadsDeCampanhaComSlaVencido} lead(s) pagas com prazo estourado`,
      detalhe: "Verba gasta para gerar contato que não aconteceu. É o desperdício mais caro da operação.",
      acao: "Abrir a fila por prazo de 1º contato e atacar de cima para baixo.",
      urgencia: 5,
    });
  }

  if (estado.diasSemLeadNova !== null && estado.diasSemLeadNova >= DIAS_DE_SILENCIO_SUSPEITO) {
    sinais.push({
      chave: "silencio-na-entrada",
      emoji: "🔇",
      titulo: `${estado.diasSemLeadNova} dias sem lead nova da Meta`,
      detalhe: "Pode ser anúncio pausado, verba encerrada, formulário desativado — ou o webhook parado.",
      acao: "Conferir a campanha na Meta e a saúde do webhook em Integrações.",
      urgencia: 4,
    });
  }

  if (estado.leadsPagasSemCampanha > 0) {
    sinais.push({
      chave: "lead-paga-sem-campanha",
      emoji: "❓",
      titulo: `${estado.leadsPagasSemCampanha} lead(s) pagas sem campanha atribuída`,
      detalhe: "Sem o elo com a campanha não há CPL, não há CAC e o Andromeda não recebe sinal de fundo de funil.",
      acao: estado.contaDeAnunciosAcessivel
        ? "Rodar o backfill novamente — a atribuição é buscada na ingestão."
        : "Conceder ads_read ao system user na conta de anúncios; sem isso a Meta não devolve a campanha.",
      urgencia: 3,
    });
  }

  if (!estado.contaDeAnunciosAcessivel) {
    sinais.push({
      chave: "conta-de-anuncios-inacessivel",
      emoji: "💳",
      titulo: "Conta de anúncios inacessível",
      detalhe: "Sem ela não existe gasto, CPL nem CAC — só contagem de leads. Nenhuma decisão de verba é sustentável assim.",
      acao: "Business Manager → Contas de anúncios → conceder acesso ao system user do app.",
      urgencia: 4,
    });
  }

  // Maior urgência primeiro; empate mantém a ordem de gravidade acima.
  return sinais.sort((a, b) => b.urgencia - a.urgencia);
}

/** Uma frase para o topo do painel. Silêncio quando não há o que dizer. */
export function resumoDaAquisicao(sinais: SinalDeAquisicao[]): string | null {
  if (!sinais.length) return null;
  const criticos = sinais.filter((s) => s.urgencia >= 5).length;
  return criticos
    ? `${criticos} problema(s) na porta de entrada custando dinheiro agora.`
    : `${sinais.length} ponto(s) de atenção na aquisição.`;
}
