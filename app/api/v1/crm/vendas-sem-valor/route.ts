import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { estaNaMinhaCarteira, leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";
import {
  avaliarCobrancaDeValor,
  valorDaVendaAceitavel,
  DIAS_PARA_COBRANCA_CRITICA,
} from "@/lib/crm/venda-sem-valor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * VENDA FECHADA E VALOR NÃO INFORMADO.
 *
 * ── POR QUE ESTA ROTA EXISTE ────────────────────────────────────────────────
 *
 * Fechar a venda não exige o valor, e isso está certo: o corretor fecha em pé, na
 * obra, e nem sempre sabe o número final na hora. Travar o "ganho" faria ele
 * deixar a lead em "proposta" — e o sistema perderia o DESFECHO, não só o número.
 *
 * Só que nada cobrava depois. MEDIDO em 2026-07-30: 1 lead em `status='ganho'` com
 * `sale_value_brl` nulo, parada em silêncio, e no painel ela aparece verdinha e
 * resolvida. Uma linha assim quebra quatro coisas de uma vez: VGV zerado, ROI não
 * calculável, nenhum baseline para previsão, e o evento `Purchase` nunca sai para
 * a Meta — `lib/integrations/meta/capi-feedback.ts` recusa emitir Purchase sem
 * valor de propósito, porque "Purchase sem value ensina a coisa errada".
 *
 * Então esta rota é a cobrança: lista o que está devendo, com a idade da
 * pendência, e aceita o valor quando ele chegar. A partir daí o ciclo fecha
 * sozinho — a CAPI já sabe o que fazer com `sale_value_brl` preenchido.
 *
 * ── O RECORTE POR PAPEL É APLICADO AQUI, EM CÓDIGO ──────────────────────────
 *
 * Corretor vê e informa o valor das vendas DELE. Liderança vê as da organização,
 * porque é quem responde pelo resultado e é quem vai atrás de quem não informou.
 *
 * A leitura usa service_role e filtra explicitamente pela régua de
 * `lib/crm/escopo-de-leitura.ts`, em vez de delegar a fronteira ao RLS. Não é
 * atalho: em 2026-07-29 foi medido que as policies permissivas de `leads` se
 * somavam por OR e a de organização engolia as comerciais — quem delegou a
 * fronteira ao RLS vazou carteira. O piso vem do módulo compartilhado.
 */

const SELECT_DA_VENDA =
  "id,name,phone,status,sale_value_brl,sale_value_recorded_at,updated_at,assigned_to,assigned_user_id,development_id";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "crm.vendas-sem-valor.read" });
  if (!rate.ok) return rate.response;

  const acesso = await requireAccessContext(request);
  if (!acesso.ok) return acesso.response;

  const admin = getSupabaseAdmin();
  const organizationId = acesso.access.organization.id;
  const lideranca = leLiderancaInteira(acesso.access.profile);

  const { data, error } = await admin
    .from("leads")
    .select(SELECT_DA_VENDA)
    .eq("organization_id", organizationId)
    .in("status", ["ganho", "won", "vendido"]);

  // Falha de leitura NÃO pode virar "nenhuma venda pendente". Zero silencioso aqui
  // faria o diretor concluir que está tudo informado — o modo de falha que esta
  // base já pagou várias vezes: ausência não declarada é indistinguível de zero.
  if (error) {
    return apiError("VENDAS_SEM_VALOR_INDISPONIVEL", "Não foi possível apurar as vendas pendentes.", acesso.meta, {
      status: 503,
      headers: rate.headers,
    });
  }

  const agora = Date.now();
  const minhas = (data ?? []).filter(
    (lead) =>
      lideranca ||
      estaNaMinhaCarteira(acesso.access.profile.id, lead) ||
      estaNaMinhaCarteira(acesso.access.user.id, lead),
  );

  const pendentes = minhas
    .map((lead) => ({ lead, cobranca: avaliarCobrancaDeValor(lead, agora) }))
    .filter((linha) => linha.cobranca !== null)
    .map(({ lead, cobranca }) => ({
      id: lead.id,
      nome: lead.name,
      dias: cobranca!.dias,
      critico: cobranca!.critico,
      consequencia: cobranca!.consequencia,
    }))
    // Mais antigas primeiro: quem espera há mais tempo é quem tem menos chance de
    // alguém ainda lembrar do número.
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));

  return apiSuccess(
    {
      pendentes,
      total: pendentes.length,
      criticas: pendentes.filter((p) => p.critico).length,
      diasParaCritico: DIAS_PARA_COBRANCA_CRITICA,
      escopo: lideranca ? "organizacao" : "carteira",
      // O total de vendas fechadas viaja junto para a tela poder dizer "3 de 5
      // informadas" em vez de só mostrar o que falta. Denominador ausente é como
      // "442 leads" virou um número sem significado nesta base.
      vendasFechadas: minhas.length,
    },
    acesso.meta,
    { headers: rate.headers },
  );
}

