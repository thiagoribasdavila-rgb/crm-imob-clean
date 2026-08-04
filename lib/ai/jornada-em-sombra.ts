import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import {
  CONSENTIMENTO_DA_SOMBRA,
  linhaDaJornadaEmSombra,
  planejarJornada,
  politicaDeclarada,
  type Braco,
  type Coorte,
  type Faixa,
  type ImpedimentoDeAbertura,
  type LeadNaPorta,
  type PoliticaDoExperimento,
} from "@/lib/ai/braco-do-experimento";

/**
 * O LADO SERVIDOR DA JORNADA EM SOMBRA — quem finalmente ESCREVE em
 * `ai_sales_journeys`.
 *
 * ── O que foi medido, e o que ele conserta ─────────────────────────────────
 *
 * `ai_sales_journeys` tinha 0 linhas em 02/08/2026, e `nightly_broker_handoffs`
 * também. O copiloto noturno e a entrega matinal leem essa tabela: os dois
 * respondiam 200 com zero todo dia, e o zero era honesto — não havia jornada.
 *
 * O único escritor era `app/api/v2/ai/nightly-sales/route.ts`, e ele só cria a
 * jornada DEPOIS de montar uma mensagem de WhatsApp para sair. Duas portas que
 * não são dele barram isso hoje: `WHATSAPP_NIGHTLY_APPROACH_TEMPLATE` ausente
 * (503 antes de ler a primeira lead) e `message_templates` com zero linhas
 * aprovadas. Ou seja, a UNIDADE DO EXPERIMENTO estava acoplada ao ENVIO — e o
 * envio depende do dono.
 *
 * Este módulo desacopla: a jornada nasce em SOMBRA, com o braço sorteado, e
 * nada sai. É o degrau 1 de `docs/design/ATENDIMENTO_AUTONOMO_MODELO.md`.
 *
 * ── O que a jornada em sombra NÃO faz ──────────────────────────────────────
 *
 * `status: 'eligible'` e `morning_handoff_required: false`. As duas coisas são
 * a MESMA decisão, escrita duas vezes de propósito:
 *
 *   · `app/api/v2/ai/nightly-handoff` só lê jornada em
 *     `pending_approval|active|waiting_customer|waiting_broker|paused`;
 *   · e, dentro disso, só com `morning_handoff_required = true`.
 *
 * Nada foi enviado ao cliente, então não existe atendimento noturno para o
 * corretor "assumir" de manhã. Fazer a jornada em sombra cair na entrega
 * matinal encheria a tela do corretor com cartões que prometem uma conversa que
 * nunca houve — zero desenhado como trabalho feito, de cabeça para baixo.
 *
 * ── Por que `outbound_count` fica em 0, e por que isso importa ─────────────
 *
 * É o que separa "jornada preparada" de "jornada que agiu". `/api/ia-autonoma-estado`
 * conta EXECUÇÃO por esse campo: sem ele, a primeira jornada em sombra faria o
 * painel virar a postura para "executando" e afirmar "executei N ações — todas
 * com aprovação nomeada", sobre um banco em que nada saiu.
 */

/* `CONSENTIMENTO_DA_SOMBRA` mora no módulo PURO e é reexportado aqui só para
   quem já importa este arquivo. A constante precisa ser alcançável pelo
   contrato, e este módulo carrega `server-only` — nenhum teste o carrega. */
export { CONSENTIMENTO_DA_SOMBRA };

/** Postgres: violação de unicidade. `unique (organization_id, lead_id)`. */
const VIOLACAO_DE_UNICIDADE = "23505";

/* ── A POLÍTICA, lida do disco ─────────────────────────────────────────────
   Mesma forma de `modo-sombra.ts`: `import.meta.dirname` é UNDEFINED dentro do
   bundle do Next, então o candidato por ele só entra quando é string. Arquivo
   ilegível NÃO derruba nada — `politicaDeclarada(null)` devolve 0% nas três
   faixas, e o sorteio manda toda lead para `humano`. */
const CANDIDATOS = [
  path.join(process.cwd(), "config", "experimento-ia-x-humano.json"),
  ...(typeof import.meta.dirname === "string"
    ? [path.join(import.meta.dirname, "..", "..", "config", "experimento-ia-x-humano.json")]
    : []),
];

let cache: PoliticaDoExperimento | undefined;

export function politicaDoExperimento(): PoliticaDoExperimento {
  if (cache !== undefined) return cache;
  let bruto: unknown = null;
  for (const caminho of CANDIDATOS) {
    try {
      bruto = JSON.parse(fs.readFileSync(caminho, "utf8"));
      break;
    } catch {
      // próximo candidato
    }
  }
  cache = politicaDeclarada(bruto);
  return cache;
}

export function esquecerPoliticaEmCache() {
  cache = undefined;
}

export type DesfechoDaAbertura = "criada" | "ja_existia" | "impedida" | "falhou";

export type ResultadoDaAbertura = {
  desfecho: DesfechoDaAbertura;
  jornadaId: string | null;
  braco: Braco;
  faixa: Faixa;
  coorte: Coorte;
  bilhete: number;
  impedimento: ImpedimentoDeAbertura | null;
  motivo: string;
  /** Quem destrava, quando há o que destravar. */
  quemResolve: string | null;
  /** Código do Postgres quando a escrita falhou. Nunca inventado. */
  code?: string;
};

export type LeadParaAbrir = LeadNaPorta & {
  empreendimentoId?: string | null;
  nome?: string | null;
  origem?: string | null;
};

