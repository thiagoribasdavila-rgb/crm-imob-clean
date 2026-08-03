import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { medirContagem, type Medida } from "@/lib/ai/prontidao-para-ligar";
import { HOT_SCORE_THRESHOLD, WARM_SCORE_THRESHOLD } from "@/lib/atlas/temperatura-do-lead";
import { AGENTES_QUE_ESPERAM_PESSOA } from "@/lib/ai/quem-espera-uma-pessoa";
import { estaEmJogo, forasDoJogoParaPostgrest, LEGENDA_DO_RECORTE } from "@/lib/crm/recorte-operacional";
import { INTENCOES, resolverPergunta, type Intencao } from "@/lib/atlas/perguntas-da-sala";

/**
 * OS CARTÕES DA SALA DE COMANDO — nascem respondidos.
 *
 * ── A direção, e o risco que ela carrega ───────────────────────────────────
 *
 * A Sala de Comando segue o v3: "a IA é a interface". A pessoa escreve o que
 * quer saber e a tela responde em cartões. O risco anotado antes de começar é
 * que a IA hoje NÃO É MEDIDA em acerto de intenção — e o erro dela aqui é
 * silencioso: vem um cartão plausível sobre outra pergunta.
 *
 * Por isso esta rota NÃO gera nada. Ela responde o catálogo declarado em
 * `lib/atlas/perguntas-da-sala.ts`, que já foi commitado com contrato. Sem
 * pergunta, devolve o conjunto inicial JÁ RESPONDIDO — a tela nunca nasce em
 * branco esperando alguém adivinhar o que digitar.
 *
 * ── O recorte é dito em cada número ────────────────────────────────────────
 *
 * MEDIDO: 490 leads, 419 em `perdido`. "Sem primeiro contato" dá 463 na base
 * inteira e 50 em jogo — NOVE VEZES de diferença. Um cartão que diga 463 e leve
 * a uma lista que mostra 50 não exibe um número velho: exibe outra pergunta.
 *
 * O recorte vem de `lib/crm/recorte-operacional.ts`, o mesmo que a rota de
 * leads usa, e cada cartão devolve `recorte` para a tela poder DIZER qual usou.
 *
 * ── Zero fabricado por falha é o defeito mais caro aqui ────────────────────
 *
 * Com nove cartões, a tentação é `data?.length ?? 0`. `medirContagem` (de
 * `lib/ai/prontidao-para-ligar.ts`) devolve `valor: null` quando a leitura
 * falha, e a tela desenha "não consegui ler" em vez de zero. Zero é afirmação
 * sobre o mundo; null é afirmação sobre a leitura.
 */

export const dynamic = "force-dynamic";

const PAPEIS_QUE_LEEM = ["admin", "director", "superintendent", "manager"] as const;

type Cartao = {
  id: string;
  titulo: string;
  responde: string;
  acoes: Intencao["acoes"];
  medida: Medida;
  /** Qual pergunta este número responde — em jogo ou base inteira. */
  recorte: string;
  /** Segundo número, quando ele muda a leitura do primeiro. */
  contexto?: { rotulo: string; valor: number | null } | null;
};

