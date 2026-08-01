#!/usr/bin/env node
/**
 * PROVA VIVA do ledger de projeção — contra o banco canônico, não contra um mock.
 *
 * ── Por que este script existe ──────────────────────────────────────────────
 *
 * O contrato em `tests/contracts/ledger-de-projecao.test.mjs` prova a matemática.
 * Ele NÃO prova que a linha entra na tabela: coluna com nome trocado, tipo
 * incompatível ou constraint esquecida passam pelo contrato e explodem em
 * produção. `ai_projection_ledger` estava com ZERO linhas desde a criação, então
 * ninguém nunca havia escrito nela — o caminho era literalmente inédito.
 *
 * Este script faz o ciclo inteiro com as MESMAS funções puras que a aplicação
 * usaria: grava a projeção, fecha com o realizado, lê a comparação de volta, e
 * apaga o que criou. É idempotente e não deixa resíduo.
 *
 *   node --env-file=.env.local --experimental-strip-types \
 *     scripts/prova-do-ledger-de-projecao.mjs
 *
 * Falha com código 1 em qualquer passo. `--manter` deixa as linhas no banco para
 * inspeção manual (e avisa que deixou).
 */

import { createClient } from "@supabase/supabase-js";
import {
  semanaIso,
  linhaDeProjecao,
  fecharComRealizado,
  comparacaoDoLedger,
} from "../lib/ai/ledger-de-projecao.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const manter = process.argv.includes("--manter");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/**
 * Marca de proveniência. Vai no `target` porque é a única coluna de texto livre
 * que o ledger tem, e é ela que permite achar e apagar exatamente estas linhas
 * sem tocar em nada que a operação tenha gravado.
 */
const MARCA = `__prova_ledger_${Date.now()}`;
const criados = [];
let falhas = 0;

const ok = (rotulo, valor) => console.log(`  ok   ${rotulo}${valor === undefined ? "" : `: ${valor}`}`);
const falha = (rotulo, detalhe) => {
  falhas += 1;
  console.error(`  FALHA ${rotulo}: ${detalhe}`);
};

async function limpar() {
  if (!criados.length) return;
  if (manter) {
    console.log(`\n--manter: ${criados.length} linha(s) permanecem com target "${MARCA}".`);
    return;
  }
  const { error } = await db.from("ai_projection_ledger").delete().in("id", criados);
  if (error) {
    console.error(`\nATENÇÃO: falhou apagar ${criados.length} linha(s) de prova: ${error.message}`);
    console.error(`Apague à mão: delete from public.ai_projection_ledger where target = '${MARCA}';`);
    return;
  }
  console.log(`\nLimpeza: ${criados.length} linha(s) de prova apagadas.`);
}

