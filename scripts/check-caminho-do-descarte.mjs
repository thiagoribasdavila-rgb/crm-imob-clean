#!/usr/bin/env node
/**
 * PORTÃO: quem pode tirar uma lead do funil, e por onde.
 *
 * ── O que foi medido em 01/08/2026 ─────────────────────────────────────────
 *
 * O corretor relatou que "não consegue descartar". O rastreamento completo —
 * tela, rota, RPC e banco — mostrou que o mecanismo FUNCIONA:
 *
 *   · `move_pipeline_lead` executada no banco vivo move a lead, tanto com ator
 *     diretor quanto com o corretor dono dela;
 *   · a rota exige motivo (`DISCARD_REASON_REQUIRED`) e o grava;
 *   · os dois commits que fizeram isso já estavam em produção.
 *
 * O problema era OUTRO: o descarte existia em UMA tela só, o Kanban. Nenhuma
 * outra chamava `/api/v1/pipeline`. Na lista — onde estavam as 473 leads sem
 * primeiro contato — "perdido" era só um filtro e uma cor.
 *
 * E havia um caminho CRU: a ficha do cliente muda `leads.status` direto pela
 * rota da lead, sem motivo e sem registrar movimento em `pipeline_stage_moves`.
 * Descartar por ali some do funil sem deixar rastro.
 *
 * ── O que este portão trava ────────────────────────────────────────────────
 *
 * Uma tela nova que feche lead por fora da rota canônica. É a classe de defeito
 * que este repositório mais paga: o mesmo fato decidido em dois lugares. Já são
 * dois caminhos; o terceiro precisa de decisão consciente, não de descuido.
 *
 * Rodar: node scripts/check-caminho-do-descarte.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROTA_CANONICA = "/api/v1/pipeline";
const FECHAMENTO = ["perdido", "ganho", "comprou_outro"];

/* O caminho cru da ficha do cliente é conhecido e está DECLARADO aqui — não
   silenciado. Ele existe porque a Lead 360 tem um seletor de etapa que grava
   `leads.status` pela rota da lead. Enquanto ele viver, esta é a lista de quem
   pode fechar lead sem passar pela rota canônica. Encolher esta lista é
   progresso; aumentá-la exige justificar. */
const CAMINHO_CRU_CONHECIDO = ["app/(crm)/leads/[id]/page.tsx"];

const falhas = [];
const ok = [];

function telas(raiz) {
  const saida = [];
  const pilha = [raiz];
  while (pilha.length) {
    const d = pilha.pop();
    let itens;
    try { itens = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const i of itens) {
      const p = path.join(d, i.name);
      if (i.isDirectory()) pilha.push(p);
      else if (i.name.endsWith(".tsx")) saida.push(p);
    }
  }
  return saida;
}

const arquivos = telas("app/(crm)");
const fechamComRota = [];
const fechamSemRota = [];

/* PRIMEIRA VERSÃO ERRADA, e vale registrar: eu procurava `stage: "perdido"`
   como LITERAL. O Kanban — a tela principal de descarte — passa a etapa por
   VARIÁVEL (`stage`), então o padrão não a encontrava: o portão enxergava uma
   tela e era cego justamente para a que mais importa.

   O que identifica um fechador canônico não é o literal: é CHAMAR a rota. E o
   que identifica um caminho cru é mandar etapa de fechamento para qualquer
   OUTRO endereço. */
for (const arquivo of arquivos) {
  const fonte = fs.readFileSync(arquivo, "utf8").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const chamaCanonica = fonte.includes(ROTA_CANONICA);
  const citaFechamentoComoValor = FECHAMENTO.some((e) =>
    new RegExp(`(stage|status)\\s*[:=]\\s*["'\`]${e}["'\`]`).test(fonte),
  );
  if (chamaCanonica) { fechamComRota.push(arquivo); continue; }
  if (citaFechamentoComoValor) fechamSemRota.push(arquivo);
}

if (fechamComRota.length === 0) {
  falhas.push(`nenhuma tela fecha lead pela rota canônica ${ROTA_CANONICA} — o caminho com motivo obrigatório sumiu`);
} else {
  ok.push(`${fechamComRota.length} tela(s) fecham lead pela rota canônica`);
}

const novosCrus = fechamSemRota.filter((f) => !CAMINHO_CRU_CONHECIDO.includes(f));
if (novosCrus.length) {
  falhas.push(
    `tela(s) fechando lead FORA da rota canônica: ${novosCrus.join(", ")}.\n` +
      `        Fechar por fora não exige motivo e não registra movimento em pipeline_stage_moves —\n` +
      `        a lead some do funil sem rastro. Use ${ROTA_CANONICA}, ou declare o caminho aqui com o porquê.`,
  );
} else {
  ok.push(`nenhum caminho cru novo (conhecidos: ${CAMINHO_CRU_CONHECIDO.length})`);
}

/* A lista de motivos precisa ser UMA. Duas listas é a divergência clássica: a
   tela oferece uma chave que a rota não conhece, e o descarte falha na cara do
   corretor com "motivo inválido". */
const telasComMotivo = arquivos.filter((f) => fs.readFileSync(f, "utf8").includes("DISCARD_REASONS"));
const inventamLista = telasComMotivo.filter((f) => {
  const fonte = fs.readFileSync(f, "utf8");
  return !fonte.includes('from "@/lib/atlas/discard-reasons"');
});
if (inventamLista.length) {
  falhas.push(`tela(s) com lista de motivo própria em vez da canônica: ${inventamLista.join(", ")}`);
} else {
  ok.push(`as ${telasComMotivo.length} telas que pedem motivo usam a MESMA lista canônica`);
}

for (const o of ok) console.log(`  ok   ${o}`);
for (const f of falhas) console.error(`  FALHA ${f}`);

if (falhas.length) {
  console.error(`\n✗ caminho-do-descarte: ${falhas.length} de ${falhas.length + ok.length} asserções reprovaram.`);
  process.exit(1);
}
console.log(`\n✓ caminho-do-descarte: ${ok.length} asserções, todas verdes.`);
