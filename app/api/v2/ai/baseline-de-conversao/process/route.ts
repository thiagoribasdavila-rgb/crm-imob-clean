import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { origemDaChamada, registrarExecucao } from "@/lib/integrations/livro-de-execucoes";
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO MUDOU EM 02/08/2026 — o vigia rodava e não sabia dizer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── O que foi MEDIDO (banco de homologação, 02/08/2026 ~16:28 UTC) ──────────
 *
 *   `conversion_feature_snapshots` .... 516 linhas em 3 cortes distintos
 *                                       (31/07, 01/08, 02/08)
 *   `atlas_worker_runs` (o livro) ..... 7 linhas, de DOIS vigias
 *   deste vigia, no livro ............. ZERO
 *
 * Essas três linhas juntas são o problema inteiro: ele produziu efeito em três
 * dias diferentes e, mesmo assim, a pergunta "este vigia rodou?" não tinha como
 * ser respondida a não ser inspecionando a tabela de efeito — que é condicional
 * (só cresce quando há lead ABERTA) e por isso nunca responde "rodou e
 * corretamente não fez nada".
 *
 * Advertência sobre os dígitos: a base é escrita ao vivo. Entre duas consultas
 * do mesmo minuto o total de leads foi de 490 para 508 e as ganhas de 2 para 3.
 * Então o que este cabeçalho afirma é a FORMA, não o dígito: das ~423 leads
 * fechadas, 305 têm foto anterior, e entre essas 305 havia **1 conversão**.
 * `aferirBaseline` recusa afirmar acurácia com "menos de 2 desfechos positivos".
 * Essa recusa é DESFECHO LEGÍTIMO, e nunca foi erro — o que faltava era ela ser
 * distinguível de "o worker não rodou" e de "o banco caiu".
 *
 * ── OS SILÊNCIOS QUE EXISTIAM, e cada um virava o mesmo 200 tranquilo ───────
 *
 * 1. `if (leads.error || leads.rows.length === 0) continue;`
 *    Um único `||` transformava "falhei ao ler as leads desta organização" em
 *    "esta organização não tem lead". Este era o pior dos cinco: são 2 orgs no
 *    banco, então a falha na leitura de UMA já fazia o dia inteiro sair como
 *    `200 {fotografadas: 0}` — com aparência de sistema quieto e saudável.
 *    Agora o erro de consulta é `throw`, e o `throw` vira 500, que é a única
 *    coisa que o agendador enxerga.
 *
 * 2. `const fotos = await fetchAllRows(...)` — o `.error` NUNCA foi lido.
 *    Falhar ao reler as fotos anteriores deixava `desfechos` vazio, e
 *    `aferirBaseline([])` respondia: "Nenhum desfecho conhecido ainda. O
 *    baseline começou a gravar hoje". Frase verdadeira para uma base nova e
 *    FALSA aqui, onde 305 leads fechadas já têm foto. Silêncio que devolve uma
 *    explicação convincente é pior que silêncio mudo: ele encerra a
 *    investigação. Agora é `throw`.
 *
 * 3. `gravadas += (data ?? []).length` contava o que o banco DEVOLVEU — certo —
 *    mas nunca comparava com o que tinha sido ENVIADO. Snapshot que não entrou
 *    saía como 200. Agora a diferença entra em `falhas` e o corpo devolve 500.
 *    A chave única cobre cada linha uma única vez, então `devolvidas < enviadas`
 *    não tem leitura inocente.
 *
 * 4. `getSupabaseAdmin()` ficava FORA do try. Sem as variáveis de ambiente, a
 *    exceção subia crua: sem corpo JSON, sem `motivo`, e — a partir de agora —
 *    sem linha no livro. Foi para dentro do try.
 *
 * 5. Dois recortes mudos: `.limit(200)` em `organizations` e o teto de páginas
 *    do `fetchAllRows` (30 × 1000 linhas). Nenhum dos dois é ERRO, e por isso
 *    nenhum vira 500 — mas os dois produzem foto parcial, e foto parcial que
 *    ninguém declara é a série temporal nascendo torta. Agora saem em
 *    `recortes[]` e o motivo vira `ok_parcial`.
 *
 * ── POR QUE CADA DESFECHO É DISTINGUÍVEL AGORA ─────────────────────────────
 *
 *   ok ................ gravou snapshot (`gravadas > 0`).
 *   sem_trabalho ...... acordou, olhou e não havia o que fotografar. O campo
 *                       `motivo` diz QUAL dos quatro casos foi:
 *                         · sem_organizacoes
 *                         · sem_leads
 *                         · sem_leads_abertas
 *                         · amostra_insuficiente_para_aferir  ← a insuficiência
 *                           declarada por `aferirBaseline`, quando ela era a
 *                           única saída possível da execução. NÃO é falha: é a
 *                           recusa a publicar acurácia sobre 1 conversão.
 *   falhou ............ 500. Erro de consulta (throw) ou gravação não
 *                       confirmada (`falhas[]` não vazia).
 *   fora_da_janela .... NÃO É ALCANÇÁVEL AQUI, e isso fica declarado em vez de
 *                       simulado: este vigia não recusa por horário. A cadência
 *                       é diária (04:25 America/Sao_Paulo), o corte é o início
 *                       do dia UTC e reexecutar no mesmo dia reescreve a mesma
 *                       linha. Inventar uma janela só para preencher o quarto
 *                       desfecho seria inventar comportamento.
 *
 * ── O que este arquivo NÃO conserta, e vale dizer ──────────────────────────
 *
 * `primeiraFoto` guarda a primeira linha que a paginação devolveu, e a consulta
 * ordena por `lead_id` — não por `feature_cutoff_at`. Entre as fotos de uma
 * mesma lead a ordem é indefinida, então "primeira foto" pode não ser a mais
 * antiga, e nada garante que ela seja anterior ao desfecho. É defeito de
 * MEDIÇÃO, não de silêncio, e mexer nele muda o número aferido — fica nomeado
 * aqui em vez de corrigido de carona.
 */