try {
  console.log(`Banco: ${url}`);

  // ── 0. A organização real, e o estado inicial da tabela ──────────────────
  const { data: orgs, error: erroOrg } = await db
    .from("organizations")
    .select("id,name")
    .order("created_at", { ascending: true })
    .limit(1);
  if (erroOrg || !orgs?.length) throw new Error(`sem organização para testar: ${erroOrg?.message}`);
  const org = orgs[0];
  ok("organização", `${org.name} (${org.id})`);

  const { count: antes, error: erroAntes } = await db
    .from("ai_projection_ledger")
    .select("id", { count: "exact", head: true });
  if (erroAntes) throw new Error(`a tabela não responde: ${erroAntes.message}`);
  ok("linhas antes da prova", antes);

  // ── 1. GRAVAR a projeção no momento da decisão ───────────────────────────
  const semanaDecisao = semanaIso(new Date());
  const linha = linhaDeProjecao(
    org.id,
    {
      moveKind: "aumentar_verba",
      target: MARCA,
      weeklyLeadsDelta: { pessimista: 8, esperado: 10, otimista: 12 },
      confidence: "media",
      basis: { measured: true, sample: 40, minimumSample: 20 },
    },
    semanaDecisao,
  );
  if (!linha) throw new Error("linhaDeProjecao recusou uma projeção válida");

  const { data: gravada, error: erroInsert } = await db
    .from("ai_projection_ledger")
    .insert(linha)
    .select("id,move_kind,target,projected,confidence_at_decision,decided_at_week,realized_at_week")
    .single();
  if (erroInsert) throw new Error(`a gravação foi recusada pelo banco: ${erroInsert.message}`);
  criados.push(gravada.id);
  ok("projeção gravada", `${gravada.id} · semana ${gravada.decided_at_week}`);

  // O shape sobreviveu ao round-trip? jsonb pode perder o que não foi enviado.
  if (gravada.projected?.esperado !== 10) falha("faixa projetada", JSON.stringify(gravada.projected));
  else ok("faixa projetada sobreviveu ao jsonb", JSON.stringify(gravada.projected));
  if (gravada.projected?.basis?.measured !== true) falha("lastro", "basis.measured não voltou true");
  else ok("lastro preservado", `amostra ${gravada.projected.basis.sample}`);
  if (gravada.realized_at_week !== null) falha("estado inicial", "a linha nasceu já fechada");
  else ok("a linha nasce ABERTA");

  // ── 2. FECHAR com o realizado ────────────────────────────────────────────
  const fechamento = fecharComRealizado(linha, 4, semanaDecisao);
  if (!fechamento) throw new Error("fecharComRealizado recusou uma linha aberta");
  // Projetou 10 na faixa 8–12, veio 4: a IA prometeu mais do que entregou.
  if (fechamento.desfecho.verdict !== "otimista_demais") {
    falha("veredito", `esperado otimista_demais, veio ${fechamento.desfecho.verdict}`);
  } else {
    ok("veredito", `${fechamento.desfecho.verdict} (erro ${fechamento.desfecho.errorPct}%)`);
  }

  const { data: fechada, error: erroUpdate } = await db
    .from("ai_projection_ledger")
    .update(fechamento.patch)
    .eq("id", gravada.id)
    .select("id,realized_leads_delta,realized_at_week")
    .single();
  if (erroUpdate) throw new Error(`o fechamento foi recusado: ${erroUpdate.message}`);
  if (Number(fechada.realized_leads_delta) !== 4) {
    falha("realizado", `veio ${fechada.realized_leads_delta}`);
  } else ok("fechada com o realizado", `${fechada.realized_leads_delta} em ${fechada.realized_at_week}`);

  // ── 3. O SEGUNDO fechamento é recusado ANTES de tocar o banco ────────────
  const relida = { ...linha, realized_leads_delta: 4, realized_at_week: semanaDecisao };
  if (fecharComRealizado(relida, 99, semanaDecisao) !== null) {
    falha("reabertura", "uma linha já fechada aceitou novo realizado — desfecho auditado apagável");
  } else {
    ok("linha fechada NÃO reabre");
  }

  // ── 4. LER a comparação de volta do banco ────────────────────────────────
  // Quatro linhas iguais são necessárias para o `trustByMoveKind` sair de
  // "coletando base" (mínimo 4 amostras) e produzir fator de correção.
  // Realizado 5 contra esperado 10: viés otimista de +50%, o mesmo caso do
  // fechamento acima (4 contra 10). O que se prova aqui é que o viés persistido
  // volta do banco e vira fator de correção — não a aritmética, que o contrato
  // já cobre.
  const extras = [1, 2, 3].map(() => ({
    ...linhaDeProjecao(
      org.id,
      {
        moveKind: "aumentar_verba",
        target: MARCA,
        weeklyLeadsDelta: { pessimista: 8, esperado: 10, otimista: 12 },
        confidence: "media",
        basis: { measured: true, sample: 40, minimumSample: 20 },
      },
      semanaDecisao,
    ),
    realized_leads_delta: 5,
    realized_at_week: semanaDecisao,
  }));
  const { data: gravadasExtras, error: erroExtras } = await db
    .from("ai_projection_ledger")
    .insert(extras)
    .select("id");
  if (erroExtras) throw new Error(`falhou gravar as linhas extras: ${erroExtras.message}`);
  for (const row of gravadasExtras) criados.push(row.id);
  ok("linhas extras gravadas", gravadasExtras.length);

  const { data: lidas, error: erroLeitura } = await db
    .from("ai_projection_ledger")
    .select(
      "organization_id,move_kind,target,projected,confidence_at_decision,decided_at_week,realized_leads_delta,realized_at_week",
    )
    .eq("organization_id", org.id)
    .eq("target", MARCA);
  if (erroLeitura) throw new Error(`falhou reler o ledger: ${erroLeitura.message}`);

  const comparacao = comparacaoDoLedger(lidas);
  ok("linhas relidas", `${comparacao.fechadas} fechada(s), ${comparacao.abertas} aberta(s)`);
  if (comparacao.fechadas !== 4) falha("fechadas", `esperado 4, veio ${comparacao.fechadas}`);
  if (comparacao.fechadasComLastro !== 4) {
    falha("lastro", `esperado 4 com lastro, veio ${comparacao.fechadasComLastro}`);
  }
  const confianca = comparacao.confiancaPorMovimento[0];
  if (!confianca) falha("confiança", "nenhuma confiança calculada com 4 amostras fechadas");
  else {
    ok(
      "confiança por movimento",
      `${confianca.moveKind}: ${confianca.samples} amostras, acerto ${confianca.hitRate}, viés ${confianca.meanBiasPct}%, correção ×${confianca.correctionFactor}`,
    );
    if (!(confianca.correctionFactor < 1)) {
      falha("correção", `viés otimista deveria encolher a projeção; veio ×${confianca.correctionFactor}`);
    }
  }
  for (const linhaResumo of comparacao.resumo) console.log(`  →    ${linhaResumo}`);

  await limpar();

  const { count: depois } = await db
    .from("ai_projection_ledger")
    .select("id", { count: "exact", head: true });
  if (!manter && depois !== antes) {
    console.error(`\nFALHA: a tabela tinha ${antes} linha(s) e ficou com ${depois}.`);
    falhas += 1;
  } else if (!manter) {
    ok("tabela restaurada", `${depois} linha(s), igual ao início`);
  }

  console.log(falhas ? `\n${falhas} falha(s).` : "\nProva completa: o ledger grava, fecha e responde.");
  process.exit(falhas ? 1 : 0);
} catch (erro) {
  console.error(`\nERRO: ${erro.message}`);
  await limpar();
  process.exit(1);
}
