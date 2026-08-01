/**
 * GÊMEO DIGITAL DA OPERAÇÃO — leitura do estado real + simulações (frente 6.4).
 *
 * A rota MEDE e delega. Toda decisão de cálculo vive em
 * `lib/atlas/gemeo-digital.ts`, que é puro e testável; aqui só se lê o banco e
 * se monta o estado. É de propósito: a regra que recusa projetar receita sem
 * baseline precisa ser executável por um contrato sem credencial nenhuma.
 *
 * ── CUSTO ───────────────────────────────────────────────────────────────────
 *
 * R$ 0. Nenhum serviço novo, nenhuma chamada de IA, nenhuma fila, nenhum banco
 * separado. São consultas de contagem no PostgreSQL que já existe. Para
 * desligar: remover esta rota.
 *
 * ── QUEM PODE LER ───────────────────────────────────────────────────────────
 *
 * Liderança apenas, e a regra vem de `leLiderancaInteira` — a UMA definição de
 * quem vê o funil inteiro. O gêmeo expõe a carteira de todos os corretores lado
 * a lado; para um corretor isso é a carteira dos colegas, exatamente o vazamento
 * que o piso de carteira existe para impedir. Escrever aqui um segundo critério
 * de papel seria criar a terceira cópia da regra.
 */

