/**
 * A IA GENERATIVA RESPONDE, OU SÓ TEM CHAVE?
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * `app/api/ai/briefing/route.ts` publicava
 *
 *     model: { generativeReady: aiProviderReadiness().openai }
 *
 * e `aiProviderReadiness().openai` é `Boolean(process.env.OPENAI_API_KEY)`. A
 * tela lia "IA pronta" a partir da EXISTÊNCIA de uma variável de ambiente.
 *
 * Medido em 2026-07-29, com as credenciais reais: a OpenAI devolve HTTP 429
 * `insufficient_quota` e a Anthropic HTTP 400 "credit balance is too low". A
 * única generativa que responde é a Perplexity — que as três
 * `ATLAS_AI_*_PROVIDER_ORDER` já colocam em PRIMEIRO lugar. Ou seja: o campo
 * estava errado nas duas pontas. Dizia pronto o que não responde, e ignorava o
 * provedor que responde.
 *
 * ── A ARMADILHA DO `local` ──────────────────────────────────────────────────
 *
 * `ai_usage_events` no banco de homologação tinha, em 2026-07-29, 43 linhas: 21
 * de `perplexity/sonar` e 22 de `local/deterministic-safe-fallback`. As linhas
 * `local` são a PEGADA DE QUE TODOS OS PROVEDORES FALHARAM — o roteador grava o
 * fallback determinístico como se fosse uso normal.
 *
 * Quem contasse "existe linha recente em ai_usage_events" como prova de IA viva
 * concluiria "pronta" justamente nas chamadas em que nenhuma IA respondeu. Por
 * isso `local` é recusado aqui de forma explícita, e o contrato prova a recusa.
 */

import {
  declararCredencial,
  type DeclaracaoDeCredencial,
  type EstadoDeCredencial,
} from "../integrations/estado-de-credencial.ts";

/**
 * O fallback determinístico. Nunca é evidência de IA viva: ele é o que sobra
 * quando nada respondeu.
 */
export const PROVEDOR_DE_FALLBACK = "local";

export type EvidenciaDeProvedor = {
  provedor: string;
  ok: boolean;
  em?: string | null;
  detalhe?: string;
};

/** O modelo com que o fallback determinístico se registra em ai_usage_events. */
export const MODELO_DE_FALLBACK = "deterministic-safe-fallback";

export type LinhaDeUso = {
  provider?: string | null;
  model?: string | null;
  created_at?: string | null;
  total_tokens?: number | null;
};

/**
 * Converte linhas de `ai_usage_events` em evidência de provedor VIVO.
 *
 * `recordUsage` grava tanto a resposta de um provedor quanto o fallback
 * determinístico — e o fallback só existe quando TODOS falharam. Por isso a
 * exclusão é dupla: pelo nome do provedor E pelo nome do modelo. Se algum dia o
 * fallback for registrado com outro rótulo de provedor, o modelo ainda o
 * entrega; foi o cuidado que faltou em outras contagens deste repositório, que
 * mediram "houve linha" e chamaram de "funcionou".
 *
 * Só a linha MAIS RECENTE de cada provedor interessa: prontidão é sobre agora.
 */
export function evidenciasDeLinhasDeUso(linhas: LinhaDeUso[]): EvidenciaDeProvedor[] {
  const porProvedor = new Map<string, EvidenciaDeProvedor>();
  for (const linha of linhas) {
    const provedor = String(linha.provider ?? "").trim().toLowerCase();
    if (!provedor || provedor === PROVEDOR_DE_FALLBACK) continue;
    if (String(linha.model ?? "").trim() === MODELO_DE_FALLBACK) continue;
    const em = typeof linha.created_at === "string" ? linha.created_at : null;
    const anterior = porProvedor.get(provedor);
    if (anterior && (anterior.em ?? "") >= (em ?? "")) continue;
    porProvedor.set(provedor, {
      provedor,
      ok: true,
      em,
      detalhe: `${linha.model || "modelo não registrado"} respondeu com ${Number(linha.total_tokens || 0)} tokens`,
    });
  }
  return [...porProvedor.values()];
}

/**
 * Lê a evidência no banco. Recebe o cliente por parâmetro para este módulo
 * continuar sem `server-only` — é o que permite ao contrato executar a
 * derivação acima sem rede nem banco.
 *
 * Tabela ausente ou erro de leitura devolve `medido: false` com motivo: lacuna
 * DECLARADA. Tratar erro de leitura como "nenhum provedor respondeu" seria
 * transformar ausência de medição em medição negativa — a mesma doença, de
 * cabeça para baixo.
 */
type ConsultaEncadeavel = {
  select: (colunas: string) => ConsultaEncadeavel;
  gte: (coluna: string, valor: string) => ConsultaEncadeavel;
  order: (coluna: string, opcoes: { ascending: boolean }) => ConsultaEncadeavel;
  limit: (n: number) => PromiseLike<{ data: LinhaDeUso[] | null; error: unknown }>;
};

