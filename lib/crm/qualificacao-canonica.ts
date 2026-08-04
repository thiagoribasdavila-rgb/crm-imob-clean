/**
 * UMA GAVETA CANÔNICA PARA A QUALIFICAÇÃO — e como ler o que ficou nas outras.
 *
 * ── O DEFEITO ───────────────────────────────────────────────────────────────
 *
 * O mesmo fato comercial ("esta pessoa quer morar, em até 3 meses, financiando")
 * tinha DUAS gavetas, e escritor e leitor escolheram gavetas diferentes:
 *
 *   `POST /api/v1/leads/[id]/qualify`  grava em `leads.metadata.qualificationAnswers`
 *   Copilot, assistente de visita e o
 *   handoff noturno                    leem  `lead_qualification_profiles`
 *
 * Medido na base viva em 02/08/2026: 15 leads têm resposta no metadata, 3 têm
 * linha no perfil, e 13 das 15 NÃO têm linha nenhuma no perfil. Para essas 13 o
 * assistente de visita mostra "0% qualificada" e o Copilot escreve como se a
 * pessoa nunca tivesse dito nada. Uma lead (Danilo Ferreira) já materializou a
 * contradição: `recursos_proprios` numa gaveta, `financing` na outra.
 *
 * E há uma terceira ausência da mesma família: a tela conversacional lê SÓ o
 * perfil e ignora `leads.purpose` — 487 de 490 leads abrem em "0 de 8 sinais",
 * sendo que 181 já tinham a finalidade gravada. A primeira pergunta que o
 * corretor faz é justamente a que a pessoa já respondeu no anúncio.
 *
 * ── QUAL É A CANÔNICA, E POR QUÊ ────────────────────────────────────────────
 *
 * `lead_qualification_profiles`.
 *
 * O critério é a TRANSAÇÃO, não o efeito colateral:
 *
 * · `record_structured_qualification` é uma transação cujo SUJEITO é o perfil:
 *   trava o par (org, lead), grava o campo, recalcula `answered_count`, fecha
 *   `completed_at` e emite `lead_qualification_events`. `leads.purpose` é o
 *   efeito colateral no fim da função.
 * · Em `/qualify` o sujeito da transação é a PONTUAÇÃO (`score`, `score_ia`,
 *   `temperature`, `classificacao_ia`); `metadata.qualificationAnswers` viaja
 *   junto no mesmo `update` como carona do cálculo.
 * · O próprio repositório já declarou a escolha: a migration da Fase 86 termina
 *   com `update public.leads set metadata = metadata - 'qualificationAnswers'`.
 *   A gaveta do metadata é legado que voltou a ser escrito, não a verdade.
 * · O perfil guarda OITO sinais; o metadata guarda três. Eleger o metadata
 *   rebaixaria cinco campos que já têm casa.
 *
 * ── O QUE ESTE MÓDULO FAZ ───────────────────────────────────────────────────
 *
 * Une, sem inventar uma terceira gaveta: o perfil canônico manda, e o que
 * existe nas outras fontes PREENCHE as lacunas em vez de se perder.
 *
 *   1. perfil canônico          (o corretor confirmou)
 *   2. metadata.qualificationAnswers (a qualificação por IA registrou)
 *   3. respostas do formulário  (a pessoa respondeu no anúncio)
 *   4. leads.purpose            (o cadastro guardou)
 *
 * Quando duas fontes discordam, a canônica vence E a divergência sai na
 * resposta. Esconder a contradição é como ela durou tanto tempo.
 *
 * ── O QUE ESTE MÓDULO SE RECUSA A FAZER ─────────────────────────────────────
 *
 * Traduzir o que não tem equivalente. `sem_prazo` não é `over_12_months` e
 * `nao_definido` não é `mixed` — inventar o par transformaria "a pessoa não
 * sabe" em "a pessoa decidiu", que é pior do que a ausência que estamos
 * corrigindo. Esses valores continuam legíveis no legado e simplesmente não
 * creditam sinal. Medido na base viva: 0 leads em cada um dos dois casos.
 *
 * Também não infere. `budget_readiness` NÃO é deduzido de uma faixa escolhida
 * no formulário: escolher "R$ 400 a 600 mil" não é o mesmo que declarar que o
 * orçamento está definido, e a Fase 86 proíbe inferência automática. A faixa
 * sai como FATO DECLARADO, para o corretor ler, sem virar sinal confirmado.
 *
 * Puro de propósito: nenhum acesso a banco, para que a régua seja exercitável
 * por contrato e revisável por quem entende do negócio.
 */

