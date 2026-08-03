/**
 * O QUE FALTA PARA ESTA PROPOSTA IR AO AR — medido NO PLANO que o aprovador
 * está prestes a assinar.
 *
 * ── O buraco que isto fecha ────────────────────────────────────────────────
 *
 * A régua da Meta passou a separar duas perguntas (lib/marketing/regua-da-meta.ts):
 * o que impede PROPOR (a peça está errada e nenhuma revisão humana conserta) e o
 * que impede ATIVAR (o artefato ainda não existe: mídia, Página, formulário).
 * Separar sem fechar a outra ponta seria trocar um defeito por outro pior: a
 * proposta sem peça visual sairia da composição, entraria na fila e chegaria ao
 * "Aprovar campanha" com a mesma cara de uma proposta completa.
 *
 * Este módulo é a outra ponta. Ele relê o plano guardado em `approval_requests`
 * e devolve, item a item, o que ainda falta para o anúncio subir — com onde
 * resolver cada coisa.
 *
 * ── Por que RELER o plano em vez de carregar um veredito congelado ─────────
 *
 * A proposta guarda o `accountId` e os steps do dia em que foi criada, e a
 * decisão acontece dias depois. Um veredito gravado junto envelheceria mentindo:
 * a peça pode ter sido importada nesse intervalo — ou o contrário. O que não
 * envelhece é o PLANO, porque é exatamente ele que a execução vai enviar à Meta.
 * Medir o plano é medir o que vai acontecer; medir a memória do dia da proposta
 * é medir o que alguém achou naquele dia.
 *
 * ── Por que aqui não há uma segunda régua ──────────────────────────────────
 *
 * Quem lê o plano é `conferirPlanoNaMeta` (lib/marketing/regua-no-plano.ts), que
 * já traduz `ExecutionStep[]` na peça e chama a régua única. Este arquivo
 * acrescenta UMA coisa que aquele tradutor não olha — Página e formulário, os
 * dois artefatos de DESTINO — e projeta o veredito na pergunta da Caixa de
 * Aprovações: "dá para ativar isto?". Nenhum limite, nenhum padrão proibido e
 * nenhuma trava de público são reescritos aqui.
 *
 * ── Onde isto NÃO decide nada ──────────────────────────────────────────────
 *
 * Este módulo não bloqueia a aprovação. Aprovar uma proposta pendente é ato
 * humano, e há motivo legítimo para aprovar antes de a peça existir ("aprovei a
 * verba; suba a imagem e ative"). O que ele impede é o aprovador descobrir a
 * falta DEPOIS — na falha da execução, com a decisão já registrada. O portão de
 * verdade continua na porta da escrita: `validateExecutionPlan`
 * (lib/meta/marketing/campaign-executor.ts) recusa o plano sem peça visual.
 *
 * PURO: sem rede, sem banco, sem relógio, sem `process.env`, sem `fs`. Recebe o
 * payload por parâmetro e devolve veredito por valor.
 */

import type { ExecutionStep } from "../meta/marketing/campaign-executor.ts";
import { conferirPlanoNaMeta } from "./regua-no-plano.ts";
import {
  conferirArtefatosDeDestino,
  fecharVeredito,
  type ItemDaRegua,
} from "./regua-da-meta.ts";

/** Mesmo padrão de placeholder do executor: `<<PAGE_ID>>`, `<<LEAD_FORM_ID>>`. */
const PLACEHOLDER_RE = /<<[^<>]+>>/;

/**
 * Os quatro desfechos possíveis, e por que não são dois.
 *
 * `nao_medido` e `sem_pendencia` colapsariam num booleano só — e é aí que mora o
 * zero falso: um payload ilegível tem zero pendências trivialmente, e pintar
 * isso de verde seria publicar saúde por ausência de evidência.
 * `nao_se_aplica` existe pelo motivo simétrico: uma proposta de PAUSAR campanha
 * não tem peça visual, e cobrar uma dela seria inventar uma falta.
 */
export type SituacaoDeAtivacao = "sem_pendencia" | "com_pendencia" | "nao_medido" | "nao_se_aplica";

export type PendenciasDeAtivacao = {
  situacao: SituacaoDeAtivacao;
  /** Só os itens reprovados — a Caixa mostra o que falta, não a régua inteira. */
  itens: ItemDaRegua[];
  /** Artefatos que faltam (mídia, Página, formulário). */
  pendencias: number;
  /** Problemas da PEÇA — texto, política, público. Impedem propor e, portanto, ativar. */
  problemasDaPeca: number;
  /** `false` sempre que restar dúvida — não medido nunca vira "pode". */
  podeAtivar: boolean;
  /** O que falta, com onde resolver. Vazio quando não falta nada. */
  motivos: string[];
  /** Frase pronta para a tela. Nunca afirma mais do que a medida sustenta. */
  frase: string;
};

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

