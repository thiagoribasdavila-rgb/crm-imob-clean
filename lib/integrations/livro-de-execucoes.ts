import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/**
 * LIVRO DE EXECUÇÕES — uma linha por invocação de vigia, sempre.
 *
 * ── POR QUE ELE EXISTE ──────────────────────────────────────────────────────
 *
 * Medido em 02/08/2026, lendo as 13 rotas que o agendador chama: nenhuma delas
 * grava incondicionalmente. Toda escrita acontece dentro de um laço sobre uma
 * fila, ou dentro de uma RPC que só age quando há item elegível.
 *
 * Então "tabela de efeito vazia" é ambígua: pode ser "nunca rodou" ou "rodou e
 * corretamente não fez nada". O portão `check-vigias-vivos` publicava a primeira
 * leitura como fato — e alguns dos vigias que ele deu como mortos podem ter
 * funcionado perfeitamente.
 *
 * Este livro remove a ambiguidade porque ele é escrito SEMPRE, inclusive (e
 * principalmente) quando não havia trabalho.
 *
 * ── AS DUAS PROPRIEDADES QUE ELE PRECISA TER ────────────────────────────────
 *
 * 1. NUNCA DERRUBAR O VIGIA. Observabilidade que quebra a operação é pior que
 *    observabilidade nenhuma. Nada aqui lança.
 *
 * 2. NUNCA FALHAR CALADO. É a doença que este repositório mais paga, e seria
 *    grotesco cometê-la justamente no registro que existe para combatê-la.
 *    Quando a gravação não acontece, a função DEVOLVE o motivo, e quem chama
 *    publica isso na resposta — que é o que o agendador e os portões leem.
 *
 * A tensão entre as duas é real: engolir a exceção satisfaz (1) e viola (2).
 * A saída é não engolir — é RELATAR sem lançar.
 *
 * ── ENQUANTO A MIGRATION NÃO FOR APLICADA ───────────────────────────────────
 *
 * `supabase/migrations/20260802120000_livro_de_execucoes_dos_vigias.sql` cria
 * `atlas_worker_runs`. Aplicar migration em produção é decisão do dono, não
 * minha, então o código nasce convivendo com a ausência da tabela: o Postgres
 * responde 42P01 (relation does not exist) e esta função devolve
 * `livro_nao_instalado`. O vigia segue funcionando igual; a resposta dele passa
 * a dizer que o livro não existe ainda.
 */

/** O que aconteceu na invocação. `sem_trabalho` é desfecho legítimo, não falha. */
export type DesfechoDaExecucao = "ok" | "sem_trabalho" | "fora_da_janela" | "falhou";

export type RegistroDeExecucao = {
  vigia: string;
  rota: string;
  /** github-actions | crontab | manual | desconhecida */
  origem?: string;
  iniciadoEm: number;
  desfecho: DesfechoDaExecucao;
  resposta?: Record<string, unknown>;
  erro?: string;
};

export type ResultadoDoRegistro =
  | { gravado: true }
  | { gravado: false; motivo: "livro_nao_instalado" | "falha_ao_gravar"; detalhe?: string };

/** 42P01 = relation does not exist. É o código exato de "a migration não rodou". */
const TABELA_INEXISTENTE = "42P01";

/**
 * A origem do disparo, deduzida do cabeçalho. Saber QUEM chamou é metade da
 * pergunta: a automação esteve em zero e não havia como distinguir "não há
 * agendador" de "o agendador chamou e não havia trabalho".
 */
export function origemDaChamada(request: Request): string {
  const agente = request.headers.get("user-agent") ?? "";
  if (/GitHub-Hookshot|actions\/runner|curl\/.*github/i.test(agente)) return "github-actions";
  const declarada = request.headers.get("x-atlas-origem");
  if (declarada && /^[a-z0-9-]{1,32}$/i.test(declarada)) return declarada.toLowerCase();
  if (/^curl\//i.test(agente)) return "crontab-ou-curl";
  return "desconhecida";
}

export async function registrarExecucao(registro: RegistroDeExecucao): Promise<ResultadoDoRegistro> {
  const concluidoEm = Date.now();
  try {
    const { error } = await getSupabaseAdmin()
      .from("atlas_worker_runs")
      .insert({
        vigia: registro.vigia,
        rota: registro.rota,
        origem: registro.origem ?? "desconhecida",
        iniciado_em: new Date(registro.iniciadoEm).toISOString(),
        concluido_em: new Date(concluidoEm).toISOString(),
        duracao_ms: concluidoEm - registro.iniciadoEm,
        desfecho: registro.desfecho,
        // A resposta dos vigias é feita de CONTADORES, não de conteúdo de
        // mensagem. Ainda assim vai limitada: um payload gigante aqui viraria
        // custo de banco por observabilidade, que é trocar um problema por outro.
        resposta: registro.resposta ?? {},
        erro: registro.erro ? registro.erro.slice(0, 500) : null,
      });

    if (!error) return { gravado: true };

    if (error.code === TABELA_INEXISTENTE) {
      // Não é erro de operação: é a migration que ainda não foi aplicada.
      // Merece INFO e não ERROR — senão o log de erro vira ruído diário até
      // alguém aplicar, e log ruidoso é log que ninguém lê.
      logger.info("automacao.livro_de_execucoes_nao_instalado", { vigia: registro.vigia });
      return { gravado: false, motivo: "livro_nao_instalado" };
    }

    logger.error("automacao.livro_de_execucoes_falhou", { vigia: registro.vigia, code: error.code });
    return { gravado: false, motivo: "falha_ao_gravar", detalhe: error.code };
  } catch (erro) {
    // Nem a exceção derruba o vigia — mas ela também não some.
    logger.error("automacao.livro_de_execucoes_excecao", { vigia: registro.vigia, erro: String(erro) });
    return { gravado: false, motivo: "falha_ao_gravar", detalhe: "excecao" };
  }
}
