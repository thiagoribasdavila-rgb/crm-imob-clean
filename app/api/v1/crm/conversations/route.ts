import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ponteConfigurada } from "@/lib/whatsapp/bridge-contract";
import { diagnosticarCanal, type FatosDoCanal } from "./diagnostico-do-canal";

export const dynamic = "force-dynamic";

/**
 * AS CONVERSAS QUE EXISTEM — e, quando não existe nenhuma, POR QUE.
 *
 * ── O que esta rota conserta ────────────────────────────────────────────────
 *
 * A tela `/conversations` lia `lead_events`, que é uma tabela MORTA (99 linhas
 * paradas; a fonte canônica de movimentação é `pipeline_stage_moves`). Ela
 * chamava aquilo de "conversa", inventava um canal a partir do texto do
 * `event_type` e mostrava o resultado como se fosse a caixa de entrada.
 *
 * As tabelas de verdade — `conversations` e `messages` — existem, têm o webhook
 * da Cloud API e a ponte do corretor escrevendo nelas, e ZERO linhas. A tela
 * nunca as leu. É o caso "construído e nunca ligado" outra vez, e desta vez o
 * que estava fora de alcance era a própria memória do CRM.
 *
 * ── A regra que esta rota nunca quebra ──────────────────────────────────────
 *
 * Falha de leitura NÃO vira lista vazia. Vira 503. "Não chegou mensagem" e "não
 * consegui olhar" mandam a pessoa fazer coisas opostas, e desenhar as duas como
 * um zero é o defeito que esta entrega existe para não repetir.
 *
 * ── O recorte por papel é aplicado aqui, em código ──────────────────────────
 *
 * Corretor vê as conversas atribuídas a ele MAIS as das leads da carteira dele.
 * Liderança vê a organização. O filtro por lead é feito em lotes de 100 ids
 * para não estourar o tamanho da URL do PostgREST — e é exato: nada é cortado
 * por ordenação, porque uma lista que se esvazia por causa do recorte é
 * indistinguível de uma lista que está realmente vazia.
 */

/** Teto de linhas devolvidas. Anunciado no corpo da resposta para a tela poder dizer que há mais. */
const TETO_DE_LINHAS = 200;

/** Tamanho do lote de ids por consulta `in()`. 100 uuids ≈ 3,7 KB de URL. */
const LOTE_DE_IDS = 100;

