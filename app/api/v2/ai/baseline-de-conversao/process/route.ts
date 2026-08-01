import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import {
  avaliarBaseline, aferirBaseline, VERSAO_DO_BASELINE, VERSAO_DO_ESQUEMA, HORIZONTE_DIAS,
  type FatosDaLead, type Desfecho,
} from "@/lib/ai/baseline-de-conversao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A FOTO DIÁRIA QUE UM MODELO PRECISARIA PARA EXISTIR.
 *
 * ── Por que este worker existe ──────────────────────────────────────────────
 *
 * A auditoria deu **3,0/10** para análise preditiva, com a frase: "existe
 * pontuação, não existe modelo". `conversion_feature_snapshots` tem 0 linhas
 * desde que foi criada, e `score_ia` correlaciona r ≈ 0,88 com
 * `data_quality_percent` — é completude de cadastro com outro nome.
 *
 * Com 1 venda em 483 leads não há o que treinar nem o que avaliar. Mas a
 * alternativa a "não dá para prever" não é ficar parado: é começar a GUARDAR
 * hoje o que faltará amanhã. Sem a foto no momento do corte, nem daqui a um ano
 * haverá base — e a conversa recomeça do zero com os mesmos 0 registros.
 *
 * ── O que ele NÃO faz ───────────────────────────────────────────────────────
 *
 * Não chama isso de previsão de IA. Não escreve em `leads`. Não consome
 * provider nenhum (custo estruturalmente zero). E não publica acurácia enquanto
 * a base de desfechos for pequena — `aferirBaseline` recusa, e a recusa viaja
 * na resposta com o motivo.
 *
 * ── Idempotência ────────────────────────────────────────────────────────────
 *
 * A chave única da tabela é (organization_id, lead_id, feature_cutoff_at,
 * model_version). O corte é o INÍCIO DO DIA em UTC, então reexecutar no mesmo
 * dia atualiza a mesma linha em vez de criar uma foto por execução. Um snapshot
 * por lead por dia é exatamente o que a série temporal precisa.
 */