/**
 * ABRE A JORNADA EM SOMBRA — e CONFERE o retorno da escrita.
 *
 * ── A parte que não pode ser esquecida ─────────────────────────────────────
 *
 * `.select("id").single()` e o `error` verificado. O defeito de maior
 * consequência já cometido neste mesmo fluxo — documentado dentro de
 * `nightly-sales/route.ts` — foi um insert não verificado seguido de
 * `prepared += 1`: o contador dizia "preparei" para trabalho que não existia.
 * Aqui o único caminho que devolve `criada` é o que recebeu um id do banco.
 *
 * ── Chamada de INTAKE: nunca derruba quem chamou ──────────────────────────
 *
 * Este caminho é acionado logo depois de criar uma lead. Perder a jornada é
 * ruim; perder a LEAD seria muito pior. Por isso a função não lança: ela devolve
 * `falhou` com o código do banco, e quem chamou decide o que fazer com isso —
 * mas nunca recebe uma exceção no meio da ingestão.
 */
export async function abrirJornadaEmSombra(lead: LeadParaAbrir): Promise<ResultadoDaAbertura> {
  const politica = politicaDoExperimento();
  const plano = planejarJornada(lead, politica);
  const base = {
    braco: plano.braco,
    faixa: plano.faixa,
    coorte: plano.coorte,
    bilhete: plano.bilhete,
  };

  if (!plano.abertura.pode) {
    return {
      ...base,
      desfecho: "impedida",
      jornadaId: null,
      impedimento: plano.abertura.impedimento,
      motivo: plano.abertura.motivo,
      quemResolve: plano.abertura.quemResolve,
    };
  }

  // A linha é montada pelo módulo PURO — é lá que o contrato consegue executar
  // as três declarações que mantêm esta feature honesta (não enviou, não vai
  // para a entrega matinal, não passa do teto).
  const linha = linhaDaJornadaEmSombra({
    organizacaoId: String(lead.organizacaoId),
    leadId: String(lead.id),
    corretorId: String(lead.corretorId),
    empreendimentoId: lead.empreendimentoId ?? null,
    plano,
    semente: politica.semente,
    nome: lead.nome ?? null,
    origem: lead.origem ?? null,
  });

  const { data, error } = await getSupabaseAdmin()
    .from("ai_sales_journeys")
    .insert(linha)
    .select("id")
    .single();

  if (error) {
    // Duas execuções concorrentes competindo pela mesma lead é o desfecho
    // NORMAL de um worker de 5 em 5 minutos ao lado do intake. Tratar isso como
    // falha pintaria o vigia de vermelho por estar funcionando.
    if (error.code === VIOLACAO_DE_UNICIDADE) {
      return {
        ...base,
        desfecho: "ja_existia",
        jornadaId: null,
        impedimento: null,
        motivo: "Esta lead já tem jornada: `unique (organization_id, lead_id)` recusou a segunda.",
        quemResolve: null,
      };
    }
    logger.warn("ia.jornada_em_sombra_nao_gravada", {
      organizationId: lead.organizacaoId,
      leadId: lead.id,
      code: error.code,
      reason: String(error.message || "").slice(0, 200),
    });
    return {
      ...base,
      desfecho: "falhou",
      jornadaId: null,
      impedimento: null,
      motivo: "A escrita em `ai_sales_journeys` falhou.",
      quemResolve: "time de banco — o código do Postgres vai no campo `code`.",
      code: error.code,
    };
  }

  // Sem id não existe jornada, por mais que o banco não tenha reclamado.
  if (!data?.id) {
    return {
      ...base,
      desfecho: "falhou",
      jornadaId: null,
      impedimento: null,
      motivo: "O banco aceitou a escrita e não devolveu id. Sem id eu não afirmo que criei.",
      quemResolve: "time de banco — `insert(...).select('id').single()` voltou vazio.",
    };
  }

  return {
    ...base,
    desfecho: "criada",
    jornadaId: data.id as string,
    impedimento: null,
    motivo: `Jornada aberta em sombra no braço "${plano.braco}" (faixa ${plano.faixa}, coorte ${plano.coorte}). Nada foi enviado.`,
    quemResolve: null,
  };
}

/**
 * O RESUMO de um lote de aberturas — o que o vigia publica na resposta.
 *
 * Os desfechos ficam SEPARADOS de propósito. Somar "impedida" com "falhou" num
 * contador só foi exatamente o que deixou `nightly-sales` responder 200
 * enquanto não conseguia escrever nada, e está escrito lá dentro como o defeito
 * de maior consequência daquele arquivo.
 */
export type ResumoDeAberturas = {
  criadas: number;
  jaExistiam: number;
  impedidas: number;
  falhas: number;
  porBraco: Record<Braco, number>;
  porImpedimento: Record<string, number>;
  /** Só das criadas. Coorte `entrada` é a única que entra na comparação. */
  porCoorte: Record<Coorte, number>;
};

export function resumirAberturas(resultados: ResultadoDaAbertura[]): ResumoDeAberturas {
  const resumo: ResumoDeAberturas = {
    criadas: 0,
    jaExistiam: 0,
    impedidas: 0,
    falhas: 0,
    porBraco: { ia: 0, humano: 0 },
    porImpedimento: {},
    porCoorte: { entrada: 0, acervo: 0 },
  };
  for (const item of resultados) {
    if (item.desfecho === "criada") {
      resumo.criadas += 1;
      resumo.porBraco[item.braco] += 1;
      resumo.porCoorte[item.coorte] += 1;
    } else if (item.desfecho === "ja_existia") resumo.jaExistiam += 1;
    else if (item.desfecho === "impedida") {
      resumo.impedidas += 1;
      const chave = item.impedimento ?? "sem_motivo_declarado";
      resumo.porImpedimento[chave] = (resumo.porImpedimento[chave] ?? 0) + 1;
    } else resumo.falhas += 1;
  }
  return resumo;
}