/** Texto útil: string não vazia que NÃO é placeholder de configuração. */
function preenchido(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo || PLACEHOLDER_RE.test(limpo)) return null;
  return limpo;
}

/**
 * Página e formulário como o plano os declara, lidos do passo de criativo.
 *
 * `undefined` (o objeto vazio) significa que NÃO HAVIA onde ler — sem passo de
 * criativo não existe `object_story_spec`, e afirmar "sem Página" nesse caso
 * seria reprovar o que ninguém mediu. Os dois campos vêm exatamente de onde o
 * executor vai lê-los, e o placeholder `<<PAGE_ID>>` conta como ausência: é a
 * marca que a composição deixa quando o dono ainda não escolheu a Página.
 */
export function destinoDoPlano(steps: ExecutionStep[]): {
  paginaId?: string | null;
  formularioId?: string | null;
} {
  const lista = Array.isArray(steps) ? steps : [];
  const criativo = lista.find((s) => s?.kind === "create_creative");
  if (!criativo) return {};
  const corpo = objeto(criativo.payload) ?? {};
  const story = objeto(corpo.object_story_spec) ?? {};
  const linkData = objeto(story.link_data) ?? {};
  const cta = objeto(linkData.call_to_action) ?? {};
  const valorDoCta = objeto(cta.value) ?? {};
  return {
    paginaId: preenchido(story.page_id),
    formularioId: preenchido(valorDoCta.lead_gen_form_id),
  };
}

const semMedida = (motivo: string): PendenciasDeAtivacao => ({
  situacao: "nao_medido",
  itens: [],
  pendencias: 0,
  problemasDaPeca: 0,
  // "Não li" nunca vira "pode". Zero pendências numa leitura que não aconteceu
  // é o zero falso que este repositório já pagou caro.
  podeAtivar: false,
  motivos: [motivo],
  frase: `NÃO MEDIDO — ${motivo} Isto não é “nada falta”.`,
});

/**
 * O veredito de ativação desta proposta.
 *
 * `payload` é a linha `approval_requests.payload` como ela sai do banco
 * (CampaignProposalPayload: `{ kind, plan, ... }`).
 */
export function pendenciasDeAtivacao(payload: unknown): PendenciasDeAtivacao {
  const proposta = objeto(payload);
  if (!proposta) {
    return semMedida("a proposta chegou sem payload legível — não há plano para conferir.");
  }

  const kind = typeof proposta.kind === "string" ? proposta.kind : null;
  if (kind && kind !== "create") {
    return {
      situacao: "nao_se_aplica",
      itens: [],
      pendencias: 0,
      problemasDaPeca: 0,
      // Não há artefato a exigir: pausar ou ajustar verba age sobre estrutura
      // que já existe na Meta. Dizer "não pode" aqui seria inventar uma falta.
      podeAtivar: true,
      motivos: [],
      frase: `Esta proposta não cria criativo (${kind}) — não há peça visual, Página ou formulário para conferir.`,
    };
  }

  const plano = objeto(proposta.plan) ?? proposta;
  const steps = Array.isArray(plano.steps) ? (plano.steps as ExecutionStep[]) : null;
  if (!steps || steps.length === 0) {
    return semMedida("a proposta não carrega plano de publicação (steps) — não há o que conferir.");
  }

  const daRegua = conferirPlanoNaMeta(steps);
  const itens: ItemDaRegua[] = [...daRegua.itens, ...conferirArtefatosDeDestino(destinoDoPlano(steps))];
  const veredito = fecharVeredito(itens);
  const reprovados = itens.filter((i) => i.estado === "reprovado" && i.severidade === "bloqueio");

  return {
    situacao: veredito.podeAtivar ? "sem_pendencia" : "com_pendencia",
    itens: reprovados,
    pendencias: veredito.bloqueiosParaAtivar,
    problemasDaPeca: veredito.bloqueiosParaPropor,
    podeAtivar: veredito.podeAtivar,
    motivos: veredito.motivosParaAtivar,
    frase: veredito.podeAtivar
      ? "Página, formulário e peça visual estão no plano, e a peça passa na régua da Meta."
      : [
          veredito.bloqueiosParaAtivar
            ? `Faltam ${veredito.bloqueiosParaAtivar} artefato(s) para esta proposta ir ao ar.`
            : "",
          veredito.bloqueiosParaPropor
            ? `${veredito.bloqueiosParaPropor} problema(s) na própria peça — a Meta recusaria.`
            : "",
          "Aprovar é permitido (a estrutura nasce PAUSED); ativar, não, até isto ser resolvido.",
        ]
          .filter(Boolean)
          .join(" "),
  };
}
