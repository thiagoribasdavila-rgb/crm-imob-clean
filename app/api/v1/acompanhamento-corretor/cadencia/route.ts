import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { canonicalPipelineStage, DEFAULT_PIPELINE_STAGES } from "@/lib/atlas/pipeline-stages";
import {
  cadenciaDaBase,
  concentracaoDoLedger,
  toquesAteAvancar,
  veredictoDaConversao,
  volumePorPessoa,
  type Movimento,
} from "@/lib/crm/cadencia-do-atendimento";
import { EVENTOS_DE_TENTATIVA } from "@/lib/crm/contact-attempts";
import { leSoAPropriaCarteira } from "@/lib/crm/escopo-de-leitura";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * CADÊNCIA E VOLUME DE TRABALHO — e o que ainda não dá para afirmar.
 *
 * O dono pediu volume de trabalho e efetividade de conversão. Esta rota entrega
 * o volume (que tem centenas de eventos), entrega a cadência COM o tamanho da
 * amostra colado, e se recusa a entregar taxa de conversão por pessoa.
 *
 * A conta inteira mora em `lib/crm/cadencia-do-atendimento.ts` e é coberta por
 * `tests/contracts/cadencia-do-atendimento.test.mjs`. Aqui só há leitura do
 * banco e recorte de escopo — decisão nenhuma, para não existirem duas contas.
 *
 * ── POR QUE A JANELA NÃO VALE PARA A VENDA ──────────────────────────────────
 *
 * Movimento é abundante (478 em 7 dias) e cabe numa janela. Venda são DUAS na
 * base inteira. Recortar venda por janela produziria "nenhuma venda no período"
 * — verdadeiro e inútil. As duas fontes de venda são lidas SEM janela, e o
 * veredicto diz explicitamente que olha a base toda.
 */

const POSICAO_DA_ETAPA = new Map(DEFAULT_PIPELINE_STAGES.map((etapa) => [etapa.key, etapa.position]));
const DESFECHO_DA_ETAPA = new Map(DEFAULT_PIPELINE_STAGES.map((etapa) => [etapa.key, etapa.outcome]));

/**
 * Avanço = subiu de posição no catálogo e continua vivo (ou ganhou).
 *
 * Sai do catálogo, não de uma lista digitada: etapa nova passa a ser
 * classificada sozinha, sem uma segunda cópia do vocabulário para divergir.
 */
function avancouDeEtapa(de: string | null, para: string | null): boolean {
  const origem = canonicalPipelineStage(de);
  const destino = canonicalPipelineStage(para);
  if (!origem || !destino) return false;
  const desfecho = DESFECHO_DA_ETAPA.get(destino);
  if (desfecho !== "open" && desfecho !== "won") return false;
  return (POSICAO_DA_ETAPA.get(destino) ?? 0) > (POSICAO_DA_ETAPA.get(origem) ?? 0);
}