import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  contaComoAbertoNaRedistribuicao,
  gargalosDaOperacao,
  presenteParaReceberLead,
  simularAumentoDeLeads,
  simularMudancaDeSla,
  simularReducaoDaEquipe,
  simularRedistribuicao,
  type CarteiraObservada,
  type EstadoDaOperacao,
} from "@/lib/atlas/gemeo-digital";
import { leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export const dynamic = "force-dynamic";

/**
 * Colunas lidas dos leads. Sem nome, telefone, e-mail ou nota: o gêmeo AGREGA e
 * não tem uso para PII. `sale_value_brl` entra porque é o único lastro que
 * autoriza projeção comercial — e é justamente ele que está vazio.
 */
const LEAD_SELECT = "id,status,assigned_to,assigned_user_id,first_contacted_at,first_contact_due_at,sale_value_brl";

type LeadRow = {
  id: string;
  status: string | null;
  assigned_to: string | null;
  assigned_user_id: string | null;
  first_contacted_at: string | null;
  first_contact_due_at: string | null;
  sale_value_brl: number | string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  name: string | null;
  role: string | null;
  commercial_role: string | null;
  reports_to: string | null;
  max_active_leads: number | null;
};

const numero = (valor: unknown): number | null => {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
};

const instante = (valor: unknown): number | null => {
  if (typeof valor !== "string") return null;
  const marca = Date.parse(valor);
  return Number.isFinite(marca) ? marca : null;
};

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "atlas.gemeo-digital" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const perfil = identity.access.profile;
  if (!leLiderancaInteira({ commercialRole: perfil.commercialRole, role: perfil.role })) {
    return apiError(
      "GEMEO_SOMENTE_LIDERANCA",
      "O gêmeo digital mostra a carteira de toda a equipe — o acesso é da liderança. Sua carteira está em Meu dia.",
      identity.meta,
      { status: 403, headers: rate.headers },
    );
  }

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;

  const [perfisResultado, leadsResultado, tetosResultado, presencaResultado] = await Promise.all([
    admin
      .from("profiles")
      .select("id,full_name,name,role,commercial_role,reports_to,max_active_leads")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .limit(2000),
    // Paginado: `.limit()` do PostgREST é corte silencioso, e contagem sobre
    // página cortada mente. O gêmeo inteiro é contagem.
    fetchAllRows<LeadRow>((de, ate) =>
      admin
        .from("leads")
        .select(LEAD_SELECT)
        .eq("organization_id", organizationId)
        .order("id", { ascending: true })
        .range(de, ate),
    ),
    admin.from("broker_capacity_limits").select("profile_id,max_active_leads").eq("organization_id", organizationId).limit(2000),
    admin.from("commercial_presence").select("profile_id,availability,last_seen_at").eq("organization_id", organizationId).limit(2000),
  ]);

  if (perfisResultado.error || leadsResultado.error) {
    return apiError("GEMEO_LEITURA_FALHOU", "Não foi possível medir a operação agora.", identity.meta, {
      status: 503,
      headers: rate.headers,
    });
  }

  const perfis = (perfisResultado.data ?? []) as ProfileRow[];
  const leads = leadsResultado.rows;

  /**
   * Tetos APLICADOS. `broker_capacity_limits` vazia não é erro e não é zero: é a
   * ausência de configuração, e o mapa vazio faz `tetoAplicado` sair `null` — que
   * é o que a simulação precisa para dizer que a trava do banco não confere nada.
   * Falha de leitura desta tabela também vira mapa vazio, e isso está declarado
   * na cobertura da fonte abaixo em vez de virar um teto inventado.
   */
  const tetosAplicados = new Map<string, number>();
  for (const linha of tetosResultado.data ?? []) {
    const valor = numero((linha as { max_active_leads?: unknown }).max_active_leads);
    const id = String((linha as { profile_id?: unknown }).profile_id ?? "");
    if (id && valor !== null) tetosAplicados.set(id, valor);
  }

  const presencas = new Map<string, { disponivel: boolean; vistaEmMs: number | null }>();
  for (const linha of presencaResultado.data ?? []) {
    const id = String((linha as { profile_id?: unknown }).profile_id ?? "");
    if (!id) continue;
    presencas.set(id, {
      disponivel: String((linha as { availability?: unknown }).availability ?? "").toLowerCase() === "available",
      vistaEmMs: instante((linha as { last_seen_at?: unknown }).last_seen_at),
    });
  }

  const corretores = perfis.filter((p) => String(p.commercial_role || p.role || "").toLowerCase() === "broker");

  const abertos = leads.filter((lead) => contaComoAbertoNaRedistribuicao(lead.status));
  const agoraMs = Date.now();

  const daPessoa = (lead: LeadRow, id: string) => lead.assigned_to === id || lead.assigned_user_id === id;

  const carteiras: CarteiraObservada[] = corretores.map((p) => {
    const meus = abertos.filter((lead) => daPessoa(lead, p.id));
    const presenca = presencas.get(p.id) ?? null;
    return {
      id: p.id,
      // Rótulo de exibição. Sem e-mail: o cadastro usa e-mail como nome em
      // várias linhas, e e-mail é PII que este painel não precisa.
      nome: p.full_name || p.name || `Corretor ${p.id.slice(0, 8)}`,
      abertos: meus.length,
      esperandoPrimeiroContato: meus.filter((lead) => !lead.first_contacted_at).length,
      tetoExibido: numero(p.max_active_leads),
      tetoAplicado: tetosAplicados.get(p.id) ?? null,
      presencaVistaEmMs: presenca?.vistaEmMs ?? null,
      presencaDisponivel: presenca?.disponivel ?? false,
      gerenteId: p.reports_to,
    };
  });

  const vendasApuradas = leads.filter((lead) => {
    const valor = numero(lead.sale_value_brl);
    return valor !== null && valor > 0;
  });
  const receitaApurada = vendasApuradas.reduce((soma, lead) => soma + (numero(lead.sale_value_brl) ?? 0), 0);
  const ganhosRegistrados = leads.filter((lead) => {
    const etapa = String(lead.status ?? "").trim().toLowerCase();
    return etapa === "ganho" || etapa === "won" || etapa === "vendido";
  }).length;

  const coberturas: string[] = [
    `${leads.length} lead(s) da organização; carteira contada pela régua da RPC de redistribuição`,
  ];
  if (tetosResultado.error) {
    coberturas.push("tetos aplicados NÃO lidos (falha na consulta) — tratados como não configurados, não como ausentes");
  }
  if (presencaResultado.error) {
    coberturas.push("presença comercial NÃO lida (falha na consulta) — tratada como ausente, o que fecha a porta da redistribuição por precaução");
  }

  const estado: EstadoDaOperacao = {
    medidoEm: new Date(agoraMs).toISOString(),
    leadsAbertos: abertos.length,
    esperandoPrimeiroContato: abertos.filter((lead) => !lead.first_contacted_at).length,
    prazoDePrimeiroContatoVencido: abertos.filter((lead) => {
      if (lead.first_contacted_at) return false;
      const prazo = instante(lead.first_contact_due_at);
      return prazo !== null && prazo < agoraMs;
    }).length,
    carteiras,
    lastro: {
      ganhosRegistrados,
      vendasComValorApurado: vendasApuradas.length,
      // 0 vendas apuradas significa que não há soma para medir — `null` diz
      // isso, enquanto 0 diria "somei e deu zero real".
      receitaApuradaBrl: vendasApuradas.length > 0 ? receitaApurada : null,
      leadsConsiderados: leads.length,
    },
    coberturaDaFonte: coberturas.join("; "),
  };

  const url = new URL(request.url);
  const leadsNovos = Math.max(0, Math.min(10_000, Number(url.searchParams.get("leads_novos") ?? 100) || 0));
  const pessoasQueSaem = Math.max(0, Math.min(100, Number(url.searchParams.get("pessoas_que_saem") ?? 1) || 0));
  const novoSla = Math.max(1, Math.min(10_080, Number(url.searchParams.get("sla_minutos") ?? 15) || 15));

  return apiSuccess(
    {
      estado: {
        medidoEm: estado.medidoEm,
        leadsAbertos: estado.leadsAbertos,
        esperandoPrimeiroContato: estado.esperandoPrimeiroContato,
        prazoDePrimeiroContatoVencido: estado.prazoDePrimeiroContatoVencido,
        corretoresAtivos: carteiras.length,
        corretoresComCarteiraVazia: carteiras.filter((c) => c.abertos === 0).length,
        coberturaDaFonte: estado.coberturaDaFonte,
        lastroComercial: estado.lastro,
        carteiras: carteiras.map((c) => ({
          nome: c.nome,
          abertos: c.abertos,
          esperandoPrimeiroContato: c.esperandoPrimeiroContato,
          tetoExibido: c.tetoExibido,
          tetoAplicado: c.tetoAplicado,
          /**
           * A presença que IMPORTA: disponível E vista dentro da janela que a
           * RPC exige.
           *
           * Publicar `presencaDisponivel` cru aqui foi um defeito real desta
           * rota, pego ao rodar a leitura contra a base viva: `availability` é
           * 'available' em linhas cujo `last_seen_at` é de cinco dias antes, e o
           * payload dizia "presente: true" para quem o INNER JOIN do banco já
           * descarta. Era a doença desta entrega dentro da própria entrega —
           * "não sei quando" publicado como "agora".
           *
           * A decisão vem de `presenteParaReceberLead` — a MESMA função que as
           * portas da redistribuição usam. A primeira versão desta linha
           * reimplementou a comparação aqui, e duas cópias da mesma regra é a
           * divergência que este repositório já pagou várias vezes.
           */
          presenteNaJanela: presenteParaReceberLead(c, agoraMs),
        })),
      },
      gargalos: gargalosDaOperacao(estado),
      simulacoes: [
        simularRedistribuicao(estado, {}, agoraMs),
        simularAumentoDeLeads(estado, leadsNovos, agoraMs),
        simularReducaoDaEquipe(estado, pessoasQueSaem, agoraMs),
        simularMudancaDeSla(estado, novoSla, agoraMs),
      ],
    },
    identity.meta,
    { headers: rate.headers },
  );
}
