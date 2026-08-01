import type { NextRequest } from "next/server";
import { apiSuccess, createRequestContext, structuredApiLog } from "@/lib/api/core";

export const dynamic = "force-dynamic";

/**
 * LIVENESS — e liveness que pode dizer NÃO.
 *
 * ── O que foi medido em 01/08/2026 ─────────────────────────────────────────
 *
 * Esta rota devolvia `status:"ok"`, `checks:{application:"ok"}` e HTTP 200
 * CRAVADOS, sem ler uma única variável, e ainda logava `healthy: true` como
 * literal. `app/api/health/route.ts` reexporta este GET, então os DOIS
 * endereços históricos de saúde ficaram cegos ao mesmo tempo.
 *
 * Antes do PR #9, a `main` calculava `healthy = hasSupabaseUrl &&
 * hasSupabasePublicKey` e devolvia 503 quando faltava configuração. A
 * capacidade migrou para `/api/v1/ready`, que consulta o banco — estritamente
 * mais forte. Mas quem monitora uptime aponta para `/health`, e esse endereço
 * passou a responder "estou bem" mesmo com o Supabase desconfigurado. Um
 * alerta que nunca dispara não é um alerta silencioso: é um alerta que não
 * existe.
 *
 * ── Por que não basta chamar o banco aqui ──────────────────────────────────
 *
 * Liveness responde "o processo está de pé?" e precisa ser barata e sem I/O —
 * senão lentidão do banco vira reinício em cascata. Readiness responde
 * "consigo atender?" e é `/api/v1/ready`.
 *
 * O meio-termo honesto: conferir o que dá para conferir SEM REDE. A
 * configuração pública é assada no bundle; se ela não chegou, esta instância
 * não autentica ninguém — e isso é fato local, não opinião sobre o banco.
 */
export async function GET(request: NextRequest) {
  const meta = createRequestContext(request);

  const temUrl = Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim());
  const temChavePublica = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim() ||
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim(),
  );
  const saudavel = temUrl && temChavePublica;

  /* Diz O QUE falta, não só que falhou — quem lê isto às 3 da manhã precisa
     saber onde mexer. Nome de variável não é segredo; valor seria, e nenhum
     aparece aqui. */
  const faltando = [
    temUrl ? null : "NEXT_PUBLIC_SUPABASE_URL",
    temChavePublica ? null : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean) as string[];

  structuredApiLog(saudavel ? "info" : "error", "api.health.checked", request, meta, {
    healthy: saudavel,
    ...(saudavel ? {} : { missingEnv: faltando }),
  });

  return apiSuccess(
    {
      service: "atlas-api-platform",
      status: saudavel ? "ok" : "degraded",
      checks: {
        application: "ok",
        // `publicConfig` é o único que esta rota pode afirmar sem rede.
        // A prontidão real — banco respondendo — é `/api/v1/ready`.
        publicConfig: saudavel ? "ok" : "missing",
      },
      ...(saudavel ? {} : { missingEnv: faltando, hint: "Sem configuração pública esta instância não autentica ninguém." }),
      deepCheck: "/api/v1/ready",
    },
    meta,
    { status: saudavel ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
