import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiSuccess, createRequestContext, structuredApiLog } from "@/lib/api/core";
import { montarProntidaoDasIntegracoes, ASSUNTOS } from "@/lib/integrations/prontidao-das-integracoes";
import { lerEvidenciaDeProvedores } from "@/lib/ai/prontidao-generativa";
import { defeitosDeFormaDoAmbiente } from "@/lib/ai/model-profiles";
import { avaliarAgendador } from "@/lib/integrations/agendador-parado";
import { outboxPausado } from "@/app/api/v2/outbox/process/route";

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

  /**
   * ── A FILA, POR ESTADO ─────────────────────────────────────────────────────
   *
   * `agendamento` acima responde "o worker está vivo?" olhando só o que está
   * `pending`. Isso deixa de fora a pergunta que decide se dá para publicar:
   * QUANTO já falhou e quanto foi para a lata. Medido em 2026-07-30:
   * 6 entregues, 2 falhados, 0 pendentes — e a tela mostrava o ZERO em escala de
   * herói com as 2 falhas em texto pequeno.
   *
   * Falha em fila de integração é lead que não chegou ao corretor. `dead_letter`
   * é lead que não vai chegar sem alguém intervir.
   */
  const filas = await (async () => {
    try {
      const { data: linhas, error } = await getSupabaseAdmin()
        .from("integration_outbox")
        .select("status")
        .limit(5000);
      if (error) {
        // Leitura que falhou NÃO vira "fila limpa" — este é o zero silencioso
        // que este projeto mais paga.
        return { medido: false, motivo: error.message.slice(0, 120) };
      }
      const porEstado: Record<string, number> = {};
      for (const linha of linhas ?? []) {
        const estado = String((linha as { status?: unknown }).status ?? "desconhecido");
        porEstado[estado] = (porEstado[estado] ?? 0) + 1;
      }
      const falhados = (porEstado.failed ?? 0) + (porEstado.dead_letter ?? 0);
      // Pausa DECLARADA é governança; pausa silenciosa é indistinguível de pane.
      // Sem este campo, um kill switch acionado produziria exatamente a mesma
      // tela que o agendador morto — que é o estado que custou 44h49m em 30/07.
      const pausa = outboxPausado();
      const alertas = [
        falhados > 0 ? `${falhados} item(ns) em failed/dead_letter — cada um é uma entrega que não aconteceu.` : null,
        pausa.pausado ? `FILA PAUSADA de propósito: ${pausa.motivo}` : null,
      ].filter(Boolean);
      return {
        medido: true,
        porEstado,
        total: (linhas ?? []).length,
        pausada: pausa.pausado,
        motivoDaPausa: pausa.motivo,
        precisaDeAtencao: falhados > 0 || pausa.pausado,
        motivo: alertas.length > 0 ? alertas.join(" · ") : null,
      };
    } catch (erro) {
      return { medido: false, motivo: erro instanceof Error ? erro.message.slice(0, 120) : "falha ao ler a fila" };
    }
  })();

  /**
   * ── FALTA MIGRATION? ───────────────────────────────────────────────────────
   *
   * Compara o topo do repositório (assado no build) com o topo aplicado no banco
   * (`public.estado_das_migrations()`, sem parâmetro e com EXECUTE só para
   * service_role — ver a migration 20260730180000, que fechou uma escalação
   * causada exatamente por função que recebia identidade por parâmetro).
   *
   * Medido em 2026-07-31: 218 aplicadas no banco contra 173 arquivos no repo. O
   * banco tem coisa que o repositório não reproduz — e essa divergência precisa
   * aparecer ANTES de um deploy, não durante.
   */
  const migrations = await (async () => {
    /**
     * COMPARA POR NOME, NUNCA POR VERSÃO.
     *
     * O banco grava `version` como o carimbo de QUANDO a migration foi aplicada,
     * não o prefixo do arquivo. Medido em 2026-07-31: o arquivo
     * `20260731020000_estado_das_migrations_para_prontidao.sql` virou a linha
     * `20260731013305 | estado_das_migrations_para_prontidao`. Os números NUNCA
     * coincidem — comparar versão daria `emDia: false` para sempre, e portão que
     * grita sempre ensina a ser ignorado. Falso vermelho custa tanto quanto
     * falso verde.
     */
    const doRepo = (process.env.ATLAS_BUILD_MIGRATIONS || "").split(",").map((n) => n.trim()).filter(Boolean);
    try {
      const { data: estado, error } = await getSupabaseAdmin().rpc("estado_das_migrations");
      if (error) return { medido: false, motivo: error.message.slice(0, 120), noRepo: doRepo.length };
      const banco = (estado ?? {}) as { aplicadas?: number; versaoMaisAlta?: string; nomes?: string[] };
      const aplicadas = new Set(banco.nomes ?? []);
      const faltando = doRepo.filter((nome) => !aplicadas.has(nome));
      const semLista = doRepo.length === 0;
      return {
        medido: true,
        aplicadasNoBanco: banco.aplicadas ?? null,
        noRepo: doRepo.length,
        versaoMaisAltaNoBanco: banco.versaoMaisAlta ?? null,
        // Sem a lista do build não há comparação — e "não deu para comparar" é
        // diferente de "está em dia".
        emDia: semLista ? null : faltando.length === 0,
        faltando: faltando.slice(0, 10),
        faltandoTotal: faltando.length,
        motivo: semLista
          ? "ATLAS_BUILD_MIGRATIONS não foi injetada no build — não dá para comparar."
          : faltando.length > 0
            ? `${faltando.length} migration(s) do repositório não constam como aplicadas.`
            : null,
      };
    } catch (erro) {
      return {
        medido: false,
        motivo: erro instanceof Error ? erro.message.slice(0, 120) : "falha ao ler migrations",
        noRepo: doRepo.length,
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
    filas,
    migrations,
    /**
     * ── QUAL COMMIT ESTÁ NO AR ──────────────────────────────────────────────
     *
     * Em 2026-07-30 foi preciso DEDUZIR a versão em produção pela ausência de
     * uma chave na resposta: `agendamento` não aparecia, logo o build era
     * anterior ao commit que a introduziu. Isso é arqueologia, e só funciona
     * enquanto alguém lembra qual commit acrescentou o quê.
     *
     * A pergunta "a produção está rodando o código que eu auditei?" precisa ter
     * resposta direta, porque dela dependem TODAS as outras: uma correção
     * publicada no git e ausente no servidor é uma correção que não existe.
     *
     * `ATLAS_BUILD_COMMIT` é injetada no build. Quando ela falta, o campo NÃO
     * inventa: devolve `null` com o motivo. "Não declarado" é uma informação
     * diferente de "commit X", e confundir as duas foi o que custou a
     * arqueologia acima.
     *
     * Nenhum segredo entra aqui — SHA de commit e nome de ambiente são públicos
     * por natureza.
     */
    build: {
      commit: process.env.ATLAS_BUILD_COMMIT || null,
      branch: process.env.ATLAS_BUILD_BRANCH || null,
      construidoEm: process.env.ATLAS_BUILD_TIME || null,
      ambiente: process.env.ATLAS_ENV || process.env.NODE_ENV || null,
      motivo:
        process.env.ATLAS_BUILD_COMMIT
          ? null
          : "ATLAS_BUILD_COMMIT não foi injetada no build. Sem ela é impossível afirmar qual versão está no ar — e ausência de declaração não é o mesmo que versão desconhecida por acaso.",
    },
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