export async function POST(request: Request) {
  const esperado = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!esperado || token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  // O relógio começa ANTES de qualquer decisão. Execução que termina em "não
  // havia nada" também é execução, e é justamente a que sumia sem rastro.
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: "ok" | "sem_trabalho" | "fora_da_janela" | "falhou", resposta: Record<string, unknown>, erro?: string) =>
    registrarExecucao({ vigia: "baseline-de-conversao", rota: "/api/v2/ai/baseline-de-conversao/process", origem, iniciadoEm, desfecho, resposta, erro });

  // Contadores declarados FORA do try: quando algo estoura no meio do laço, o
  // 500 ainda consegue dizer quanto já tinha sido feito. Exceção que zera o
  // placar apaga trabalho que realmente aconteceu — e alguém vai reexecutar às
  // cegas por causa disso.
  let corte = "";
  let organizacoes = 0;
  let leadsLidas = 0;
  let fotografadas = 0;
  let gravadas = 0;
  let fechadas = 0;
  let fechadasComFoto = 0;
  let afirmaveis = 0;
  const falhas: Array<{ organizacao: string; oQue: string; detalhe: string }> = [];
  const recortes: string[] = [];
  const aferimentos: Record<string, unknown> = {};

  try {
    // Dentro do try de propósito: sem as variáveis de ambiente isto lança, e do
    // lado de fora a exceção subia sem corpo JSON e sem linha no livro.
    const admin = getSupabaseAdmin();
    const agora = new Date();
    // Corte no início do dia UTC: é o que torna a reexecução idempotente. Usar
    // `new Date()` cru faria cada execução criar uma linha nova.
    corte = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())).toISOString();

    const LIMITE_DE_ORGS = 200;
    const { data: orgs, error: erroOrgs } = await admin.from("organizations").select("id").limit(LIMITE_DE_ORGS);
    if (erroOrgs) throw new Error(erroOrgs.message);
    const organizacoesLidas = (orgs ?? []) as Array<{ id: string }>;
    organizacoes = organizacoesLidas.length;
    // Recorte, não erro: da 201ª organização em diante ninguém é fotografado e
    // até hoje nada dizia isso.
    if (organizacoes >= LIMITE_DE_ORGS) recortes.push(`organizations:limite-${LIMITE_DE_ORGS}`);

    for (const org of organizacoesLidas) {
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
      // Antes: `if (leads.error || leads.rows.length === 0) continue`. Aquele
      // `||` fazia banco fora do ar e organização sem lead responderem a mesma
      // coisa — e a resposta era 200.
      if (leads.error) {
        throw new Error(`falha ao ler leads da organização ${org.id}: ${leads.error.message ?? leads.error.code ?? "sem detalhe"}`);
      }
      if (leads.truncated) recortes.push(`leads:${org.id}`);
      leadsLidas += leads.rows.length;
      if (leads.rows.length === 0) continue;

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
        const confirmadas = (data ?? []).length;
        gravadas += confirmadas;
        // …e agora COMPARA os dois. A chave única cobre cada linha uma vez só,
        // então devolver menos do que se enviou não tem leitura inocente: é
        // snapshot que não existe, e o dia dele não volta.
        if (confirmadas < linhas.length) {
          falhas.push({ organizacao: org.id, oQue: "snapshots_nao_confirmados", detalhe: `${confirmadas} de ${linhas.length}` });
        }
      }

      // ── A AFERIÇÃO: o que foi previsto antes bateu com o que aconteceu? ─────
      //
      // Só entram leads que JÁ TÊM desfecho e cuja foto foi tirada ANTES dele.
      // Comparar contra a foto de hoje seria prever o passado.
      const fechadasDaOrg = leads.rows.filter((lead) => !ABERTAS(lead.status));
      fechadas += fechadasDaOrg.length;
      const desfechos: Desfecho[] = [];
      if (fechadasDaOrg.length > 0) {
        const fotos = await fetchAllRows<{ lead_id: string; predicted_probability: number }>((de, ate) =>
          admin
            .from("conversion_feature_snapshots")
            .select("lead_id,predicted_probability")
            .eq("organization_id", org.id)
            .eq("model_version", VERSAO_DO_BASELINE)
            .in("lead_id", fechadasDaOrg.map((l) => l.id))
            .order("lead_id", { ascending: true })
            .range(de, ate),
        );
        // Este `.error` era o mais caro dos cinco silêncios: descartado, ele
        // fazia a rota responder "nenhum desfecho conhecido ainda" — uma
        // explicação plausível o bastante para ninguém procurar mais.
        if (fotos.error) {
          throw new Error(`falha ao ler fotos anteriores da organização ${org.id}: ${fotos.error.message ?? fotos.error.code ?? "sem detalhe"}`);
        }
        if (fotos.truncated) recortes.push(`fotos:${org.id}`);
        const primeiraFoto = new Map<string, number>();
        for (const foto of fotos.rows) {
          if (!primeiraFoto.has(foto.lead_id)) primeiraFoto.set(foto.lead_id, Number(foto.predicted_probability));
        }
        for (const lead of fechadasDaOrg) {
          const prevista = primeiraFoto.get(lead.id);
          if (prevista === undefined) continue;
          // De volta para fração, que é a unidade de `aferirBaseline`. A
          // conversão acontece nos DOIS sentidos, no mesmo arquivo, coladas uma
          // na outra de propósito: unidade que muda em lugares distantes é como
          // esta base já perdeu 363 linhas para o arredondamento.
          desfechos.push({ probabilidadePrevista: prevista / 100, converteu: canonicalPipelineStage(lead.status) === "ganho" });
        }
      }
      fechadasComFoto += desfechos.length;
      const aferimento = aferirBaseline(desfechos);
      if (aferimento.afirmavel) afirmaveis += 1;
      aferimentos[org.id] = aferimento;
    }

    // ── O motivo, para que "não fiz nada" nunca seja ambíguo ────────────────
    const motivo = falhas.length
      ? "gravacao_nao_confirmada"
      : organizacoes === 0
        ? "sem_organizacoes"
        : gravadas > 0
          ? (recortes.length ? "ok_parcial" : "ok")
          : leadsLidas === 0
            ? "sem_leads"
            : fechadasComFoto > 0 && afirmaveis === 0
              // Não havia lead aberta para fotografar e a única saída restante,
              // a aferição, RECUSOU por amostra pequena. Recusa declarada não é
              // falha — mas também não pode sair como "ok".
              ? "amostra_insuficiente_para_aferir"
              : "sem_leads_abertas";

    const corpo: Record<string, unknown> = {
      ok: !falhas.length, corte, versaoDoBaseline: VERSAO_DO_BASELINE, horizonteDias: HORIZONTE_DIAS,
      fotografadas, gravadas, aferimentos, motivo,
      organizacoes, leadsLidas, fechadas, fechadasComFoto, afirmaveis,
      // Recorte silencioso é foto parcial, e foto parcial é série temporal
      // torta. Não é erro, então não vira 500 — mas sai declarado.
      parcial: recortes.length > 0, recortes,
      duracaoMs: Date.now() - iniciadoEm,
    };

    // O livro leva CONTADORES, não o corpo inteiro: `aferimentos` carrega um
    // texto de recusa por organização, e com 200 organizações isso viraria
    // custo de banco cobrado por observabilidade — trocar um problema por outro.
    const paraOLivro: Record<string, unknown> = {
      motivo, corte, organizacoes, leadsLidas, fotografadas, gravadas,
      fechadas, fechadasComFoto, afirmaveis, falhas: falhas.length, parcial: recortes.length > 0,
    };

    if (falhas.length) {
      logger.error("ia.baseline_de_conversao_gravacao_nao_confirmada", { falhas: falhas.length, primeira: falhas[0] });
      const corpoFalho = { ...corpo, mensagem: "O banco confirmou menos snapshots do que foram enviados.", falhas };
      return NextResponse.json({ ...corpoFalho, livro: await livro("falhou", paraOLivro) }, { status: 500 });
    }

    logger.info("ia.baseline_de_conversao_fotografado", { fotografadas, gravadas, corte, motivo });
    // `sem_trabalho` NÃO é falha: o vigia acordou, olhou e não havia lead aberta
    // para fotografar. Era exatamente esse desfecho que se confundia com "nunca
    // rodou" — e com "o banco caiu".
    return NextResponse.json({ ...corpo, livro: await livro(gravadas > 0 ? "ok" : "sem_trabalho", paraOLivro) });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("ia.baseline_de_conversao_falhou", { mensagem });
    const corpo: Record<string, unknown> = {
      ok: false, mensagem, motivo: "excecao",
      // O que já tinha sido feito antes de estourar. Sem isto, o 500 apaga o
      // trabalho que aconteceu e a próxima pessoa reexecuta às cegas.
      corte, organizacoes, leadsLidas, fotografadas, gravadas, fechadas, fechadasComFoto,
      falhas: falhas.length, parcial: recortes.length > 0, recortes,
      duracaoMs: Date.now() - iniciadoEm,
    };
    return NextResponse.json({ ...corpo, livro: await livro("falhou", corpo, mensagem) }, { status: 500 });
  }
}