import {
  QUALIFICATION_FIELDS,
  options,
  type QualificationField,
  type QualificationProfile,
} from "../ai/conversational-qualification.ts";
import { mapearQualificacao, type CamposDeQualificacao } from "./lead-qualification-fields.ts";

/** De onde veio cada sinal. O corretor precisa saber o que já foi confirmado. */
export type OrigemDoSinal = "corretor" | "qualificacao_ia" | "formulario" | "cadastro";

export type Divergencia = {
  campo: QualificationField;
  canonico: string;
  origemCanonica: OrigemDoSinal;
  divergente: string;
  origemDivergente: OrigemDoSinal;
};

export type QualificacaoUnificada = {
  /** Perfil no vocabulário canônico — o que `qualificationProgress` entende. */
  profile: QualificationProfile;
  origens: Partial<Record<QualificationField, OrigemDoSinal>>;
  divergencias: Divergencia[];
  /** Fatos declarados que NÃO creditam sinal, mas o corretor deve ler. */
  declarado: {
    faixaInvestimento: string | null;
    formaPagamentoDeclarada: string | null;
    naoMapeadas: Array<{ chave: string; resposta: string }>;
    formularioPerguntou: boolean;
  };
};

export type EntradaDaUnificacao = {
  /** Linha de `lead_qualification_profiles` (colunas `*_key`), se existir. */
  perfil?: Record<string, unknown> | null;
  /** `leads.metadata.qualificationAnswers`, no vocabulário do `/qualify`. */
  respostasLegado?: Record<string, unknown> | null;
  /** `leads.purpose`, como o cadastro gravou (livre: "morar", "Moradia"...). */
  finalidadeDaLead?: string | null;
  /** Respostas cruas do formulário: `metadata.respostas` ou `metadata.meta.respostas`. */
  respostasDoFormulario?: Array<{ chave: string; resposta: string }> | null;
};

/* ── AS DUAS DIREÇÕES DA MESMA RÉGUA ──────────────────────────────────────── */

/**
 * Legado (`/qualify`) → canônico (`lead_qualification_profiles`).
 *
 * Ausência aqui é deliberada: valor sem equivalente honesto não entra.
 */
const CANONICO_DE_LEGADO: Record<string, Record<string, string>> = {
  purpose: { moradia: "moradia", investimento: "investimento" },
  timeline: { ate_3_meses: "up_to_3_months", "3_a_6_meses": "3_to_6_months", "6_a_12_meses": "6_to_12_months" },
  financing: { financiamento: "financing", recursos_proprios: "own_resources", permuta: "exchange" },
};

/**
 * Canônico → legado, para as réguas que ainda falam o vocabulário antigo
 * (`qualifyRealEstateLead` e `assessLeadCompleteness`). Sem esta direção, o
 * sinal que o corretor confirmou na tela conversacional continuaria invisível
 * para a pontuação e para a nota de completude — a mesma ausência, ao contrário.
 */
const LEGADO_DE_CANONICO: Record<string, Record<string, string>> = {
  purpose: { moradia: "moradia", investimento: "investimento" },
  timeline: { up_to_3_months: "ate_3_meses", "3_to_6_months": "3_a_6_meses", "6_to_12_months": "6_a_12_meses", over_12_months: "sem_prazo" },
  financing: { financing: "financiamento", own_resources: "recursos_proprios", exchange: "permuta", mixed: "nao_definido" },
};

/** Só credita valor que existe no catálogo da fase — igual a `qualificationProgress`. */
function valorCanonico(campo: QualificationField, valor: string | null | undefined): string | null {
  const v = String(valor ?? "");
  return v && options[campo].includes(v) ? v : null;
}

