/**
 * PRONTIDÃO DAS INTEGRAÇÕES — o corpo do `/api/ready`, em módulo puro.
 *
 * ── POR QUE FORA DA ROTA ────────────────────────────────────────────────────
 *
 * A primeira proteção pensada para isto era grep no fonte da rota. O mutation
 * testing deste repositório já derrubou essa ideia duas vezes: trocar um `if`
 * por `if (false)` deixa a suíte verde enquanto a string continua no arquivo,
 * morta. Aqui a derivação é EXECUTADA pelo contrato, com ambientes montados à
 * mão e sem rede.
 *
 * ── A DECISÃO ESTRUTURAL ────────────────────────────────────────────────────
 *
 * O resultado da consulta ao banco NÃO é parâmetro desta função. Ele entra como
 * uma evidência ROTULADA (`assunto: "banco"`), na mesma lista de todas as
 * outras, e só a linha do Supabase declara o assunto `banco`.
 *
 * Isso não é estilo: é o que torna impossível repetir o defeito do `smtp`, que
 * publicava `checks.database.ok ? "via-supabase-auth" : "error"` — estado sobre
 * e-mail derivado de uma consulta a `organizations`. Para reincidir agora seria
 * preciso oferecer a evidência de `banco` a uma linha de outro assunto, e
 * `declararCredencial` RECUSA evidência de assunto diferente.
 *
 * Duas camadas, as duas executáveis: a estrutura não deixa passar, e se alguém
 * forçar, a recusa aparece em `evidenciaDeOutroAssunto`.
 */

import {
  declararCredencial,
  resumirDeclaracoes,
  type DeclaracaoDeCredencial,
  type EstadoDeCredencial,
  type EvidenciaDeUso,
} from "./estado-de-credencial.ts";

/**
 * Um assunto por coisa exercitável. São os rótulos que casam evidência com
 * linha — trocar um deles sem trocar o outro faz a evidência ser recusada, o que
 * é o desfecho seguro (não verificado), nunca o verde falso.
 */
export const ASSUNTOS = {
  banco: "banco",
  email: "email",
  metaLeadAds: "meta.lead_ads",
  metaCapi: "meta.capi",
  whatsapp: "whatsapp",
  openai: "openai",
  anthropic: "anthropic",
  perplexity: "perplexity",
} as const;

/**
 * O SMTP não é configurado nesta aplicação. Não existe cliente SMTP no código:
 * convite e recuperação de senha saem pelo Supabase Auth, cujo SMTP vive no
 * painel do projeto. Portanto NADA aqui exercita envio de e-mail — e o estado
 * honesto é "não verificado", com o motivo dizendo onde olhar e qual é o risco.
 *
 * O risco é concreto e já foi medido em outros projetos: o SMTP padrão do
 * Supabase entrega poucos e-mails por hora. Recuperação de senha falha em
 * produção sem nenhum sinal do lado do produto.
 */
export const MOTIVO_SMTP =
  "Nada nesta aplicação exercita envio de e-mail: não há cliente SMTP no código e o " +
  "e-mail transacional (convite, recuperação de senha) sai pelo Supabase Auth. " +
  "Logo, este estado NUNCA é medido aqui — e não pode ser derivado da consulta ao " +
  "banco, que era o defeito anterior. Se o SMTP for o padrão do Supabase (poucos " +
  "e-mails por hora), a recuperação de senha falha em produção com esta tela verde.";

export const ONDE_SE_CONFIGURA_SMTP = "painel do Supabase › Authentication › SMTP Settings";

export type EntradaDaProntidao = {
  env: Record<string, string | undefined>;
  /** Chamadas que ACONTECERAM, cada uma rotulada com o assunto exercitado. */
  evidencias?: EvidenciaDeUso[];
  /**
   * Defeito de forma por assunto — modelo com nome inválido, por exemplo.
   * Torna a próxima chamada impossível sem gastar uma chamada para descobrir.
   */
  defeitos?: Partial<Record<string, string | null>>;
  agora?: number;
};

export type ProntidaoDasIntegracoes = {
  integrations: Record<string, DeclaracaoDeCredencial>;
  resumo: Record<EstadoDeCredencial, string[]>;
};