export async function lerEvidenciaDeProvedores(
  // `unknown` na fronteira, com UMA conversão documentada abaixo: é o que
  // permite receber tanto o cliente admin quanto o cliente com RLS do usuário
  // sem este módulo depender dos tipos gerados do Supabase (e, com eles, de
  // `server-only`, que tornaria o contrato incapaz de importar o arquivo).
  cliente: { from: (tabela: string) => unknown },
  opcoes?: { desdeMs?: number; agora?: number; limite?: number },
): Promise<{ medido: boolean; motivo: string | null; evidencias: EvidenciaDeProvedor[] }> {
  const agora = opcoes?.agora ?? Date.now();
  const desde = new Date(agora - (opcoes?.desdeMs ?? 7 * 24 * 60 * 60 * 1000)).toISOString();
  try {
    const consulta = cliente.from("ai_usage_events") as ConsultaEncadeavel;
    const { data, error } = await consulta
      .select("provider,model,created_at,total_tokens")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(opcoes?.limite ?? 200);
    if (error) {
      return {
        medido: false,
        motivo: "não foi possível ler ai_usage_events — evidência de uso indisponível neste ambiente",
        evidencias: [],
      };
    }
    return { medido: true, motivo: null, evidencias: evidenciasDeLinhasDeUso(data ?? []) };
  } catch {
    return {
      medido: false,
      motivo: "leitura de ai_usage_events lançou exceção — evidência de uso indisponível",
      evidencias: [],
    };
  }
}

export type ProntidaoGenerativa = {
  /** Só true com resposta real de um provedor generativo dentro da janela. */
  pronta: boolean;
  estado: EstadoDeCredencial;
  /** Quem respondeu, quando alguém respondeu. */
  provedor: string | null;
  verificadoEm: string | null;
  motivo: string;
  /** A ordem realmente considerada, sem `local`. */
  ordemConsiderada: string[];
  porProvedor: Record<string, DeclaracaoDeCredencial>;
};

export type EntradaDaProntidaoGenerativa = {
  /** Ordem configurada do tier. `local` é removido: não é IA generativa. */
  ordem: string[];
  configurados: Record<string, boolean>;
  evidencias: EvidenciaDeProvedor[];
  agora?: number;
};

export function avaliarProntidaoGenerativa(
  entrada: EntradaDaProntidaoGenerativa,
): ProntidaoGenerativa {
  const agora = entrada.agora ?? Date.now();

  // Sem ordem configurada, considera todo provedor conhecido: a pergunta
  // "alguém responde?" não depende de preferência. `local` fica fora sempre.
  const candidatos = (entrada.ordem.length ? entrada.ordem : Object.keys(entrada.configurados))
    .map((nome) => String(nome).trim().toLowerCase())
    .filter((nome) => nome && nome !== PROVEDOR_DE_FALLBACK);
  const ordemConsiderada = [...new Set(candidatos)];

  const porProvedor: Record<string, DeclaracaoDeCredencial> = {};
  for (const provedor of ordemConsiderada) {
    // A evidência precisa ser DAQUELE provedor: é a mesma recusa que impede o
    // estado de e-mail de nascer de uma consulta ao banco.
    const bruta = entrada.evidencias.find(
      (item) => String(item.provedor).trim().toLowerCase() === provedor,
    );
    porProvedor[provedor] = declararCredencial({
      assunto: provedor,
      presente: Boolean(entrada.configurados[provedor]),
      faltando: entrada.configurados[provedor] ? [] : [`credencial de ${provedor}`],
      evidencia: bruta
        ? { assunto: provedor, ok: bruta.ok, em: bruta.em ?? null, detalhe: bruta.detalhe }
        : null,
      motivoSemVerificacao: `Credencial de ${provedor} presente; nenhuma resposta real registrada na janela.`,
      agora,
    });
  }

  const viva = ordemConsiderada.find((provedor) => porProvedor[provedor].estado === "viva");
  if (viva) {
    return {
      pronta: true,
      estado: "viva",
      provedor: viva,
      verificadoEm: porProvedor[viva].verificadoEm,
      motivo: `${viva} respondeu de verdade${porProvedor[viva].verificadoEm ? ` em ${porProvedor[viva].verificadoEm}` : ""}.`,
      ordemConsiderada,
      porProvedor,
    };
  }

  const presentes = ordemConsiderada.filter((provedor) => porProvedor[provedor].estado !== "ausente");
  if (!presentes.length) {
    return {
      pronta: false,
      estado: "ausente",
      provedor: null,
      verificadoEm: null,
      motivo:
        "Nenhum provedor generativo configurado. A tela precisa dizer isso — " +
        "não existe IA pronta sem provedor.",
      ordemConsiderada,
      porProvedor,
    };
  }

  const quebradas = presentes.filter((provedor) => porProvedor[provedor].estado === "quebrada");
  if (quebradas.length === presentes.length) {
    return {
      pronta: false,
      estado: "quebrada",
      provedor: null,
      verificadoEm: null,
      motivo:
        `Todos os provedores configurados falharam na última chamada real: ${quebradas
          .map((provedor) => `${provedor} (${porProvedor[provedor].motivo})`)
          .join("; ")}. A resposta sai do fallback determinístico, não de IA.`,
      ordemConsiderada,
      porProvedor,
    };
  }

  return {
    pronta: false,
    estado: "configurada_nao_verificada",
    provedor: null,
    verificadoEm: null,
    motivo:
      `Credencial presente para ${presentes.join(", ")}, e nenhuma resposta real registrada na ` +
      "janela. Chave presente não é IA pronta — foi exatamente o que este campo afirmava antes.",
    ordemConsiderada,
    porProvedor,
  };
}
