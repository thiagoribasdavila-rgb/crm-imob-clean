/**
 * CONSENTIMENTO PARA COMPARTILHAR DADOS COM A META.
 *
 * ── O que a medição mostrou ─────────────────────────────────────────────────
 *
 * 217 leads no banco vivo. Todas com identificador (e-mail ou telefone). Sete
 * já em etapa que dispara evento de conversão. E **zero** prontas para enviar,
 * por um motivo só: nenhuma tem consentimento registrado.
 *
 * Não falta e-mail, não falta telefone, não falta etapa. Falta o corretor
 * registrar um fato que só ele sabe.
 *
 * ── Por que isto não é "mais um campo" ──────────────────────────────────────
 *
 * Mandar e-mail e telefone (mesmo com hash) para a Meta é tratamento de dado
 * pessoal. Quem responde por isso é a imobiliária, e a defesa é o registro de
 * que houve base legal — quem registrou, quando, e de onde veio.
 *
 * Por isso o registro guarda autor e data. Um booleano solto em metadata não
 * defende ninguém numa fiscalização: "o sistema diz que sim" não é resposta.
 *
 * ── As três respostas, e por que "não perguntei" existe ─────────────────────
 *
 * `concedido` · `negado` · `nao_perguntado`
 *
 * Sem o terceiro, o corretor com pressa marcaria "sim" para tirar o aviso da
 * frente. Com ele, existe uma resposta honesta para "ainda não falei disso com
 * o cliente" — e o CRM consegue distinguir "não pode enviar" de "ninguém
 * perguntou ainda", que são problemas diferentes com donos diferentes.
 *
 * `nao_perguntado` NÃO envia. Só `concedido` envia.
 */

export type EstadoDeConsentimento = "concedido" | "negado" | "nao_perguntado";

export const ESTADOS: readonly EstadoDeConsentimento[] = [
  "concedido", "negado", "nao_perguntado",
] as const;

export function ehEstadoValido(v: unknown): v is EstadoDeConsentimento {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v);
}

/**
 * De onde veio a base legal. Muda quem responde pelo dado.
 *
 * `formulario_meta` é o caso especial: a lead preencheu um formulário DENTRO da
 * Meta e aceitou os termos lá. A base já existe antes de o CRM tocar no
 * assunto — não é o corretor afirmando em nome do cliente.
 */
export type OrigemDoConsentimento =
  | "formulario_meta"
  /** Declarado pela diretoria — é ela que responde pela base legal. */
  | "declarado_pelo_diretor"
  /** Leads antigas: o registro dizia "corretor" antes da regra mudar. */
  | "declarado_pelo_corretor"
  | "importado";

export type RegistroDeConsentimento = {
  dataSharingConsent: boolean;
  estado: EstadoDeConsentimento;
  origem: OrigemDoConsentimento;
  /** Quem registrou. Sem isto o registro não defende ninguém. */
  registradoPor: string;
  registradoEm: string;
};

/**
 * Lê o estado a partir do metadata da lead.
 *
 * Ausência de campo, de objeto ou de metadata NUNCA vira consentimento — a
 * mesma régua do `capi-window`. Aqui devolve `nao_perguntado`, que é o que
 * "não sabemos" significa na prática.
 */
export function lerEstado(metadata: unknown): EstadoDeConsentimento {
  if (!metadata || typeof metadata !== "object") return "nao_perguntado";
  const meta = (metadata as Record<string, unknown>).meta;
  if (!meta || typeof meta !== "object") return "nao_perguntado";
  const registro = meta as Record<string, unknown>;
  if (ehEstadoValido(registro.estado)) return registro.estado;
  // Compatibilidade: leads antigas podem ter só o booleano.
  if (registro.dataSharingConsent === true) return "concedido";
  if (registro.dataSharingConsent === false) return "negado";
  return "nao_perguntado";
}

/**
 * Monta o metadata atualizado, preservando tudo que já existe.
 *
 * Sobrescrever o objeto inteiro apagaria o que o webhook da Meta gravou —
 * `ad_id`, `form_id`, `campaign_id` — que é a atribuição da lead. Perder isso
 * quebraria o funil por criativo, que mede qual peça traz quem fecha.
 */
