/**
 * A REDISTRIBUIÇÃO QUE O SISTEMA RECOMENDARIA — e que ele NÃO executa.
 *
 * ── O que estava aqui antes: uma bandeira que não ligava nada ───────────────
 *
 * `app/api/v2/crm/first-contact-sla/process/route.ts` reportava, no fim de cada
 * execução:
 *
 *     reatribuicao: process.env.ATLAS_SLA_AUTO_REASSIGN === "true"
 *       ? "habilitada por ambiente, mas ainda não implementada"
 *       : "desligada: reatribuir por SLA é ação A2"
 *
 * Ou seja: existia uma variável de ambiente com cara de interruptor que, ligada,
 * não acendia luz nenhuma. Pior que ausência de controle — é a **aparência** de
 * controle. Quem lesse aquilo acreditaria que bastava ligar.
 *
 * ── E o Shadow Mode, que estava construído e nunca gravou nada ──────────────
 *
 * `lib/ai/modo-sombra.ts` (278 linhas), `lib/ai/niveis-de-autonomia.ts` (307) e
 * `lib/ai/registro-de-sombra.ts` (157) estão completos desde 30/07 e
 * `ai_shadow_decisions` tem **0 linhas**. O diagnóstico escrito na própria
 * matriz de autonomia dizia o motivo:
 *
 *     "Pré-requisito único: um agente que decida em sombra. Hoje não existe —
 *      e é por isso que a cadeia termina em nada."
 *
 * Este módulo é esse agente. Ele decide, e a sombra retém.
 *
 * ── Por que a retenção aqui é DUPLA, e por construção ───────────────────────
 *
 * `redistribuir_lead` está em `ACOES_RETIDAS_PADRAO`. Isso significa que, mesmo
 * que alguém ligue `ATLAS_SLA_AUTO_REASSIGN=true` amanhã, `prepararEmSombra`
 * ainda retém — e o worker não executa. São duas guardas independentes:
 *
 *   1. a bandeira de ambiente (que agora liga algo de verdade);
 *   2. o Shadow Mode, que só solta quando alguém tirar a ação da lista retida
 *      DEPOIS de olhar a comparação recomendação × decisão humana.
 *
 * Uma guarda que ninguém consegue ver funcionando é indistinguível de uma que
 * não existe. Por isso a recomendação é GRAVADA mesmo retida: é a evidência que
 * um dia permite sair da sombra — e sem ela nunca se sai, porque não há caso
 * algum para comparar.
 *
 * Módulo puro: sem banco, sem rede, sem `server-only`.
 */

/* Import RELATIVO com extensao: os modulos puros deste repositorio rodam sob
   `node --test`, que nao conhece o alias `@/`. */
import { pareceIdentificador } from "./fila-de-decisoes.ts";

export type LeadParaRedistribuir = {
  id: string;
  nome: string | null;
  donoAtual: string | null;
  atrasoMin: number;
  origem: string | null;
};

export type CargaDoCorretor = {
  brokerId: string;
  nome: string | null;
  /** Leads em aberto na carteira. É o único critério de carga que temos medido. */
  emAberto: number;
  /** Quantas dessas ainda não receberam primeiro contato. */
  semPrimeiroContato: number;
};

export type RecomendacaoDeRedistribuicao = {
  leadId: string;
  leadNome: string | null;
  deQuem: string | null;
  paraQuem: string;
  paraQuemNome: string | null;
  atrasoMin: number;
  /** Frase pronta, que é o que vai para `recomendacao` no registro de sombra. */
  recomendacao: string;
  /** Por que ESTE corretor, e não outro. */
  porque: string;
};

export type ResultadoDaRecomendacao = {
  recomendacoes: RecomendacaoDeRedistribuicao[];
  /** Leads elegíveis que ficaram de fora do teto — declaradas, nunca silenciadas. */
  foraDoTeto: number;
  /** Motivo quando nada foi recomendado. Nunca vazio quando a lista é vazia. */
  porqueVazio: string | null;
};

/**
 * Atraso mínimo para uma lead entrar na recomendação.
 *
 * Não é o vencimento do SLA: uma lead que venceu há 4 minutos ainda pode estar
 * sendo trabalhada neste instante, e recomendar tirá-la do corretor seria
 * atropelar quem está no telefone. Seis horas é o ponto em que "atrasado" vira
 * "abandonado" — e o número é declarado aqui, não espalhado pelo código.
 */
export const ATRASO_MINIMO_PARA_RECOMENDAR_MIN = 360;

/**
 * Quantas recomendações por execução. Existe porque a base real tem 472 leads
 * sem primeiro contato: sem teto, a primeira execução gravaria centenas de
 * linhas de sombra e a comparação viraria ruído.
 *
 * O que ficou de fora é CONTADO e devolvido. Teto silencioso lê-se como
 * "cobrimos tudo" quando não cobrimos.
 */
export const TETO_DE_RECOMENDACOES = 20;

