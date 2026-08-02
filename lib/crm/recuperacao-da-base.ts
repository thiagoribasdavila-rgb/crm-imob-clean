/**
 * RECUPERAÇÃO DA BASE — a lead descartada que nunca disse não.
 *
 * ── O QUE FOI MEDIDO, EM 02/08/2026, NO BANCO DE PRODUÇÃO ───────────────────
 *
 *   419  leads com status `perdido`
 *   252  descartadas com o motivo `inalcancavel`  ← 61% de todas as perdas
 *    10  descartadas com `sem_interesse`
 *     1  com `spam`
 *
 * "Inalcançável" NÃO é "não quer". É "ligamos e não atenderam". Essas 252
 * pessoas preencheram um formulário — levantaram a mão — e foram descartadas
 * porque um humano não conseguiu falar com elas por telefone, em horário
 * comercial.
 *
 * E o outro número, medido no mesmo dia: 57% da demanda orgânica chega FORA do
 * expediente. Quem preenche às 23h é exatamente quem não atende telefone às 14h.
 * O descarte por "inalcançável" mede, em boa parte, a incompatibilidade entre o
 * horário de quem procura e o horário de quem atende.
 *
 * Para dar escala: a entrada orgânica é de ~30 leads/mês. As 252 paradas valem
 * mais de OITO MESES de captação — já pagas.
 *
 ── A DECISÃO DO DONO, REGISTRADA ───────────────────────────────────────────
 *
 * Em 02/08/2026 o dono da operação decidiu, por escrito e ciente do risco: SEM
 * trava de consentimento na recuperação. Eu havia apontado que 234 das 252 têm
 * `dataSharingConsent: false` no próprio registro (vieram de
 * `importacao_planilha`, o Relatório Arvo) e que disparo frio em lote é o padrão
 * que faz a Meta banir número.
 *
 * Ele reafirmou e trouxe a mitigação que resolve o que eu apontei: DEZ números
 * de WhatsApp em rodízio, para a operação não cair se um degradar. A mitigação é
 * boa e é o que torna o plano executável — ver `lib/whatsapp/pool-de-numeros.ts`.
 *
 * Então este módulo NÃO decide por base legal. Ele decide por CAPACIDADE: tem
 * telefone, dá para mandar mensagem. A `baseLegal` continua sendo devolvida como
 * DADO — para a tela e a auditoria saberem de onde cada lead veio — mas ela não
 * bloqueia mais nada.
 *
 * ── A ÚNICA GUARDA QUE FICOU, E ELA NÃO É DA LGPD ───────────────────────────
 *
 * A lista de supressão. Ela não é regra de privacidade: é a pessoa que disse, na
 * conversa, "não me mande mais mensagem". Reabordar quem disse isso é o caminho
 * mais curto para a denúncia que derruba um número — e é justamente o que os dez
 * números existem para evitar.
 *
 * Hoje ela tem ZERO entradas. Ou seja: ela não bloqueia ninguém agora, e só vai
 * bloquear quem pedir. Mantê-la custa nada e protege o rodízio.
 *
 * Módulo PURO: sem rede, sem banco, sem relógio implícito. Recebe o registro e
 * devolve a decisão. O contrato o executa.
 */

/** O que a lead traz do momento em que entrou. Só o que decide canal. */
export type OrigemDaLead = {
  /** `metadata.meta.dataSharingConsent` — o que a captação registrou. */
  dataSharingConsent?: unknown;
  /** `metadata.meta.consentBasis` — a base legal, escrita por quem a declarou. */
  consentBasis?: unknown;
  /** `metadata.meta.origem` — formulario_meta, importacao_planilha, declarado_pelo_dono… */
  origem?: unknown;
};

export type LeadParaRecuperar = {
  id: string;
  /** O motivo do descarte, de `pipeline_stage_moves.discard_reason_key`. */
  motivoDoDescarte: string | null;
  temTelefone: boolean;
  temEmail: boolean;
  /** Está na lista de supressão? Quem pediu para não receber NUNCA recebe. */
  suprimido: boolean;
  origem: OrigemDaLead;
};