export function canonicoDeLegado(campo: string, valor: string | null | undefined): string | null {
  const traduzido = CANONICO_DE_LEGADO[campo]?.[String(valor ?? "")] ?? null;
  return traduzido && QUALIFICATION_FIELDS.includes(campo as QualificationField)
    ? valorCanonico(campo as QualificationField, traduzido)
    : null;
}

export function legadoDeCanonico(campo: string, valor: string | null | undefined): string | null {
  return LEGADO_DE_CANONICO[campo]?.[String(valor ?? "")] ?? null;
}

/**
 * `leads.purpose` chega como o cadastro escreveu: "morar", "Moradia",
 * "investir", "Investimento". Casar por texto exato deixaria 95% de fora.
 */
export function finalidadeCanonica(purpose: string | null | undefined): string | null {
  const p = String(purpose ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  if (!p) return null;
  if (/revend/.test(p)) return "revenda";
  if (/renda|alug|loca/.test(p)) return "renda";
  if (/invest/.test(p)) return "investimento";
  if (/morar|morad|resid|propri|famil/.test(p)) return "moradia";
  return null;
}

/**
 * A intenção lida do formulário fala "morar"/"investir"; o catálogo da fase
 * fala "moradia"/"investimento". São a mesma resposta com dois nomes.
 */
function finalidadeDaIntencao(intencao: CamposDeQualificacao["intencao"]): string | null {
  if (intencao === "morar") return "moradia";
  if (intencao === "investir") return "investimento";
  return null;
}

/**
 * Forma de pagamento do formulário → catálogo da fase.
 *
 * `fgts` e `consorcio` ficam de fora: FGTS quase sempre acompanha financiamento
 * e consórcio não é nenhuma das quatro opções. Eleger uma seria decidir pelo
 * cliente. Os dois seguem visíveis em `declarado.formaPagamentoDeclarada`.
 */
function financiamentoDaFormaDePagamento(forma: CamposDeQualificacao["formaPagamento"]): string | null {
  if (forma === "financiamento") return "financing";
  if (forma === "a_vista") return "own_resources";
  return null;
}

/* ── A UNIÃO ──────────────────────────────────────────────────────────────── */

/**
 * Junta as fontes numa única leitura canônica.
 *
 * A ordem é precedência: quem chega primeiro grava o campo, quem chega depois
 * com valor diferente vira DIVERGÊNCIA registrada — nunca sobrescrita silenciosa
 * e nunca descarte.
 */
export function unificarQualificacao(entrada: EntradaDaUnificacao): QualificacaoUnificada {
  const doFormulario = mapearQualificacao(entrada.respostasDoFormulario);
  const perfil = (entrada.perfil ?? {}) as Record<string, unknown>;
  const legado = (entrada.respostasLegado ?? {}) as Record<string, unknown>;

  const candidatos: Array<{ origem: OrigemDoSinal; valores: Partial<Record<QualificationField, string | null>> }> = [
    {
      origem: "corretor",
      valores: Object.fromEntries(
        QUALIFICATION_FIELDS.map((campo) => [campo, valorCanonico(campo, perfil[`${campo}_key`] as string | null)]),
      ),
    },
    {
      origem: "qualificacao_ia",
      valores: Object.fromEntries(
        QUALIFICATION_FIELDS.map((campo) => [campo, canonicoDeLegado(campo, legado[campo] as string | null)]),
      ),
    },
    {
      origem: "formulario",
      valores: {
        purpose: valorCanonico("purpose", finalidadeDaIntencao(doFormulario.intencao)),
        financing: valorCanonico("financing", financiamentoDaFormaDePagamento(doFormulario.formaPagamento)),
      },
    },
    {
      origem: "cadastro",
      valores: { purpose: valorCanonico("purpose", finalidadeCanonica(entrada.finalidadeDaLead)) },
    },
  ];

  const profile: QualificationProfile = {};
  const origens: Partial<Record<QualificationField, OrigemDoSinal>> = {};
  const divergencias: Divergencia[] = [];

  for (const { origem, valores } of candidatos) {
    for (const campo of QUALIFICATION_FIELDS) {
      const valor = valores[campo];
      if (!valor) continue;
      const jaGravado = profile[campo];
      if (!jaGravado) {
        profile[campo] = valor;
        origens[campo] = origem;
        continue;
      }
      if (jaGravado !== valor) {
        divergencias.push({
          campo,
          canonico: jaGravado,
          origemCanonica: origens[campo] as OrigemDoSinal,
          divergente: valor,
          origemDivergente: origem,
        });
      }
    }
  }

  return {
    profile,
    origens,
    divergencias,
    declarado: {
      faixaInvestimento: doFormulario.faixaInvestimento,
      formaPagamentoDeclarada: doFormulario.formaPagamento,
      naoMapeadas: doFormulario.naoMapeadas,
      formularioPerguntou: doFormulario.formularioPerguntou,
    },
  };
}

/**
 * Um perfil canônico no vocabulário do `/qualify`, para alimentar as réguas
 * antigas (`qualifyRealEstateLead`, `assessLeadCompleteness`) sem que elas
 * precisem aprender o catálogo novo.
 */
export function respostasLegadoDoPerfil(profile: QualificationProfile): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const campo of ["purpose", "timeline", "financing"] as const) {
    const legado = legadoDeCanonico(campo, profile[campo]);
    if (legado) saida[campo] = legado;
  }
  return saida;
}

