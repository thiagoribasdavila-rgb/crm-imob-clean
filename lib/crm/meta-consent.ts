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
