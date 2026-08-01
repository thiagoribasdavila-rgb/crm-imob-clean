/**
 * Carrega a calibração EFETIVA da organização (defaults + overrides do banco).
 *
 * Best-effort por princípio: sem tabela ai_calibration (pré-Fase 0) ou com
 * qualquer erro de leitura, vale o default do código — as IAs nunca ficam sem
 * limiar. Camada server-side fina; o merge/clamp mora em lib/ai/calibration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeCalibration, type AiCalibration } from "@/lib/ai/calibration";

export async function loadOrgCalibration(
  admin: SupabaseClient,
  organizationId: string,
): Promise<AiCalibration> {
  try {
    const { data, error } = await admin
      .from("ai_calibration").select("overrides")
      .eq("organization_id", organizationId).maybeSingle();
    return mergeCalibration(!error && data ? data.overrides : {}).calibration;
  } catch {
    return mergeCalibration({}).calibration;
  }
}