/**
 * Informar o valor de uma venda já fechada.
 *
 * Aceita depois do fato de propósito — é a razão de existir da rota. E grava as
 * DUAS colunas juntas (`sale_value_brl` e `sale_value_recorded_at`), do mesmo jeito
 * que `app/api/v1/pipeline/route.ts` faz no fechamento: uma coluna sem a outra
 * criaria a terceira variante do mesmo fato.
 */
export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "crm.vendas-sem-valor.write" });
  if (!rate.ok) return rate.response;

  const acesso = await requireAccessContext(request);
  if (!acesso.ok) return acesso.response;

  const corpo = (await request.json().catch(() => null)) as { leadId?: string; valor?: unknown } | null;
  const leadId = typeof corpo?.leadId === "string" && /^[0-9a-f-]{36}$/i.test(corpo.leadId) ? corpo.leadId : null;
  if (!leadId) {
    return apiError("VENDA_LEAD_INVALIDA", "Informe a venda cujo valor está sendo registrado.", acesso.meta, {
      status: 400,
      headers: rate.headers,
    });
  }

  const validacao = valorDaVendaAceitavel(corpo?.valor);
  if (!validacao.ok) {
    return apiError("VENDA_VALOR_INVALIDO", validacao.motivo, acesso.meta, { status: 422, headers: rate.headers });
  }

  const admin = getSupabaseAdmin();
  const organizationId = acesso.access.organization.id;

  const atual = await admin
    .from("leads")
    .select(SELECT_DA_VENDA)
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (atual.error || !atual.data) {
    return apiError("VENDA_NAO_ENCONTRADA", "Venda não encontrada nesta organização.", acesso.meta, {
      status: 404,
      headers: rate.headers,
    });
  }

  // O MESMO piso da leitura. Sem isto, um corretor informaria o valor da venda de
  // um colega — e valor de venda é a base da comissão dele.
  const daMinhaCarteira =
    estaNaMinhaCarteira(acesso.access.profile.id, atual.data) ||
    estaNaMinhaCarteira(acesso.access.user.id, atual.data);
  if (!leLiderancaInteira(acesso.access.profile) && !daMinhaCarteira) {
    return apiError("VENDA_FORA_DA_CARTEIRA", "Você só informa o valor de vendas da sua carteira.", acesso.meta, {
      status: 403,
      headers: rate.headers,
    });
  }

  const { error } = await admin
    .from("leads")
    .update({ sale_value_brl: validacao.valor, sale_value_recorded_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("organization_id", organizationId);

  if (error) {
    return apiError("VENDA_VALOR_NAO_GRAVADO", "Não foi possível registrar o valor.", acesso.meta, {
      status: 503,
      headers: rate.headers,
    });
  }

  return apiSuccess(
    {
      leadId,
      valor: validacao.valor,
      // Dizer o que ISSO destrava, porque o corretor não tem como saber: o valor
      // que ele acabou de informar é o que faz a Meta aprender a buscar quem
      // compra, em vez de quem preenche formulário.
      efeito:
        "Valor registrado. A venda entra no VGV e o evento Purchase passa a ser elegível para a Meta.",
    },
    acesso.meta,
    { headers: rate.headers },
  );
}
