/**
 * PROJEÇÃO × REALIZADO — a comparação exposta, e o registro de modelos.
 *
 * ── Por que esta rota existe ────────────────────────────────────────────────
 *
 * `ai_projection_ledger` era gravada por ninguém e lida por ninguém (medido em
 * 2026-07-30: zero linhas, zero chamadores). A gravação passou a acontecer na
 * decisão, em /api/v1/marketing/proposals. Esta rota é o outro lado: sem alguém
 * LENDO a comparação, o ledger é só uma tabela que cresce.
 *
 * Ela também devolve o estado do registro de modelos, e essa é a parte que a
 * liderança precisa ver: dos nove modelos que o dono pediu, sete estão
 * RECUSADOS por falta de baseline, e a rota diz por quê, com número. "Fase 3
 * aprovada" não sai daqui.
 *
 * Só leitura. Nenhuma escrita, nenhum modelo chamado, nenhum token consumido —
 * custo R$ 0.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { comparacaoDoLedger, type LinhaDoLedger } from "@/lib/ai/ledger-de-projecao";
import { REGISTRO_DE_MODELOS, estadoDeDrift, estadoDoRegistro } from "@/lib/ai/registro-de-modelos";

export const dynamic = "force-dynamic";

const ehLideranca = (comercial: string | null | undefined, papel: string) =>
  ["director", "superintendent", "manager"].includes(comercial || "") || papel === "admin";

export async function GET(request: NextRequest) {
  const teto = enforceRateLimit(request, { limit: 30, scope: "analytics.projecao-realizado.read" });
  if (!teto.ok) return teto.response;
  const acesso = await requireAccessContext(request);
  if (!acesso.ok) return acesso.response;
  if (!ehLideranca(acesso.access.profile.commercialRole, acesso.access.profile.role)) {
    return apiError(
      "FORBIDDEN",
      "Projeção × realizado é leitura da liderança comercial.",
      acesso.meta,
      { status: 403 },
    );
  }

  const admin = getSupabaseAdmin();
  const organizationId = acesso.access.organization.id;

  const [ledger, drift] = await Promise.all([
    admin
      .from("ai_projection_ledger")
      .select(
        "organization_id,move_kind,target,projected,confidence_at_decision,decided_at_week,realized_leads_delta,realized_at_week",
      )
      .eq("organization_id", organizationId)
      .order("decided_at_week", { ascending: false })
      .limit(200),
    // `current_sample` é o que distingue "drift estável" de "ninguém observou".
    // Os 8 relatórios existentes tinham amostra 0 — e isso NÃO é estabilidade.
    admin
      .from("prediction_drift_reports")
      .select("current_sample,drift_status,generated_at")
      .eq("organization_id", organizationId)
      .order("generated_at", { ascending: false })
      .limit(1),
  ]);

  if (ledger.error) {
    return apiError(
      "LEDGER_UNAVAILABLE",
      "Ledger de projeção indisponível (ai_projection_ledger).",
      acesso.meta,
      { status: 503 },
    );
  }

  const comparacao = comparacaoDoLedger((ledger.data ?? []) as LinhaDoLedger[]);
  // Erro de leitura do drift NÃO derruba a rota: `null` significa "não medido",
  // que é a resposta honesta, e `estadoDeDrift` já sabe tratá-lo.
  const amostraDeDrift = drift.error
    ? null
    : typeof drift.data?.[0]?.current_sample === "number"
      ? drift.data[0].current_sample
      : null;

  const registro = estadoDoRegistro();
  const modelos = REGISTRO_DE_MODELOS.map((modelo) => {
    const leitura = estadoDeDrift(modelo, amostraDeDrift);
    return {
      id: modelo.id,
      nome: modelo.nome,
      natureza: modelo.natureza,
      versao: modelo.versao,
      dataset: modelo.dataset,
      baseline: modelo.baseline,
      metricas: modelo.metricas,
      explicabilidade: modelo.explicabilidade,
      revisaoEm: modelo.revisaoEm,
      limiteDeUso: modelo.limiteDeUso,
      fallback: modelo.fallback,
      ativo: modelo.ativo,
      medidoEm: modelo.medidoEm,
      elegivel: leitura.elegivel,
      drift: { estado: leitura.estado, explicacao: leitura.explicacao },
      motivosDaRecusa: registro.recusados.find((r) => r.id === modelo.id)?.motivos ?? [],
    };
  });

  return apiSuccess(
    {
      ledger: {
        fechadas: comparacao.fechadas,
        abertas: comparacao.abertas,
        // Só a linha com lastro medido calibra. As duas contagens ficam visíveis
        // para o número de confiança não virar caixa-preta.
        fechadasComLastro: comparacao.fechadasComLastro,
        confiancaPorMovimento: comparacao.confiancaPorMovimento,
        resumo: comparacao.resumo,
      },
      registro: {
        total: registro.total,
        admitidos: registro.admitidos,
        recusados: registro.recusados.length,
        semBaseline: registro.semBaseline,
        modelos,
      },
      politica: {
        // O portão, escrito onde o cliente lê: nada aqui promove modelo sozinho.
        promocaoAutomatica: false,
        baselineObrigatorioParaEstatistico: true,
        aritmeticaSeparadaDeInferencia: true,
        decisaoDeVerbaEhHumana: true,
      },
    },
    acesso.meta,
    { headers: { ...teto.headers, "Cache-Control": "no-store" } },
  );
}