export async function GET(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "atlas.sala.cartoes" });
  if (!limite.ok) return limite.response;

  const acesso = await requireAccessContext(request, { roles: [...PAPEIS_QUE_LEEM] });
  if (!acesso.ok) return acesso.response;

  const admin = getSupabaseAdmin();
  const org = acesso.access.organization.id;
  const foraDoJogo = forasDoJogoParaPostgrest();

  const leads = () => admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", org);
  const emJogo = () => leads().not("status", "in", foraDoJogo);

  const [
    perdidasSemContato,
    semContatoEmJogo,
    semContatoNaBase,
    mornasSemContato,
    mornas,
    quentes,
    decisoes,
    criativos,
  ] = await Promise.all([
    // A base ARQUIVADA: aqui o recorte "em jogo" não se aplica — a pergunta é
    // justamente sobre quem já foi encerrado sem ninguém ter falado.
    leads().eq("status", "perdido").is("first_contacted_at", null),
    emJogo().is("first_contacted_at", null),
    leads().is("first_contacted_at", null),
    emJogo().is("first_contacted_at", null).gte("score_ia", WARM_SCORE_THRESHOLD).lt("score_ia", HOT_SCORE_THRESHOLD),
    // `.not(temperature, ilike, quente)` impede a MESMA lead aparecer em dois
    // cartões: medido, 3 leads têm temperature='quente' com score_ia 45–50,
    // dentro da faixa morna.
    emJogo().gte("score_ia", WARM_SCORE_THRESHOLD).lt("score_ia", HOT_SCORE_THRESHOLD).not("temperature", "ilike", "quente"),
    emJogo().or(`temperature.ilike.quente,score_ia.gte.${HOT_SCORE_THRESHOLD}`),
    admin
      .from("ai_shadow_decisions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .is("decisao_humana", null)
      .eq("retido", true)
      .in("agent", [...AGENTES_QUE_ESPERAM_PESSOA]),
    admin
      .from("approval_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("status", "pending")
      .eq("entity_type", "meta_campaign"),
  ]);

  const doCatalogo = (id: string) => INTENCOES.find((i) => i.id === id);

  const monta = (id: string, resposta: unknown, comoFoiMedido: string, oQue: string, recorte: string, contexto?: Cartao["contexto"]): Cartao | null => {
    const intencao = doCatalogo(id);
    if (!intencao) return null;
    return {
      id,
      titulo: intencao.titulo,
      responde: intencao.responde,
      acoes: intencao.acoes,
      medida: medirContagem(resposta as { count?: number | null; error?: unknown }, comoFoiMedido, oQue),
      recorte,
      contexto: contexto ?? null,
    };
  };

  const cartoes = [
    monta(
      "perdidas-sem-contato",
      perdidasSemContato,
      "leads com status 'perdido' e first_contacted_at nulo",
      "as perdidas que ninguém contatou",
      LEGENDA_DO_RECORTE.base_inteira,
    ),
    monta(
      "sem-primeiro-contato",
      semContatoEmJogo,
      "leads em jogo com first_contacted_at nulo",
      "as leads sem primeiro contato",
      LEGENDA_DO_RECORTE.em_jogo,
      { rotulo: "na base inteira", valor: typeof semContatoNaBase?.count === "number" ? semContatoNaBase.count : null },
    ),
    monta("mornas-sem-contato", mornasSemContato, `leads em jogo, score_ia entre ${WARM_SCORE_THRESHOLD} e ${HOT_SCORE_THRESHOLD - 1}, sem primeiro contato`, "as mornas sem contato", LEGENDA_DO_RECORTE.em_jogo),
    monta("mornas", mornas, `leads em jogo com score_ia entre ${WARM_SCORE_THRESHOLD} e ${HOT_SCORE_THRESHOLD - 1}, sem as declaradas quentes`, "as leads mornas", LEGENDA_DO_RECORTE.em_jogo),
    monta("quentes", quentes, `leads em jogo com temperature 'quente' OU score_ia >= ${HOT_SCORE_THRESHOLD}`, "as leads quentes", LEGENDA_DO_RECORTE.em_jogo),
    monta("decisoes-pendentes", decisoes, "ai_shadow_decisions retidas, sem decisão humana, dos agentes que esperam uma pessoa", "as decisões pendentes", LEGENDA_DO_RECORTE.em_jogo),
    monta("criativos-esperando", criativos, "approval_requests pendentes do tipo meta_campaign", "os criativos esperando aprovação", LEGENDA_DO_RECORTE.em_jogo),
  ].filter((c): c is Cartao => c !== null);

  // Se NENHUM cartão foi medido, a leitura caiu inteira — e isso é 503, não uma
  // tela de zeros. Fila vazia é tranquilidade, e tranquilidade não pode ser
  // fabricada por falha de banco.
  if (cartoes.length > 0 && cartoes.every((c) => c.medida.valor === null)) {
    return apiError("SALA_LEITURA_FALHOU", "Não foi possível ler os indicadores agora.", acesso.meta, {
      status: 503,
      headers: limite.headers,
    });
  }

  /**
   * ── O PAINEL: KPIs, FUNIL, SÉRIE E EQUIPE ─────────────────────────────────
   *
   * Uma leitura só de `leads` alimenta os quatro blocos. São 490 linhas hoje e
   * o teto explícito é 1000 — o PostgREST corta em 1000 EM SILÊNCIO, e é por
   * isso que o corte vai declarado: quando a base passar disso, a resposta diz
   * `amostraTruncada` em vez de mentir uma soma parcial.
   */
  const TETO = 1000;
  const desde30 = new Date(Date.now() - 30 * 86_400_000);
  const { data: linhas, error: erroLinhas } = await admin
    .from("leads")
    .select("id,status,score_ia,created_at,first_contacted_at,assigned_to,sale_value_brl")
    .eq("organization_id", org)
    .limit(TETO);

  const base = erroLinhas ? [] : (linhas ?? []);
  const vivo = (s: unknown) => estaEmJogo(s);
  const ehStatus = (l: (typeof base)[number], ...quais: string[]) =>
    quais.some((q) => String(l.status ?? "").toLowerCase() === q);

  const porDia = new Map<string, { criadas: number; contatadas: number }>();
  for (const l of base) {
    const criadaEm = l.created_at ? new Date(String(l.created_at)) : null;
    if (criadaEm && criadaEm >= desde30) {
      const dia = criadaEm.toISOString().slice(0, 10);
      const atual = porDia.get(dia) ?? { criadas: 0, contatadas: 0 };
      atual.criadas += 1;
      if (l.first_contacted_at) atual.contatadas += 1;
      porDia.set(dia, atual);
    }
  }

  const porCorretor = new Map<string, { leads: number; ativos: number; vendas: number; vgv: number }>();
  for (const l of base) {
    const dono = l.assigned_to ? String(l.assigned_to) : null;
    if (!dono) continue;
    const atual = porCorretor.get(dono) ?? { leads: 0, ativos: 0, vendas: 0, vgv: 0 };
    atual.leads += 1;
    if (vivo(l.status)) atual.ativos += 1;
    if (ehStatus(l, "ganho")) { atual.vendas += 1; atual.vgv += Number(l.sale_value_brl ?? 0); }
    porCorretor.set(dono, atual);
  }

  const nomes = new Map<string, string>();
  if (porCorretor.size) {
    const { data: perfis } = await admin
      .from("profiles")
      .select("id,full_name,name")
      .in("id", [...porCorretor.keys()]);
    for (const p of perfis ?? []) {
      // full_name primeiro: `name` é NULO em 5 dos 6 perfis ativos.
      nomes.set(String(p.id), String(p.full_name || p.name || "Sem nome cadastrado"));
    }
  }

  const painel = erroLinhas
    ? null
    : {
        amostraTruncada: base.length >= TETO,
        kpis: {
          leadsNaBase: base.length,
          leadsAtivos: base.filter((l) => vivo(l.status)).length,
          emAtendimento: base.filter((l) => ehStatus(l, "contato", "qualificacao")).length,
          negociacao: base.filter((l) => ehStatus(l, "proposta", "contrato", "negociacao")).length,
          vendas: base.filter((l) => ehStatus(l, "ganho")).length,
          vgvFechado: base.filter((l) => ehStatus(l, "ganho")).reduce((s, l) => s + Number(l.sale_value_brl ?? 0), 0),
        },
        funil: [
          { etapa: "Leads na base", valor: base.length },
          { etapa: "Leads ativos", valor: base.filter((l) => vivo(l.status)).length },
          { etapa: "Em atendimento", valor: base.filter((l) => ehStatus(l, "contato", "qualificacao")).length },
          { etapa: "Negociação", valor: base.filter((l) => ehStatus(l, "proposta", "contrato", "negociacao")).length },
          { etapa: "Fechadas", valor: base.filter((l) => ehStatus(l, "ganho")).length },
        ],
        serie: [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, v]) => ({ dia, ...v })),
        equipe: [...porCorretor.entries()]
          .map(([id, v]) => ({ id, nome: nomes.get(id) ?? "Sem nome cadastrado", ...v }))
          .sort((a, b) => b.leads - a.leads)
          .slice(0, 8),
      };

  return apiSuccess(
    {
      cartoes,
      painel,
      // Leitura falha NÃO vira painel de zeros: `null` diz que não foi medido.
      painelIndisponivel: erroLinhas ? "não foi possível ler as leads agora" : null,
      // O catálogo inteiro vai junto: é o que a tela oferece quando não entende
      // a pergunta, em vez de devolver o cartão mais parecido.
      perguntasQueSeiResponder: INTENCOES.map((i) => ({ id: i.id, titulo: i.titulo, responde: i.responde })),
      medidoEm: new Date().toISOString(),
    },
    acesso.meta,
    { headers: limite.headers },
  );
}

/**
 * A PERGUNTA DIGITADA — resolve pelo catálogo, nunca por aproximação.
 *
 * Três desfechos honestos: entendi (com as vizinhas, para corrigir num clique),
 * ambígua (duas igualmente específicas — quem escolhe é a pessoa) e não entendi
 * (com o que existe). O terceiro é o que impede o defeito desta direção: um
 * cartão plausível sobre a pergunta errada.
 */
export async function POST(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "atlas.sala.perguntar" });
  if (!limite.ok) return limite.response;

  const acesso = await requireAccessContext(request, { roles: [...PAPEIS_QUE_LEEM] });
  if (!acesso.ok) return acesso.response;

  const corpo = (await request.json().catch(() => null)) as { pergunta?: unknown } | null;
  const pergunta = typeof corpo?.pergunta === "string" ? corpo.pergunta.slice(0, 300) : "";

  const resposta = resolverPergunta(pergunta);
  return apiSuccess({ pergunta, resposta }, acesso.meta, { headers: limite.headers });
}