export function montarProntidaoDasIntegracoes(
  entrada: EntradaDaProntidao,
): ProntidaoDasIntegracoes {
  const env = entrada.env;
  const evidencias = entrada.evidencias ?? [];
  const defeitos = entrada.defeitos ?? {};
  const agora = entrada.agora ?? Date.now();

  const presente = (...nomes: string[]) => nomes.every((nome) => Boolean(env[nome]?.trim()));
  const faltando = (...nomes: string[]) => nomes.filter((nome) => !env[nome]?.trim());
  const evidenciaDe = (assunto: string) =>
    evidencias.find((item) => item.assunto === assunto) ?? null;

  const declarar = (
    assunto: string,
    extra: Omit<Parameters<typeof declararCredencial>[0], "assunto" | "agora" | "evidencia">,
  ) =>
    declararCredencial({
      ...extra,
      assunto,
      agora,
      evidencia: evidenciaDe(assunto),
      defeitoDeConfiguracao: extra.defeitoDeConfiguracao ?? defeitos[assunto] ?? null,
    });

  const capiLigada = env.ATLAS_META_CAPI_ENABLED === "true";

  const integrations: Record<string, DeclaracaoDeCredencial> = {
    supabase: declarar(ASSUNTOS.banco, {
      presente: presente("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"),
      faltando: faltando("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"),
    }),

    // Lead Ads e CAPI são DUAS integrações, com tokens e escopos diferentes —
    // medi-las na mesma linha já deixou o painel verde com a camada do dinheiro
    // morta neste projeto.
    meta: declarar(ASSUNTOS.metaLeadAds, {
      presente:
        presente("META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN") &&
        (presente("META_LEAD_ACCESS_TOKEN") || presente("META_ADS_ACCESS_TOKEN")),
      faltando: [
        ...faltando("META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"),
        ...(presente("META_LEAD_ACCESS_TOKEN") || presente("META_ADS_ACCESS_TOKEN")
          ? []
          : ["META_LEAD_ACCESS_TOKEN ou META_ADS_ACCESS_TOKEN"]),
      ],
      motivoSemVerificacao:
        "Token presente; nenhuma chamada à Graph foi exercitada por esta rota. " +
        "Prontidão medida da Meta vive em /api/v1/governance/integration-health, " +
        "que confere cadastro e evidência de sincronismo.",
    }),

    // O dataset saiu do ambiente e passou a viver em meta_conversion_configs, por
    // organização. Checá-lo aqui deixaria a tela VERDE enquanto o envio segue
    // bloqueado — a decisão original desta rota, preservada.
    metaCapi: declarar(ASSUNTOS.metaCapi, {
      desligadaPor: capiLigada ? null : "ATLAS_META_CAPI_ENABLED",
      presente: presente("META_CONVERSIONS_ACCESS_TOKEN"),
      faltando: faltando("META_CONVERSIONS_ACCESS_TOKEN"),
      motivoSemVerificacao:
        "Token global presente. O dataset é por organização (meta_conversion_configs) " +
        "e não é conferível aqui: afirmar prontidão pelo ambiente deixaria a tela verde " +
        "com o envio bloqueado.",
    }),

    whatsapp: declarar(ASSUNTOS.whatsapp, {
      presente: presente("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"),
      faltando: faltando("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"),
    }),

    openai: declarar(ASSUNTOS.openai, {
      presente: presente("OPENAI_API_KEY"),
      faltando: faltando("OPENAI_API_KEY"),
      motivoSemVerificacao:
        "Chave presente e nenhuma resposta real registrada na janela. Chave presente não " +
        "é saldo na conta: medido em 2026-07-29, esta conta devolveu HTTP 429 " +
        "insufficient_quota com o modelo do produto.",
    }),

    anthropic: declarar(ASSUNTOS.anthropic, {
      presente: presente("ANTHROPIC_API_KEY"),
      faltando: faltando("ANTHROPIC_API_KEY"),
      motivoSemVerificacao:
        "Chave presente e nenhuma resposta real registrada na janela. Medido em " +
        "2026-07-29: HTTP 400 'credit balance is too low'.",
    }),

    perplexity: declarar(ASSUNTOS.perplexity, {
      presente: presente("PERPLEXITY_API_KEY"),
      faltando: faltando("PERPLEXITY_API_KEY"),
    }),

    // Sem `presente: false`: o e-mail transacional EXISTE, só não é configurado
    // nem exercitado aqui. Dizer "ausente" seria outra mentira, de sinal
    // contrário — a recuperação de senha funciona quando o SMTP do painel está
    // bom. O estado honesto é "não verificado", apontando onde se configura.
    smtp: declarar(ASSUNTOS.email, {
      presente: true,
      motivoSemVerificacao: MOTIVO_SMTP,
      ondeSeConfigura: ONDE_SE_CONFIGURA_SMTP,
    }),
  };

  return { integrations, resumo: resumirDeclaracoes(integrations) };
}