export type CanalDeRecuperacao = "mensagem" | "ligacao" | "nenhum";

export type DecisaoDeRecuperacao = {
  leadId: string;
  recuperavel: boolean;
  canal: CanalDeRecuperacao;
  /** A frase que a tela mostra. Nunca vazia: motivo em branco parece defeito. */
  porque: string;
  /** A base legal, quando existe. `null` quando o canal não a exige. */
  baseLegal: string | null;
  /** Ordem de ataque: menor é primeiro. */
  prioridade: number;
};

/**
 * Motivos que representam uma RECUSA da pessoa. Estes não voltam, e não é
 * conservadorismo: reabordar quem disse não é o caminho mais rápido para a
 * reclamação que derruba o número.
 */
export const MOTIVOS_QUE_SAO_RECUSA = ["sem_interesse", "spam", "opt_out", "nao_perturbe"] as const;

/**
 * Motivos que representam FALHA DE ALCANCE — a pessoa nunca se manifestou.
 * É aqui que mora a recuperação.
 */
export const MOTIVOS_DE_FALHA_DE_ALCANCE = ["inalcancavel", "sem_retorno", "nao_atendeu"] as const;

/**
 * `contato_invalido` é caso à parte: o telefone não existe. Não é recusa nem
 * falha de alcance — é dado quebrado, e nenhum canal resolve.
 */
const MOTIVOS_DE_DADO_QUEBRADO = ["contato_invalido", "duplicada"] as const;

const ehRecusa = (motivo: string | null) =>
  motivo !== null && (MOTIVOS_QUE_SAO_RECUSA as readonly string[]).includes(motivo);
const ehFalhaDeAlcance = (motivo: string | null) =>
  motivo !== null && (MOTIVOS_DE_FALHA_DE_ALCANCE as readonly string[]).includes(motivo);
const ehDadoQuebrado = (motivo: string | null) =>
  motivo !== null && (MOTIVOS_DE_DADO_QUEBRADO as readonly string[]).includes(motivo);

/**
 * A base legal para MENSAGEM, derivada do que a captação registrou.
 *
 * Derivada e não armazenada, de propósito: um campo copiado envelhece e diverge
 * da origem. Aqui a resposta vem sempre do mesmo lugar de onde veio o dado.
 *
 * `dataSharingConsent` precisa ser `true` de verdade — a string `"false"` do
 * JSON não passa, e é exatamente o valor que as 234 da planilha carregam.
 */
export function baseLegalParaMensagem(origem: OrigemDaLead): string | null {
  const consentiu = origem.dataSharingConsent === true || origem.dataSharingConsent === "true";
  if (!consentiu) return null;
  const base = typeof origem.consentBasis === "string" ? origem.consentBasis.trim() : "";
  if (base) return base;
  // Consentiu mas ninguém escreveu a base: a origem vira a base, porque é o que
  // de fato aconteceu. Silêncio aqui viraria "sem consentimento", que é falso.
  const origemDeclarada = typeof origem.origem === "string" ? origem.origem.trim() : "";
  return origemDeclarada ? `origem_${origemDeclarada}` : "consentimento_sem_base_escrita";
}

/**
 * A decisão, por lead.
 *
 * A ordem das guardas é a ordem da consequência: supressão primeiro (quem pediu
 * para não receber), recusa depois, dado quebrado em seguida, e só então o
 * canal. Inverter isso faria uma lead suprimida ser classificada como
 * recuperável antes de alguém olhar a supressão.
 */
