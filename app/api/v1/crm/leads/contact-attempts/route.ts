/**
 * QUANTAS TENTATIVAS ESTA LEAD JÁ TEVE.
 *
 * A tela precisa mostrar antes de o corretor tentar descartar. O servidor já
 * recusa o descarte abaixo do piso (`/api/v1/pipeline`, código
 * MINIMO_DE_TENTATIVAS) — mas descobrir a regra levando um erro na cara é a
 * pior forma de aprender uma regra.
 *
 * Esta rota é só leitura. A trava continua onde tem que estar: no servidor que
 * grava.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { tentativasDaLead, frasePara, TENTATIVAS_MINIMAS } from "@/lib/crm/contact-attempts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 120, scope: "lead-contact-attempts" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const leadId = request.nextUrl.searchParams.get("leadId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) {
    return apiError("LEAD_INVALID", "Informe a lead.", identity.meta, { status: 400 });
  }

  const t = await tentativasDaLead(getSupabaseAdmin(), identity.access.organization.id, leadId);

  return apiSuccess({
    ...t,
    minimo: TENTATIVAS_MINIMAS,
    frase: frasePara(t),
  }, identity.meta, { headers: limited.headers });
}