function clampDias(valor: string | null): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 30;
  return Math.min(180, Math.max(7, Math.round(numero)));
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 45, windowMs: 60_000, scope: "acompanhamento.cadencia" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!identity.ok) return identity.response;

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const perfilAtual = { commercialRole: identity.access.profile.commercialRole, role: identity.access.profile.role };
  const soAPropriaCarteira = leSoAPropriaCarteira(perfilAtual);
  const dias = clampDias(request.nextUrl.searchParams.get("dias"));
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  const [movimentosResult, perfisResult, ganhoPorStatus, ganhoPorLedger, primeiroDoLedger, contatosResult] = await Promise.all([
    admin
      .from("pipeline_stage_moves")
      .select("id,lead_id,actor_id,from_stage,to_stage,reversal_of,occurred_at")
      .eq("organization_id", organizationId)
      .gte("occurred_at", desde)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(5000),
    admin.from("profiles").select("id,name,full_name,role,commercial_role").eq("organization_id", organizationId).limit(1000),
    admin.from("leads").select("id").eq("organization_id", organizationId).eq("status", "ganho").limit(2000),
    admin.from("pipeline_stage_moves").select("lead_id").eq("organization_id", organizationId).eq("to_stage", "ganho").limit(2000),
    admin
      .from("pipeline_stage_moves")
      .select("occurred_at")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    /* Contato REGISTRADO — medido, nunca constante, e na tabela ONDE ELE MORA.
       ── A TABELA CERTA, MEDIDA EM 2026-08-02 ──────────────────────────────
       Esta consulta já apontou para `activities` e devolvia 0 — não porque não
       houvesse contato, mas porque contato não é escrito lá. As 481 linhas de
       `activities` são todas `pipeline_stage_changed`; o registro de contato do
       CRM passa por `recordLiveLeadEvent`, que grava em `lead_events` com
       `event_type` = canal. Medido no banco vivo na mesma data:
         lead_events.event_type = 'call' ....... 36
         lead_events.event_type = 'whatsapp' ... 14
       Ou seja: 50 contatos registrados desde 27/07, enquanto a tela anunciava
       "nenhuma ligação, WhatsApp ou e-mail deixa rastro no CRM até hoje".
       Vocabulário certo apontado para a tabela errada é a classe de defeito que
       mais custou a este repositório — e `EVENTOS_DE_TENTATIVA` vem de
       `lib/crm/contact-attempts.ts`, que lê exatamente `lead_events.event_type`.
       O vocabulário e a fonte agora vêm do mesmo lugar.

       SEM filtro de data, de propósito. A pergunta aqui é "já existe rastro de
       contato neste CRM?", não "quantos nesta janela" — e um recorte por data
       descartaria em silêncio toda linha sem carimbo, prendendo o contador em 0
       para sempre. */
    admin
      .from("lead_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("event_type", [...EVENTOS_DE_TENTATIVA]),
  ]);

  if (movimentosResult.error || perfisResult.error) {
    return apiError("CADENCIA_INDISPONIVEL", "Não foi possível ler a cadência do atendimento agora.", identity.meta, {
      status: 503,
      headers: rate.headers,
    });
  }

  const todos = (movimentosResult.data ?? []) as Movimento[];
  // O recorte de carteira acontece ANTES da conta: um corretor não pode ver a
  // movimentação de colega, e a mediana da base inteira também não é dele.
  const movimentos = soAPropriaCarteira
    ? todos.filter((linha) => String(linha.actor_id || "") === identity.access.profile.id)
    : todos;

  const perfis = new Map(
    (perfisResult.data ?? []).map((linha) => [
      String(linha.id),
      {
        nome: String(linha.full_name || linha.name || "Usuário Atlas"),
        papel: String(linha.commercial_role || linha.role || "broker"),
      },
    ]),
  );

  const volumes = volumePorPessoa(movimentos);
  const cadencia = cadenciaDaBase(movimentos);
  const concentracao = concentracaoDoLedger(volumes);
  const toquesParaAvancar = toquesAteAvancar(movimentos, avancouDeEtapa);

  /* As duas fontes de venda só podem ser confrontadas por quem enxerga a
     organização. No escopo de carteira o confronto sairia distorcido (uma das
     listas é por dono da lead, a outra por autor do movimento), e distorção
     silenciosa é pior que ausência declarada. */
  const vendaMensuravel = !soAPropriaCarteira && !ganhoPorStatus.error && !ganhoPorLedger.error;
  const conversao = vendaMensuravel
    ? veredictoDaConversao({
        porStatus: ((ganhoPorStatus.data ?? []) as Array<{ id: string }>).map((linha) => String(linha.id)),
        porLedger: ((ganhoPorLedger.data ?? []) as Array<{ lead_id: string | null }>)
          .map((linha) => String(linha.lead_id || ""))
          .filter(Boolean),
      })
    : null;

  return apiSuccess(
    {
      escopo: soAPropriaCarteira ? "carteira" : "organizacao",
      dias,
      desde,
      ledgerDesde: primeiroDoLedger.data?.occurred_at ?? null,
      cadencia,
      toquesParaAvancar,
      concentracao,
      // `null` quer dizer "não confrontei", e a tela precisa dizer isso em vez
      // de desenhar ausência de venda.
      conversao,
      vendaMensuravel,
      pessoas: volumes.map((pessoa) => ({
        ...pessoa,
        nome: perfis.get(pessoa.id)?.nome ?? "Pessoa fora do seu escopo",
        papel: perfis.get(pessoa.id)?.papel ?? "desconhecido",
      })),
      /* O buraco que esta tela existe para tornar visível: hoje nenhuma ligação,
         WhatsApp ou e-mail deixa rastro. Sem isto na resposta, a tela
         apresentaria movimentação de funil como se fosse contato.

         `null` quando a leitura falhou — a tela precisa poder calar em vez de
         afirmar "ninguém registra contato" por causa de um erro de consulta. */
      contatosRegistrados: contatosResult.error ? null : (contatosResult.count ?? 0),
      contatoRegistrado: contatosResult.error ? null : (contatosResult.count ?? 0) > 0,
      medidoEm: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