export function aplicarConsentimento(
  metadataAtual: unknown,
  entrada: {
    estado: EstadoDeConsentimento;
    origem: OrigemDoConsentimento;
    registradoPor: string;
    registradoEm?: string;
  },
): Record<string, unknown> {
  const base = (metadataAtual && typeof metadataAtual === "object")
    ? { ...(metadataAtual as Record<string, unknown>) }
    : {};
  const metaAtual = (base.meta && typeof base.meta === "object")
    ? { ...(base.meta as Record<string, unknown>) }
    : {};

  const registro: RegistroDeConsentimento = {
    // O booleano continua sendo a chave que `capi-window` lê. Mantido para não
    // criar duas verdades sobre a mesma coisa.
    dataSharingConsent: entrada.estado === "concedido",
    estado: entrada.estado,
    origem: entrada.origem,
    registradoPor: entrada.registradoPor,
    registradoEm: entrada.registradoEm ?? new Date().toISOString(),
  };

  base.meta = { ...metaAtual, ...registro };
  return base;
}

/**
 * O CONSENTIMENTO QUE VEM DA FONTE, não de alguém afirmando depois.
 *
 * ── Por que isto virou função ───────────────────────────────────────────────
 *
 * A regra existia inline no processador da fila (`/api/v2/outbox/process`): se a
 * fonte declara `conversion_sharing_enabled`, a lead nasce com consentimento de
 * origem `formulario_meta`. Funciona — as leads que entram pelo webhook chegam
 * corretas.
 *
 * Mas o caminho da IMPORTAÇÃO de arquivo (`/api/v1/leads/import`) criava a lead
 * sem `metadata` nenhum: sem consentimento, sem formulário, sem origem. Foi
 * assim que 173 das 199 leads entraram — e só têm consentimento porque alguém
 * registrou em lote depois.
 *
 * Dois caminhos para o mesmo fato, um completo e o outro pela metade. É a
 * terceira vez que essa forma de defeito aparece neste produto (ver o `move.id`
 * do pipeline e as duas tabelas do desfazer). A regra agora mora num lugar só.
 *
 * ── O que a função NÃO faz ──────────────────────────────────────────────────
 *
 * Não inventa base legal. Fonte sem `conversion_sharing_enabled` devolve
 * `nao_perguntado` — que é a resposta honesta para "esta planilha veio de onde,
 * mesmo?". Marcar "sim" ali seria afirmar em nome de uma pessoa que nunca foi
 * perguntada, e é exatamente isso que uma fiscalização procura.
 */
export type FonteDeLead = {
  conversion_sharing_enabled?: boolean | null;
  consent_basis?: string | null;
  name?: string | null;
} | null | undefined;

export function consentimentoDaFonte(fonte: FonteDeLead): {
  estado: EstadoDeConsentimento;
  origem: OrigemDoConsentimento;
  dataSharingConsent: boolean;
  consentBasis: string | null;
} {
  const temClausula = fonte?.conversion_sharing_enabled === true;
  return {
    estado: temClausula ? "concedido" : "nao_perguntado",
    // `formulario_meta` só se aplica quando a base veio de LÁ. Nos outros casos
    // ninguém declarou nada ainda — e `lerEstado` devolve `nao_perguntado`, que
    // a tela mostra para o diretor resolver.
    origem: temClausula ? "formulario_meta" : "importado",
    dataSharingConsent: temClausula,
    consentBasis: temClausula ? (fonte?.consent_basis ?? null) : null,
  };
}

/**
 * O que falta nesta lead para o evento de conversão poder sair.
 *
 * Devolve a lista em ordem de quem resolve: o que é do corretor primeiro.
 */
export function faltaParaEnviar(lead: {
  email?: string | null;
  phone?: string | null;
  phone_normalized?: string | null;
  status?: string | null;
  metadata?: unknown;
}): string[] {
  const falta: string[] = [];

  const estado = lerEstado(lead.metadata);
  if (estado === "nao_perguntado") falta.push("registrar se o cliente autorizou compartilhar os dados");
  else if (estado === "negado") falta.push("o cliente não autorizou — esta lead não será enviada");

  if (!lead.email && !lead.phone && !lead.phone_normalized) {
    falta.push("e-mail ou telefone (sem identificador a Meta não reconhece a pessoa)");
  }

  return falta;
}

/** Frase curta para a tela. Null quando está tudo certo. */
export function porQueNaoEnvia(lead: Parameters<typeof faltaParaEnviar>[0]): string | null {
  const falta = faltaParaEnviar(lead);
  return falta.length ? falta[0] : null;
}