/**
 * Nome de gente, ou a razão de não haver — nunca um identificador.
 *
 * Reusa `pareceIdentificador` em vez de reescrever a checagem: a mesma regra
 * escrita em dois lugares é a classe de defeito que este repositório mais
 * pagou, e aqui ela decidiria o que uma pessoa lê.
 */
function nomeLegivel(nome: string | null | undefined, semNome: string): string {
  const n = (nome ?? "").trim();
  return n && !pareceIdentificador(n) ? n : semNome;
}

/**
 * Decide, para cada lead abandonada, para quem ela iria — e por quê.
 *
 * Critério de destino, nesta ordem:
 *   1. não pode ser o dono atual (redistribuir para quem já não contatou é
 *      manter o problema com outro nome);
 *   2. menor número de leads SEM primeiro contato — é a medida de quem está
 *      efetivamente atendendo, não de quem tem a carteira menor;
 *   3. desempate por menor carteira em aberto;
 *   4. desempate final pelo id, para a saída ser estável entre execuções (duas
 *      execuções seguidas não podem recomendar destinos diferentes sem que nada
 *      tenha mudado — isso destruiria a comparação).
 */
export function recomendarRedistribuicao(
  leads: LeadParaRedistribuir[],
  corretores: CargaDoCorretor[],
  opcoes: { atrasoMinimoMin?: number; teto?: number } = {},
): ResultadoDaRecomendacao {
  const atrasoMinimo = opcoes.atrasoMinimoMin ?? ATRASO_MINIMO_PARA_RECOMENDAR_MIN;
  const teto = opcoes.teto ?? TETO_DE_RECOMENDACOES;

  if (corretores.length === 0) {
    return { recomendacoes: [], foraDoTeto: 0, porqueVazio: "Nenhum corretor ativo com carteira medida — não há destino possível." };
  }
  if (corretores.length === 1) {
    return {
      recomendacoes: [], foraDoTeto: 0,
      porqueVazio: `Apenas 1 corretor ativo (${nomeLegivel(corretores[0].nome, "sem nome cadastrado")}) — redistribuir devolveria a lead para a mesma pessoa.`,
    };
  }

  const elegiveis = leads
    .filter((lead) => lead.atrasoMin >= atrasoMinimo)
    .sort((a, b) => b.atrasoMin - a.atrasoMin || a.id.localeCompare(b.id));

  if (elegiveis.length === 0) {
    return {
      recomendacoes: [], foraDoTeto: 0,
      porqueVazio: `Nenhuma lead com atraso de ${Math.round(atrasoMinimo / 60)}h ou mais. Vencido há pouco não é abandonado — pode estar sendo trabalhado agora.`,
    };
  }

  // A carga é simulada ao longo do laço: recomendar 20 leads todas para o mesmo
  // corretor "menos carregado" criaria, no papel, o gargalo que se quer desfazer.
  const carga = new Map(corretores.map((c) => [c.brokerId, { ...c }]));

  const recomendacoes: RecomendacaoDeRedistribuicao[] = [];
  for (const lead of elegiveis.slice(0, teto)) {
    const candidatos = [...carga.values()]
      .filter((c) => c.brokerId !== lead.donoAtual)
      .sort((a, b) => a.semPrimeiroContato - b.semPrimeiroContato || a.emAberto - b.emAberto || a.brokerId.localeCompare(b.brokerId));
    const destino = candidatos[0];
    if (!destino) continue;

    const horas = Math.floor(lead.atrasoMin / 60);
    recomendacoes.push({
      leadId: lead.id,
      leadNome: lead.nome,
      deQuem: lead.donoAtual,
      paraQuem: destino.brokerId,
      paraQuemNome: destino.nome,
      atrasoMin: lead.atrasoMin,
      /* `nome || id` entregava o UUID para dentro de uma frase que uma pessoa
         lê. Medido na linha real: *"Passar a lead Tatiane Camargo para
         240a6bc5-5163-42ab-9d0f-729c7d0b0d35"*. Um identificador ali não
         informa nada e ainda parece defeito de sistema — enquanto "sem nome
         cadastrado" é acionável: manda alguém completar o perfil. */
      recomendacao: `Passar a lead ${nomeLegivel(lead.nome, "lead sem nome")} para ${nomeLegivel(destino.nome, "corretor sem nome cadastrado")}: ${horas}h sem primeiro contato.`,
      porque: `Destino com ${destino.semPrimeiroContato} lead(s) sem primeiro contato e ${destino.emAberto} em aberto — a menor fila de não-atendidas entre ${candidatos.length} corretor(es) elegíveis.`,
    });

    // O destino escolhido passa a carregar mais uma não-atendida.
    destino.semPrimeiroContato += 1;
    destino.emAberto += 1;
  }

  return {
    recomendacoes,
    foraDoTeto: Math.max(0, elegiveis.length - recomendacoes.length),
    porqueVazio: recomendacoes.length === 0 ? "Nenhuma lead elegível encontrou destino diferente do dono atual." : null,
  };
}