export function decidirRecuperacao(lead: LeadParaRecuperar): DecisaoDeRecuperacao {
  const nao = (porque: string): DecisaoDeRecuperacao => ({
    leadId: lead.id,
    recuperavel: false,
    canal: "nenhum",
    porque,
    baseLegal: null,
    prioridade: Number.MAX_SAFE_INTEGER,
  });

  if (lead.suprimido) return nao("Pediu para não receber contato. Não volta por canal nenhum.");
  if (ehRecusa(lead.motivoDoDescarte)) {
    return nao(`Descartada por "${lead.motivoDoDescarte}" — a pessoa se manifestou, e a manifestação vale.`);
  }
  if (ehDadoQuebrado(lead.motivoDoDescarte)) {
    return nao(`Descartada por "${lead.motivoDoDescarte}" — o problema é o dado de contato, e nenhum canal resolve.`);
  }
  if (!lead.temTelefone && !lead.temEmail) return nao("Sem telefone e sem e-mail: não há por onde chamar.");

  const alcance = ehFalhaDeAlcance(lead.motivoDoDescarte);
  const semMotivo = lead.motivoDoDescarte === null || lead.motivoDoDescarte === "";
  if (!alcance && !semMotivo) {
    return nao(`Motivo "${lead.motivoDoDescarte}" não está classificado como falha de alcance nem como recusa.`);
  }

  // A base legal continua sendo lida — como DADO, para a tela e a auditoria
  // saberem de onde a lead veio. Ela não decide mais o canal.
  const baseLegal = baseLegalParaMensagem(lead.origem);

  if (lead.temTelefone) {
    return {
      leadId: lead.id,
      recuperavel: true,
      canal: "mensagem",
      porque: alcance
        ? "Nunca foi alcançada — ninguém falou com ela, e ela nunca recusou. A IA abre conversa a qualquer hora."
        : "Descartada sem motivo escrito: não há registro de recusa.",
      baseLegal,
      // Quem tem base legal escrita vai primeiro: é a mesma lead, com menos
      // risco de reclamação, e reclamação é o que degrada número no rodízio.
      prioridade: alcance ? (baseLegal ? 1 : 2) : baseLegal ? 3 : 4,
    };
  }

  return {
    leadId: lead.id,
    recuperavel: true,
    canal: "ligacao",
    porque: "Só tem e-mail. Recuperável, mas por um canal que ninguém automatizou aqui ainda.",
    baseLegal,
    prioridade: 5,
  };
}

/** A fila inteira, já ordenada por onde atacar primeiro. */
export function filaDeRecuperacao(leads: LeadParaRecuperar[]): DecisaoDeRecuperacao[] {
  return leads
    .map(decidirRecuperacao)
    .filter((d) => d.recuperavel)
    .sort((a, b) => a.prioridade - b.prioridade || a.leadId.localeCompare(b.leadId));
}

/**
 * O resumo que a tela mostra. Ele existe para responder, sem ninguém abrir o
 * código: quantas dá para recuperar, por onde, e quantas NÃO dá — com o motivo.
 */
export function resumoDaRecuperacao(leads: LeadParaRecuperar[]) {
  const decisoes = leads.map(decidirRecuperacao);
  const porMotivoDeExclusao = new Map<string, number>();
  for (const d of decisoes) {
    if (d.recuperavel) continue;
    porMotivoDeExclusao.set(d.porque, (porMotivoDeExclusao.get(d.porque) ?? 0) + 1);
  }
  return {
    avaliadas: leads.length,
    recuperaveis: decisoes.filter((d) => d.recuperavel).length,
    porMensagem: decisoes.filter((d) => d.canal === "mensagem").length,
    porLigacao: decisoes.filter((d) => d.canal === "ligacao").length,
    naoRecuperaveis: decisoes.filter((d) => !d.recuperavel).length,
    /** Nunca some: "0 excluídas" e "não olhei" precisam ser distinguíveis. */
    porqueForamExcluidas: [...porMotivoDeExclusao.entries()]
      .map(([porque, quantas]) => ({ porque, quantas }))
      .sort((a, b) => b.quantas - a.quantas),
  };
}
