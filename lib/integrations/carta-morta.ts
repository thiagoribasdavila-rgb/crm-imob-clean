import type { SupabaseClient } from "@supabase/supabase-js";
import { deveEnviarCodigoDeTeste, normalizarModoDeEnvio } from "@/lib/meta/modo-de-envio";
import {
  ehProvaSintetica,
  idadeEmHoras,
  vereditoDaCartaMorta,
  type LinhaDaCartaMorta,
  type Precondicao,
  type Veredito,
} from "@/lib/integrations/causa-da-carta-morta";

/**
 * LEITURA DA CARTA MORTA — com as precondições do envio MEDIDAS, não supostas.
 *
 * Este é o único lugar que consulta o banco a respeito da fila morta. A tela, a
 * rota de reprocesso e o vigia chamam daqui, para que os três respondam a mesma
 * coisa sobre a mesma linha.
 *
 * ── AS OITO PORTAS DE `meta.conversion.send` ────────────────────────────────
 *
 * Lidas em app/api/v2/outbox/process/route.ts:895-931, na ordem em que o
 * despachante as atravessa. A carta morta guarda a PRIMEIRA que bateu; as
 * outras continuam lá, caladas, esperando o reprocesso para aparecer.
 *
 * Medido em 02/08/2026 para as 10 linhas de `meta.conversion.send`: as sete
 * portas de dado estavam TODAS abertas (config existe, enabled=true, mode=test
 * COM test_event_code, lead existe com e-mail e telefone, consentimento
 * registrado). A única fechada era o token. Ou seja: a fila morreu de uma
 * variável de ambiente, e as dez conversões que a Meta nunca soube estavam a um
 * clique de voltar — clique que não existia em tela nenhuma.
 */

/** Espelho do predicado do despachante (route.ts:928 `if (phone)`).
 *  `normalizeMetaPhone` devolve só os dígitos, e string vazia é falsa — logo um
 *  telefone sem dígito nenhum NÃO vira identificador. Replicado aqui porque a
 *  função é local à rota; `tests/contracts/carta-morta.test.mjs` trava as duas
 *  versões juntas para que uma não ande sem a outra. */
export function temIdentificadorParaMeta(lead: { email?: unknown; phone?: unknown }): boolean {
  if (typeof lead.email === "string" && lead.email.trim()) return true;
  return typeof lead.phone === "string" && /\d/.test(lead.phone);
}

export type CartaMortaDiagnosticada = {
  id: string;
  topico: string;
  criadaEm: string;
  idadeHoras: number | null;
  tentativas: number;
  resolvida: boolean;
  resolvidaEm: string | null;
  resolvidaPor: string | null;
  veredito: Veredito;
};

export type ContagemDaCartaMorta = {
  /** Todas as linhas não resolvidas da tabela. Inclui as provas. */
  total: number;
  /** As que cobram ação humana. É a que o vigia acompanha. */
  operacionais: number;
  /** Provas sintéticas: registradas, fora da contagem operacional, não apagadas. */
  lixoDeTeste: number;
  /** Operacionais cuja causa caiu — o botão está ligado. */
  reprocessaveis: number;
  /** Operacionais cuja causa continua de pé, ou não pôde ser atestada. */
  bloqueadas: number;
  /** Idade da mais antiga NÃO resolvida e operacional. */
  maisAntigaHoras: number | null;
};

export type LeituraDaCartaMorta =
  | { ok: true; linhas: CartaMortaDiagnosticada[]; contagem: ContagemDaCartaMorta }
  | { ok: false; motivo: string; detalhe?: string };

/**
 * ── O TIPO DO CLIENTE E ESTRUTURAL, NAO NOMINAL ─────────────────────────────
 *
 * Estava `SupabaseClient<never, "public", never>`, que NAO casa com o que
 * `getSupabaseAdmin()` devolve (`SupabaseClient<any, "public", "public", any,
 * any>`) — 31 erros de tipo, todos a mesma causa.
 *
 * `lib/crm/registro-de-atividade.ts` ja tinha resolvido isto do jeito certo:
 * declarar o que se USA (`from`), nao a instancia inteira. Assim o modulo
 * aceita o cliente admin, o do usuario e o duble de teste sem parametrizar
 * genericos que ninguem acerta.
 */
type Cliente = Pick<SupabaseClient, "from">;

/** O token vive no processo que ATENDE a fila. Só a presença é publicada —
 *  nunca o valor, nem prefixo, nem tamanho. */
export function tokenDeConversoesPresente(): boolean {
  return Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN);
}

/**
 * Mede as precondições de `meta.conversion.send` para um lote de cartas mortas.
 *
 * Devolve um mapa `dead_letter_id -> Precondicao[]`. Onde a leitura falhar, a
 * precondição sai `atendida: null` — e `vereditoDaCartaMorta` trata null como
 * bloqueio. Nenhuma falha de leitura vira "pode reprocessar".
 */