export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const inicio = Date.now();
  const admin = getSupabaseAdmin();

  try {
    const agora = new Date();
    // Corte no início do dia UTC: é o que torna a reexecução idempotente. Usar
    // `new Date()` cru faria cada execução criar uma linha nova.
    const corte = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())).toISOString();

    const { data: orgs, error: erroOrgs } = await admin.from("organizations").select("id").limit(200);
    if (erroOrgs) throw new Error(erroOrgs.message);

    let fotografadas = 0;
    let gravadas = 0;
    const aferimentos: Record<string, unknown> = {};

    for (const org of (orgs ?? []) as Array<{ id: string }>) {
      const leads = await fetchAllRows<{
        id: string; status: string | null; created_at: string | null;
        first_contacted_at: string | null; source: string | null;
        assigned_to: string | null; assigned_user_id: string | null;
      }>((de, ate) =>
        admin
          .from("leads")
          .select("id,status,created_at,first_contacted_at,source,assigned_to,assigned_user_id")
          .eq("organization_id", org.id)
          .order("id", { ascending: true })
          .range(de, ate),
      );
      if (leads.error || leads.rows.length === 0) continue;

      const ABERTAS = (status: string | null) => {
        const etapa = canonicalPipelineStage(status);
        return etapa !== "ganho" && etapa !== "perdido" && etapa !== "comprou_outro";
      };

      // ── A foto: só leads ABERTAS. Prever o desfecho de quem já teve desfecho
      //    não é previsão, é cópia — e envenenaria a aferição com acerto fácil.
      const linhas = leads.rows.filter((lead) => ABERTAS(lead.status)).map((lead) => {
        const criada = lead.created_at ? Date.parse(lead.created_at) : Date.now();
        const fatos: FatosDaLead = {
          idadeDias: Math.max(0, Math.floor((Date.parse(corte) - criada) / 86_400_000)),
          tevePrimeiroContato: Boolean(lead.first_contacted_at),
          etapaAlcancada: canonicalPipelineStage(lead.status),
          origem: lead.source,
          temDono: Boolean(lead.assigned_to || lead.assigned_user_id),
        };
        const avaliacao = avaliarBaseline(fatos);
        return {
          organization_id: org.id,
          lead_id: lead.id,
          feature_cutoff_at: corte,
          horizon_days: HORIZONTE_DIAS,
          feature_schema_version: VERSAO_DO_ESQUEMA,
          features: { ...fatos, parcelas: avaliacao.parcelas },
          // ── UNIDADE: a coluna é PERCENTUAL, não fração ────────────────────
          //
          // `predicted_probability` tem CHECK (0..100) e o leitor existente
          // (`/api/v1/analytics/conversion-dataset`) divide por 100. O nome da
          // coluna diz "probability" e o conteúdo é percentual — divergência
          // que a migration 20260731150000 documenta em vez de renomear, para
          // não quebrar esse leitor.
          //
          // A primeira versão deste worker gravou a FRAÇÃO. Resultado medido:
          // 363 das 370 linhas ficaram 0.00 — e zero, aqui, é a afirmação
          // "esta lead nunca vai converter", que este código se recusa a fazer.
          predicted_probability: Math.round(avaliacao.probabilidade * 100 * 1e6) / 1e6,
          model_version: VERSAO_DO_BASELINE,
          // O hash é das FEATURES, não da linha: ele responde "as entradas
          // mudaram?" sem precisar comparar json com json.
          input_hash: createHash("sha256").update(JSON.stringify(fatos)).digest("hex").slice(0, 32),
          // Nulo por desenho: produzido por worker, sem pessoa por trás. Ver a
          // migration 20260731140000.
          created_by: null,
        };
      });
      fotografadas += linhas.length;

      if (linhas.length > 0) {
        const { data, error } = await admin
          .from("conversion_feature_snapshots")
          .upsert(linhas, { onConflict: "organization_id,lead_id,feature_cutoff_at,model_version" })
          .select("id");
        if (error) throw new Error(`falha ao gravar snapshots: ${error.message}`);
        // Conta o que o banco DEVOLVEU, não o tamanho do array enviado.
        gravadas += (data ?? []).length;
      }

      // ── A AFERIÇÃO: o que foi previsto antes bateu com o que aconteceu? ─────
      //
      // Só entram leads que JÁ TÊM desfecho e cuja foto foi tirada ANTES dele.
      // Comparar contra a foto de hoje seria prever o passado.
      const fechadas = leads.rows.filter((lead) => !ABERTAS(lead.status));
      const desfechos: Desfecho[] = [];
      if (fechadas.length > 0) {
        const fotos = await fetchAllRows<{ lead_id: string; predicted_probability: number }>((de, ate) =>
          admin
            .from("conversion_feature_snapshots")
            .select("lead_id,predicted_probability")
            .eq("organization_id", org.id)
            .eq("model_version", VERSAO_DO_BASELINE)
            .in("lead_id", fechadas.map((l) => l.id))
            .order("lead_id", { ascending: true })
            .range(de, ate),
        );
        const primeiraFoto = new Map<string, number>();
        for (const foto of fotos.rows) {
          if (!primeiraFoto.has(foto.lead_id)) primeiraFoto.set(foto.lead_id, Number(foto.predicted_probability));
        }
        for (const lead of fechadas) {
          const prevista = primeiraFoto.get(lead.id);
          if (prevista === undefined) continue;
          // De volta para fração, que é a unidade de `aferirBaseline`. A
          // conversão acontece nos DOIS sentidos, no mesmo arquivo, coladas uma
          // na outra de propósito: unidade que muda em lugares distantes é como
          // esta base já perdeu 363 linhas para o arredondamento.
          desfechos.push({ probabilidadePrevista: prevista / 100, converteu: canonicalPipelineStage(lead.status) === "ganho" });
        }
      }
      aferimentos[org.id] = aferirBaseline(desfechos);
    }

    logger.info("ia.baseline_de_conversao_fotografado", { fotografadas, gravadas, corte });
    return NextResponse.json({
      ok: true, corte, versaoDoBaseline: VERSAO_DO_BASELINE, horizonteDias: HORIZONTE_DIAS,
      fotografadas, gravadas, aferimentos, duracaoMs: Date.now() - inicio,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("ia.baseline_de_conversao_falhou", { mensagem });
    return NextResponse.json({ ok: false, mensagem, duracaoMs: Date.now() - inicio }, { status: 500 });
  }
}