/**
 * O recorte do perfil que veio de uma confirmação DENTRO do CRM.
 *
 * A memória comercial do copiloto promete que prazo e forma de pagamento "só
 * entram quando o cliente declarou e o corretor confirmou". Objetivo lido do
 * anúncio (`formulario`) ou do cadastro (`cadastro`) é declaração do cliente,
 * não confirmação do corretor — entra no contexto como fato declarado, e NÃO
 * como sinal confirmado. Sem este recorte, unir as gavetas teria transformado
 * uma promessa verdadeira em mentira.
 */
export function perfilConfirmadoNoCrm(unificada: QualificacaoUnificada): QualificationProfile {
  const confirmado: QualificationProfile = {};
  for (const campo of QUALIFICATION_FIELDS) {
    const origem = unificada.origens[campo];
    if (origem === "corretor" || origem === "qualificacao_ia") confirmado[campo] = unificada.profile[campo];
  }
  return confirmado;
}

/** Quantos dos oito sinais a leitura unificada credita. */
export function sinaisUnificados(unificada: QualificacaoUnificada): number {
  return QUALIFICATION_FIELDS.filter((campo) => Boolean(unificada.profile[campo])).length;
}

/* ── ONDE AS RESPOSTAS CRUAS DO FORMULÁRIO MORAM ──────────────────────────── */

function listaDeRespostas(valor: unknown): Array<{ chave: string; resposta: string }> {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item): item is { chave: unknown; resposta: unknown } => Boolean(item) && typeof item === "object")
    .map((item) => ({ chave: String(item.chave ?? ""), resposta: String(item.resposta ?? "") }))
    .filter((item) => item.chave && item.resposta);
}

/**
 * A ingestão por planilha gravou as respostas em `metadata.respostas`; a
 * ingestão por webhook grava em `metadata.meta.respostas`. Medido em 02/08/2026:
 * 96 leads na primeira (todas com conteúdo) e 6 na segunda (todas vazias).
 *
 * Este leitor existe para que as quatro rotas não escolham cada uma o seu
 * caminho — que é exatamente como a qualificação acabou com duas gavetas. Ele
 * NÃO elege uma: lê as duas e junta, sem duplicar a mesma pergunta.
 */
export function respostasDoFormularioNoMetadata(
  metadata: unknown,
): Array<{ chave: string; resposta: string }> {
  if (!metadata || typeof metadata !== "object") return [];
  const raiz = metadata as Record<string, unknown>;
  const doMeta = raiz.meta && typeof raiz.meta === "object" ? (raiz.meta as Record<string, unknown>).respostas : null;
  const juntas = [...listaDeRespostas(raiz.respostas), ...listaDeRespostas(doMeta)];
  const vistas = new Set<string>();
  return juntas.filter((item) => {
    const chave = item.chave.toLowerCase();
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

/** `leads.metadata.qualificationAnswers`, se estiver lá. */
export function respostasLegadoNoMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};
  const valor = (metadata as Record<string, unknown>).qualificationAnswers;
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
}