async function medirPrecondicoesDaConversao(
  admin: Cliente,
  organizationId: string,
  linhas: Array<{ id: string; outboxEventId: string | null }>,
): Promise<Map<string, Precondicao[]>> {
  const mapa = new Map<string, Precondicao[]>();
  const tokenOk = tokenDeConversoesPresente();
  const daFila = linhas.filter((l) => l.outboxEventId);

  const token = (): Precondicao => ({
    chave: "token_de_conversoes",
    rotulo: "token da Meta no servidor",
    atendida: tokenOk,
    detalhe: tokenOk ? "variável presente" : "META_CONVERSIONS_ACCESS_TOKEN ausente",
  });

  /** Uma precondição que não pôde ser medida. Nunca "atendida". */
  const cega = (chave: string, rotulo: string, motivo: string): Precondicao => ({
    chave,
    rotulo,
    atendida: null,
    detalhe: motivo,
  });

  if (!daFila.length) {
    for (const linha of linhas) mapa.set(linha.id, [token()]);
    return mapa;
  }

  const configQuery = await admin
    .from("meta_conversion_configs")
    .select("dataset_id,mode,enabled,test_event_code,consent_required")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const outboxQuery = await admin
    .from("integration_outbox")
    .select("id,aggregate_id")
    .eq("organization_id", organizationId)
    .in("id", daFila.map((l) => l.outboxEventId as string));

  const agregados = new Map<string, string | null>();
  for (const linha of outboxQuery.data ?? []) {
    agregados.set(String(linha.id), linha.aggregate_id ? String(linha.aggregate_id) : null);
  }

  const idsDeConversao = [...agregados.values()].filter((v): v is string => Boolean(v));
  const conversaoQuery = idsDeConversao.length
    ? await admin
        .from("meta_conversion_events")
        .select("id,lead_id")
        .eq("organization_id", organizationId)
        .in("id", idsDeConversao)
    : { data: [] as Array<{ id: string; lead_id: string | null }>, error: null };

  const conversoes = new Map<string, { leadId: string | null }>();
  for (const linha of conversaoQuery.data ?? []) {
    conversoes.set(String(linha.id), { leadId: linha.lead_id ? String(linha.lead_id) : null });
  }

  const idsDeLead = [...conversoes.values()].map((c) => c.leadId).filter((v): v is string => Boolean(v));
  const leadQuery = idsDeLead.length
    ? await admin
        .from("leads")
        .select("id,email,phone,metadata")
        .eq("organization_id", organizationId)
        .in("id", idsDeLead)
    : { data: [] as Array<Record<string, unknown>>, error: null };

  const leads = new Map<string, Record<string, unknown>>();
  for (const linha of leadQuery.data ?? []) leads.set(String(linha.id), linha);

  const config = configQuery.data;
  const modo = config ? normalizarModoDeEnvio(config.mode) : null;

  for (const linha of linhas) {
    const lista: Precondicao[] = [token()];

    if (configQuery.error) {
      lista.push(cega("dataset", "configuração de conversões", `leitura falhou (${configQuery.error.code ?? "erro"})`));
    } else if (!config) {
      lista.push({ chave: "dataset", rotulo: "configuração de conversões", atendida: false, detalhe: "organização sem meta_conversion_configs" });
    } else {
      lista.push({ chave: "dataset", rotulo: "dataset de conversões", atendida: Boolean(config.dataset_id), detalhe: config.dataset_id ? "dataset cadastrado" : "sem dataset_id" });
      lista.push({ chave: "envio_ligado", rotulo: "envio ligado para a organização", atendida: config.enabled === true, detalhe: config.enabled === true ? "enabled = true" : "enabled = false" });
      // Mesma pinça do despachante: mode='test' sem código iria como PRODUÇÃO.
      const precisaDeCodigo = modo ? deveEnviarCodigoDeTeste(modo) : false;
      lista.push({
        chave: "codigo_de_teste",
        rotulo: "código de teste quando o modo é teste",
        atendida: precisaDeCodigo ? Boolean(config.test_event_code) : true,
        detalhe: precisaDeCodigo ? (config.test_event_code ? "mode=test com código" : "mode=test SEM test_event_code") : `mode=${modo ?? "?"}`,
      });
    }

    const outboxId = linha.outboxEventId;
    if (!outboxId) {
      mapa.set(linha.id, lista);
      continue;
    }

    if (outboxQuery.error) {
      lista.push(cega("evento_na_fila", "evento na fila de entrega", `leitura falhou (${outboxQuery.error.code ?? "erro"})`));
      mapa.set(linha.id, lista);
      continue;
    }

    const agregado = agregados.get(outboxId);
    if (agregado === undefined) {
      lista.push({ chave: "evento_na_fila", rotulo: "evento na fila de entrega", atendida: false, detalhe: "a linha do outbox não existe mais" });
      mapa.set(linha.id, lista);
      continue;
    }

    if (conversaoQuery.error) {
      lista.push(cega("conversao", "registro da conversão", `leitura falhou (${conversaoQuery.error.code ?? "erro"})`));
      mapa.set(linha.id, lista);
      continue;
    }

    const conversao = agregado ? conversoes.get(agregado) : undefined;
    if (!conversao) {
      lista.push({ chave: "conversao", rotulo: "registro da conversão", atendida: false, detalhe: "meta_conversion_events sem a linha" });
      mapa.set(linha.id, lista);
      continue;
    }
    lista.push({ chave: "conversao", rotulo: "registro da conversão", atendida: true, detalhe: "conversão encontrada" });

    if (leadQuery.error) {
      lista.push(cega("lead", "lead da conversão", `leitura falhou (${leadQuery.error.code ?? "erro"})`));
      mapa.set(linha.id, lista);
      continue;
    }

    const lead = conversao.leadId ? leads.get(conversao.leadId) : undefined;
    if (!lead) {
      lista.push({ chave: "lead", rotulo: "lead da conversão", atendida: false, detalhe: "lead não encontrado" });
      mapa.set(linha.id, lista);
      continue;
    }

    lista.push({
      chave: "identificador",
      rotulo: "e-mail ou telefone para correspondência",
      atendida: temIdentificadorParaMeta(lead as { email?: unknown; phone?: unknown }),
      detalhe: temIdentificadorParaMeta(lead as { email?: unknown; phone?: unknown }) ? "identificador presente" : "lead sem e-mail e sem telefone",
    });

    if (config?.consent_required) {
      const metadata = lead.metadata && typeof lead.metadata === "object" ? (lead.metadata as Record<string, unknown>) : {};
      const meta = metadata.meta && typeof metadata.meta === "object" ? (metadata.meta as Record<string, unknown>) : {};
      lista.push({
        chave: "consentimento",
        rotulo: "consentimento de compartilhamento",
        atendida: meta.dataSharingConsent === true,
        detalhe: meta.dataSharingConsent === true ? "consentimento registrado" : "consentimento ausente e exigido pela configuração",
      });
    }

    mapa.set(linha.id, lista);
  }

  return mapa;
}

