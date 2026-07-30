import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiSuccess, createRequestContext, structuredApiLog } from "@/lib/api/core";
import { montarProntidaoDasIntegracoes, ASSUNTOS } from "@/lib/integrations/prontidao-das-integracoes";
import { lerEvidenciaDeProvedores } from "@/lib/ai/prontidao-generativa";
import { defeitosDeFormaDoAmbiente } from "@/lib/ai/model-profiles";
import { avaliarAgendador } from "@/lib/integrations/agendador-parado";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const meta = createRequestContext(request);
  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number }> = {};

  try {
    const dbStartedAt = Date.now();
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    checks.database = {
      ok: !error,
      latencyMs: Date.now() - dbStartedAt,
    };
  } catch {
    checks.database = { ok: false };
  }

  const ready = Object.values(checks).every((check) => check.ok);

  /**
   * ── PRESENTE NÃO É FUNCIONA ────────────────────────────────────────────────
   *
   * Esta rota publicava dois estados, `configured` e `not_configured`, e admitia
   * em comentário que `configured` significa apenas "a variável existe". Quem lê
   * a tela não lê o comentário. Medido em 2026-07-29, uma chamada mínima por
   * provedor com as credenciais reais: OpenAI HTTP 429 `insufficient_quota`,
   * Anthropic HTTP 400 "credit balance is too low", Perplexity HTTP 200 com 14
   * tokens. Os três apareciam iguais aqui: `configured`.
   *
   * E o pior era o `smtp`: `checks.database.ok ? "via-supabase-auth" : "error"`.
   * Estado sobre E-MAIL derivado de uma consulta a `organizations` — status que
   * só cai quando outro assunto cai nunca cai pelo próprio.
   *
   * Agora os estados são cinco e sem ambiguidade (viva · quebrada ·
   * configurada_nao_verificada · desativada · ausente), e a derivação vive em
   * módulo puro, EXECUTADO pelo contrato
   * `tests/contracts/prontidao-nao-mente.test.mjs` — grep no fonte desta rota já
   * sobreviveu a mutação neste repositório e não protege nada.
   *
   * O resultado do banco entra como EVIDÊNCIA ROTULADA (`assunto: "banco"`), na
   * mesma lista das outras, e só a linha do Supabase declara esse assunto. É o
   * que torna estruturalmente impossível outra linha nascer da checagem do banco.
   */
  const evidenciaDeIA = await lerEvidenciaDeProvedores(getSupabaseAdmin());
  const defeitosDeModelo = defeitosDeFormaDoAmbiente(process.env);
  const { integrations, resumo } = montarProntidaoDasIntegracoes({
    env: process.env,
    evidencias: [
      { assunto: ASSUNTOS.banco, ok: checks.database.ok, em: new Date().toISOString() },
      ...evidenciaDeIA.evidencias.map((item) => ({ ...item, assunto: item.provedor })),
    ],
    defeitos: {
      [ASSUNTOS.openai]: defeitosDeModelo.openai,
      [ASSUNTOS.anthropic]: defeitosDeModelo.anthropic,
      [ASSUNTOS.perplexity]: defeitosDeModelo.perplexity,
    },
  });

  /**
   * Leitura que FALHA não vira "fila vazia": `medido: false` diz que não sabe.
   * Fila silenciosa por worker morto e fila silenciosa por consulta quebrada
   * produziriam a mesma tela, e é justamente essa confusão que este bloco veio
   * desfazer.
   */
  const agendamento = await (async () => {
    const segredoConfigurado = Boolean(process.env.ATLAS_CRON_SECRET);
    try {
      const { data: fila, error } = await getSupabaseAdmin()
        .from("integration_outbox")
        .select("attempts,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        return { medido: false, motivo: error.message.slice(0, 120), segredoConfigurado };
      }
      // A decisão mora em `lib/integrations/agendador-parado.ts`, exercitada nos
      // DOIS lados por contrato. Repeti-la aqui criaria duas verdades sobre o
      // mesmo fato — que é o defeito que este repositório mais paga.
      return { medido: true, segredoConfigurado, ...avaliarAgendador(fila ?? []) };
    } catch (erro) {
      return {
        medido: false,
        motivo: erro instanceof Error ? erro.message.slice(0, 120) : "falha ao ler a fila",
        segredoConfigurado,
      };
    }
  })();

  const data = {
    service: "atlas-api-platform",
    status: ready ? "ready" : "not_ready",
    latencyMs: Date.now() - startedAt,
    checks,
    integrations,
    /** Contagem por estado, para a tela não ter de reduzir a lista por conta. */
    integrationsResumo: resumo,
    /**
     * Como a evidência de IA foi obtida — e quando NÃO foi. Erro ao ler
     * `ai_usage_events` não pode virar "nenhum provedor responde": ausência de
     * medição declarada é o contrário de zero silencioso.
     */
    evidenciaDeIA: {
      fonte: "ai_usage_events",
      medido: evidenciaDeIA.medido,
      motivo: evidenciaDeIA.motivo,
      provedoresComRespostaReal: evidenciaDeIA.evidencias.map((item) => item.provedor).sort(),
    },
    /**
     * ── O AGENDAMENTO ESTÁ VIVO? ────────────────────────────────────────────
     *
     * Medido em 2026-07-30: dois itens `meta.lead.fetch` na fila com
     * `attempts = 0`, parados há 89h e 44h. `attempts = 0` é o sinal decisivo, e
     * ele não aparecia em lugar nenhum — só quem consultasse o banco à mão
     * descobriria. De fora, um worker MORTO e um worker SEM TRABALHO são
     * idênticos: os dois deixam a fila quieta.
     *
     * `segredoConfigurado` existe porque o 401 do worker é ambíguo — ele responde
     * igual para segredo AUSENTE e para segredo DIFERENTE, e a primeira hipótese é
     * de ambiente enquanto a segunda é de configuração. Só o booleano sai daqui:
     * nunca o valor, o prefixo ou o comprimento.
     */
    agendamento,
    /**
     * Nenhum valor, prefixo ou comprimento de segredo sai desta resposta: só o
     * estado e o motivo.
     */
    policy: { secretsExposed: false, valuesReturned: false },
  };

  structuredApiLog(ready ? "info" : "warn", "api.readiness.checked", request, meta, {
    ready,
    latencyMs: data.latencyMs,
    vivas: resumo.viva.length,
    quebradas: resumo.quebrada.length,
    naoVerificadas: resumo.configurada_nao_verificada.length,
    // Evidência de assunto trocado é defeito de programação, não de ambiente:
    // sai no log para não ficar só na resposta.
    evidenciaDeOutroAssunto: Object.entries(integrations)
      .filter(([, declaracao]) => declaracao.evidenciaDeOutroAssunto)
      .map(([nome, declaracao]) => `${nome}<-${declaracao.evidenciaDeOutroAssunto}`),
  });

  return apiSuccess(data, meta, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