type LinhaDeConversa = {
  id: string;
  channel: string | null;
  status: string | null;
  unread_count: number | null;
  last_message_at: string | null;
  lead_id: string | null;
  customer_id: string | null;
  assigned_to: string | null;
  created_at: string | null;
};

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 120, windowMs: 60_000, scope: "crm.conversations" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!identity.ok) return identity.response;

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const perfilId = identity.access.profile.id;
  const lideranca = leLiderancaInteira(identity.access.profile);

  // ── 1. As conversas do recorte ────────────────────────────────────────────
  let conversas: LinhaDeConversa[] = [];

  if (lideranca) {
    const { data, error } = await admin
      .from("conversations")
      .select("id,channel,status,unread_count,last_message_at,lead_id,customer_id,assigned_to,created_at")
      .eq("organization_id", organizationId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(TETO_DE_LINHAS);
    if (error) {
      return apiError("CONVERSATIONS_READ_FAILED", "Não foi possível ler as conversas agora.", identity.meta, {
        status: 503,
        headers: rate.headers,
      });
    }
    conversas = (data ?? []) as LinhaDeConversa[];
  } else {
    // Corretor: as leads da carteira definem o alcance. Ler a carteira primeiro
    // é o que torna o filtro exato — o contrário seria pegar as 200 mais
    // recentes da organização e peneirar depois, que perde a conversa antiga de
    // uma lead minha assim que a organização ficar movimentada.
    const { data: minhasLeads, error: erroLeads } = await admin
      .from("leads")
      .select("id,assigned_to,assigned_user_id")
      .eq("organization_id", organizationId)
      .or(`assigned_user_id.eq.${perfilId},assigned_to.eq.${perfilId}`);
    if (erroLeads) {
      return apiError("CONVERSATIONS_SCOPE_FAILED", "Não foi possível confirmar a sua carteira agora.", identity.meta, {
        status: 503,
        headers: rate.headers,
      });
    }

    const idsDasMinhasLeads = (minhasLeads ?? []).map((lead) => lead.id as string);
    const colhidas = new Map<string, LinhaDeConversa>();

    const { data: atribuidas, error: erroAtribuidas } = await admin
      .from("conversations")
      .select("id,channel,status,unread_count,last_message_at,lead_id,customer_id,assigned_to,created_at")
      .eq("organization_id", organizationId)
      .eq("assigned_to", perfilId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(TETO_DE_LINHAS);
    if (erroAtribuidas) {
      return apiError("CONVERSATIONS_READ_FAILED", "Não foi possível ler as conversas agora.", identity.meta, {
        status: 503,
        headers: rate.headers,
      });
    }
    for (const linha of (atribuidas ?? []) as LinhaDeConversa[]) colhidas.set(linha.id, linha);

    for (const lote of emLotes(idsDasMinhasLeads, LOTE_DE_IDS)) {
      const { data: porLead, error: erroPorLead } = await admin
        .from("conversations")
        .select("id,channel,status,unread_count,last_message_at,lead_id,customer_id,assigned_to,created_at")
        .eq("organization_id", organizationId)
        .in("lead_id", lote)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(TETO_DE_LINHAS);
      if (erroPorLead) {
        return apiError("CONVERSATIONS_READ_FAILED", "Não foi possível ler as conversas agora.", identity.meta, {
          status: 503,
          headers: rate.headers,
        });
      }
      for (const linha of (porLead ?? []) as LinhaDeConversa[]) colhidas.set(linha.id, linha);
    }

    conversas = [...colhidas.values()]
      .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))
      .slice(0, TETO_DE_LINHAS);
  }

  // ── 2. Quantas mensagens sustentam essas conversas ────────────────────────
  const idsDasConversas = conversas.map((linha) => linha.id);
  let mensagens = 0;
  if (idsDasConversas.length) {
    for (const lote of emLotes(idsDasConversas, LOTE_DE_IDS)) {
      const { count, error } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("conversation_id", lote);
      if (error) {
        return apiError("MESSAGES_READ_FAILED", "Não foi possível contar as mensagens agora.", identity.meta, {
          status: 503,
          headers: rate.headers,
        });
      }
      mensagens += count ?? 0;
    }
  }

  // ── 3. Os fatos do canal — todos org-wide, todos rastreáveis a uma tabela ─
  const [numerosResultado, sessoesResultado, templatesResultado] = await Promise.all([
    admin
      .from("integrations")
      .select("id,external_account_id")
      .eq("organization_id", organizationId)
      .eq("provider", "whatsapp")
      .not("external_account_id", "is", null),
    admin
      .from("whatsapp_broker_sessions")
      .select("id,status")
      .eq("organization_id", organizationId),
    admin
      .from("message_templates")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "approved"),
  ]);

  if (numerosResultado.error || sessoesResultado.error || templatesResultado.error) {
    // O diagnóstico é a razão de ser desta tela. Entregá-lo pela metade seria
    // afirmar "o canal está desligado" sem ter conseguido olhar — exatamente o
    // erro que ele existe para impedir.
    return apiError("CHANNEL_DIAGNOSIS_FAILED", "Não foi possível verificar o estado do canal agora.", identity.meta, {
      status: 503,
      headers: rate.headers,
    });
  }

  const numeros = numerosResultado.data ?? [];
  const sessoes = sessoesResultado.data ?? [];

  const fatos: FatosDoCanal = {
    conversas: conversas.length,
    mensagens,
    // A consulta já filtra `provider='whatsapp'` e `external_account_id not null`
    // — a condição exata do webhook. A coluna `status` não entra: ver a nota em
    // `numerosOficiais` no módulo de diagnóstico.
    numerosOficiais: numeros.length,
    sessoesDeCorretorConectadas: sessoes.filter((linha) => String(linha.status ?? "").toLowerCase() === "conectado").length,
    // Só o booleano sai daqui. O segredo em si nunca atravessa a resposta.
    ponteConfigurada: ponteConfigurada(),
    templatesAprovados: templatesResultado.count ?? 0,
  };

  const diagnostico = diagnosticarCanal(fatos);

  // ── 4. Nomes para a lista, só quando há lista ─────────────────────────────
  const idsDeLead = [...new Set(conversas.map((linha) => linha.lead_id).filter(Boolean))] as string[];
  const idsDeDono = [...new Set(conversas.map((linha) => linha.assigned_to).filter(Boolean))] as string[];

  const leadPorId = new Map<string, { name: string | null; assigned_to: string | null; assigned_user_id: string | null }>();
  if (idsDeLead.length) {
    for (const lote of emLotes(idsDeLead, LOTE_DE_IDS)) {
      const { data, error } = await admin
        .from("leads")
        .select("id,name,assigned_to,assigned_user_id")
        .eq("organization_id", organizationId)
        .in("id", lote);
      if (error) {
        return apiError("CONVERSATIONS_ENRICH_FAILED", "Não foi possível identificar as leads das conversas.", identity.meta, {
          status: 503,
          headers: rate.headers,
        });
      }
      for (const lead of data ?? []) {
        leadPorId.set(lead.id as string, {
          name: (lead.name as string | null) ?? null,
          assigned_to: (lead.assigned_to as string | null) ?? null,
          assigned_user_id: (lead.assigned_user_id as string | null) ?? null,
        });
      }
    }
  }

  const nomePorPerfil = new Map<string, string>();
  const idsDePerfil = [...new Set([...idsDeDono, ...[...leadPorId.values()].flatMap((lead) => [lead.assigned_to, lead.assigned_user_id])].filter(Boolean))] as string[];
  if (idsDePerfil.length) {
    for (const lote of emLotes(idsDePerfil, LOTE_DE_IDS)) {
      const { data, error } = await admin.from("profiles").select("id,full_name,name").in("id", lote);
      if (error) {
        return apiError("CONVERSATIONS_ENRICH_FAILED", "Não foi possível identificar os responsáveis.", identity.meta, {
          status: 503,
          headers: rate.headers,
        });
      }
      for (const perfil of data ?? []) {
        const nome = (perfil.full_name as string | null) || (perfil.name as string | null);
        if (nome) nomePorPerfil.set(perfil.id as string, nome);
      }
    }
  }

  // A última mensagem de cada conversa — o que a lista mostra como prévia.
  const ultimaPorConversa = new Map<string, { conteudo: string | null; direcao: string | null; em: string | null }>();
  if (idsDasConversas.length) {
    for (const lote of emLotes(idsDasConversas, LOTE_DE_IDS)) {
      const { data, error } = await admin
        .from("messages")
        .select("conversation_id,content,direction,created_at")
        .eq("organization_id", organizationId)
        .in("conversation_id", lote)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        return apiError("MESSAGES_READ_FAILED", "Não foi possível ler as mensagens agora.", identity.meta, {
          status: 503,
          headers: rate.headers,
        });
      }
      // A consulta já vem da mais nova para a mais antiga: a PRIMEIRA que
      // aparece de cada conversa é a última mensagem dela.
      for (const mensagem of data ?? []) {
        const chave = mensagem.conversation_id as string;
        if (ultimaPorConversa.has(chave)) continue;
        ultimaPorConversa.set(chave, {
          conteudo: (mensagem.content as string | null) ?? null,
          direcao: (mensagem.direction as string | null) ?? null,
          em: (mensagem.created_at as string | null) ?? null,
        });
      }
    }
  }

  const lista = conversas.map((linha) => {
    const lead = linha.lead_id ? leadPorId.get(linha.lead_id) : undefined;
    const donoId = linha.assigned_to || lead?.assigned_user_id || lead?.assigned_to || null;
    const ultima = ultimaPorConversa.get(linha.id) ?? null;
    return {
      id: linha.id,
      canal: linha.channel ?? "desconhecido",
      status: linha.status ?? "desconhecido",
      naoLidas: linha.unread_count ?? 0,
      ultimaMensagemEm: linha.last_message_at,
      leadId: linha.lead_id,
      // Conversa sem lead vinculada é um estado REAL do webhook (telefone que
      // não bateu com nenhuma lead, ou bateu com duas). Ela não vira "contato
      // externo" inventado: fica sem nome, e a tela diz que está sem vínculo.
      leadNome: lead?.name ?? null,
      donoNome: donoId ? nomePorPerfil.get(donoId) ?? null : null,
      ultimaPreview: ultima?.conteudo ?? null,
      ultimaDirecao: ultima?.direcao ?? null,
    };
  });

  return apiSuccess(
    {
      escopo: lideranca ? "organizacao" : "carteira",
      // O teto é anunciado para a tela nunca dizer "são todas" sem saber.
      teto: TETO_DE_LINHAS,
      truncado: conversas.length >= TETO_DE_LINHAS,
      fatos,
      diagnostico,
      conversas: lista,
    },
    identity.meta,
    { headers: rate.headers },
  );
}