/**
 * Lê a carta morta da organização, já diagnosticada.
 *
 * `incluirResolvidas` traz também o que já foi reprocessado — a tela usa para
 * mostrar o histórico, que hoje é vazio (zero linhas resolvidas em 12).
 */
export async function lerCartaMorta(
  admin: Cliente,
  organizationId: string,
  opcoes: { incluirResolvidas?: boolean; limite?: number } = {},
): Promise<LeituraDaCartaMorta> {
  const consulta = await admin
    .from("dead_letter_events")
    .select("id,topic,payload,error_message,attempts,resolved,resolved_at,resolved_by,outbox_event_id,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(opcoes.limite ?? 200);

  // "Não consegui ler a fila morta" NUNCA pode sair como "a fila morta está
  // vazia". Zero desenhado como saúde é o defeito que esta entrega combate.
  if (consulta.error) {
    return { ok: false, motivo: "leitura_falhou", detalhe: consulta.error.message };
  }

  const brutas = (consulta.data ?? []).filter((l) => opcoes.incluirResolvidas || !l.resolved);
  const agora = Date.now();

  const paraMedir = brutas
    .filter((l) => l.topic === "meta.conversion.send")
    .map((l) => ({ id: String(l.id), outboxEventId: l.outbox_event_id ? String(l.outbox_event_id) : null }));

  const precondicoes = paraMedir.length
    ? await medirPrecondicoesDaConversao(admin, organizationId, paraMedir)
    : new Map<string, Precondicao[]>();

  const linhas: CartaMortaDiagnosticada[] = brutas.map((bruta) => {
    const linha: LinhaDaCartaMorta = {
      id: String(bruta.id),
      topic: String(bruta.topic),
      errorMessage: String(bruta.error_message ?? ""),
      outboxEventId: bruta.outbox_event_id ? String(bruta.outbox_event_id) : null,
      attempts: Number(bruta.attempts ?? 0),
      createdAt: String(bruta.created_at),
    };
    return {
      id: linha.id,
      topico: linha.topic,
      criadaEm: linha.createdAt,
      idadeHoras: idadeEmHoras(linha.createdAt, agora),
      tentativas: linha.attempts,
      resolvida: bruta.resolved === true,
      resolvidaEm: bruta.resolved_at ? String(bruta.resolved_at) : null,
      resolvidaPor: bruta.resolved_by ? String(bruta.resolved_by) : null,
      veredito: vereditoDaCartaMorta(linha, precondicoes.get(linha.id) ?? []),
    };
  });

  const abertas = linhas.filter((l) => !l.resolvida);
  const operacionais = abertas.filter((l) => l.veredito.contagem === "operacional");
  const idades = operacionais.map((l) => l.idadeHoras).filter((h): h is number => h !== null);

  return {
    ok: true,
    linhas,
    contagem: {
      total: abertas.length,
      operacionais: operacionais.length,
      lixoDeTeste: abertas.filter((l) => l.veredito.contagem === "lixo_de_teste").length,
      reprocessaveis: operacionais.filter((l) => l.veredito.podeReprocessar).length,
      bloqueadas: operacionais.filter((l) => !l.veredito.podeReprocessar).length,
      maisAntigaHoras: idades.length ? Math.max(...idades) : null,
    },
  };
}

/** Reexportado para quem precisa do critério sem puxar o leitor de banco. */
export { ehProvaSintetica };
