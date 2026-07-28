/**
 * Contrato do CICLO FECHADO com a Meta.
 *
 * Cada teste aqui fixa um elo que estava partido em 2026-07-28 — e a cadeia
 * inteira falhava em SILÊNCIO, com mensagens honestas que descreviam o sintoma
 * e não a causa:
 *
 *   1. `sale_value_brl` não existia como coluna;
 *   2. nenhuma tela pedia o valor da venda;
 *   3. o SELECT do worker não trazia a coluna;
 *   4. um aviso de supressão parcial paralisava o lote inteiro;
 *   5. o worker enviava para a Meta sem registrar nada localmente;
 *   6. o registro usava um status fora do vocabulário da tabela.
 *
 * A prova comportamental viva é scripts/prova-ciclo-fechado-meta.mjs (12
 * verificações, cria e apaga os próprios dados). Aqui ficam os invariantes de
 * estrutura que impedem cada elo de se partir de novo.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const rotaPipeline = ler("app", "api", "v1", "pipeline", "route.ts");
const telaPipeline = ler("app", "(crm)", "pipeline", "page.tsx");
const janela = ler("lib", "integrations", "meta", "capi-window.ts");
const worker = ler("app", "api", "v2", "marketing", "capi-feedback", "process", "route.ts");
const compat = ler("lib", "compat", "legacy-v2.ts");

test("existe migration que cria o valor apurado da venda", () => {
  const dir = path.join(raiz, "supabase", "migrations");
  const arquivo = fs.readdirSync(dir).find((f) => f.includes("valor_apurado_da_venda"));
  assert.ok(arquivo, "a migration do valor apurado precisa estar versionada");
  const sql = fs.readFileSync(path.join(dir, arquivo), "utf8");
  assert.match(sql, /add column if not exists sale_value_brl/);
  assert.match(sql, /add column if not exists sale_value_recorded_at/,
    "a data da apuração distingue 'vendeu e não informou' de 'vendeu por zero'");
  assert.match(sql, /sale_value_brl is null or sale_value_brl >= 0/,
    "valor negativo é erro de digitação, não desconto");
  assert.match(sql, /drop column if exists sale_value_brl/,
    "todo rollback precisa estar escrito no próprio arquivo");
});

test("fechar exige o valor apurado — e recusa valor inválido", () => {
  // Sem esta guarda a coluna nasce e nunca é preenchida: schema novo, mesmo
  // defeito. O orçamento declarado (budget_min/max) NÃO serve de substituto.
  assert.match(rotaPipeline, /stage === "ganho" && !reversalOf && saleValue === null/);
  assert.match(rotaPipeline, /recusar\("SALE_VALUE_REQUIRED", 400\)/);
  assert.match(rotaPipeline, /recusar\("SALE_VALUE_INVALID", 400\)/);
  const guia = ler("lib", "crm", "pipeline-guidance.ts");
  assert.match(guia, /SALE_VALUE_REQUIRED:/);
  assert.match(guia, /SALE_VALUE_INVALID:/);
  assert.match(guia, /informar-valor-da-venda/, "a recusa precisa dizer o que fazer");
});

test("a tela pergunta antes de mover, como nos outros desfechos", () => {
  // Se a tela não perguntar, o corretor arrasta o card, a rota recusa e a lead
  // volta de coluna — o mesmo defeito que descarte e 'comprou em outro lugar'
  // já haviam resolvido com painel.
  assert.match(telaPipeline, /stage === "ganho" && !reversalOf && saleValue === undefined/);
  assert.match(telaPipeline, /setSaleDraft\(\{ leadId: id/);
  assert.match(telaPipeline, /aria-labelledby="sale-panel-title"/);
  assert.match(telaPipeline, /saleValueBrl: saleValue \?\? null/, "o valor precisa viajar no corpo");
});

test("o valor apurado chega até quem precisa dele", () => {
  // Três lugares leem a coluna; faltar em QUALQUER um deles reabre o buraco.
  assert.match(compat, /"sale_value_brl"/, "o select das telas");
  assert.match(janela, /sale_value_brl/, "o select do worker da CAPI");
  assert.match(telaPipeline, /sale_value_brl: number \| null/, "o tipo da tela");
});

test("a métrica de ganho não soma orçamento declarado", () => {
  // Somava budget_max e chamava de valor ganho: intenção apresentada como fato.
  const codigo = semComentarios(telaPipeline);
  const bloco = codigo.slice(codigo.indexOf("const won ="), codigo.indexOf("const buyerProfiles"));
  assert.ok(!/budget_max/.test(bloco), "orçamento declarado não é valor de venda");
  assert.match(bloco, /sale_value_brl/);
});

test("aviso de supressão parcial NÃO paralisa o lote", () => {
  // O worker lia `blockers` inteiro e pulava a organização no primeiro item —
  // então UMA venda antiga sem valor impedia todas as outras de sair. Numa base
  // real sempre há uma assim: o ciclo nunca rodaria.
  assert.match(janela, /impedimentos: string\[\]/, "a janela precisa separar os dois");
  assert.match(worker, /if \(impedimentos\.length\) \{/,
    "só impedimento para o envio; aviso é registrado e o lote segue");
  assert.ok(!/if \(blockers\.length\) \{\s*resultado\.bloqueados/.test(worker),
    "voltar a parar em qualquer blocker paralisa o ciclo de novo");
  assert.match(worker, /resultado\.avisos\.push/, "o que ficou de fora precisa aparecer");
});

test("o que sai para a Meta é registrado no CRM", () => {
  // Enviar sem registrar é enviar às cegas: não dá para auditar o que saiu nem
  // responder "esta venda já foi devolvida?".
  const bloco = worker.slice(worker.indexOf("if (envio.sent)"), worker.indexOf("} else {"));
  assert.match(bloco, /from\("meta_conversion_events"\)/);
  assert.match(bloco, /onConflict: "organization_id,event_id", ignoreDuplicates: true/,
    "reenvio dentro da janela é esperado — o registro é do fato, não da tentativa");
  assert.match(bloco, /status: "delivered"/,
    "o vocabulário é pending|processing|delivered|failed|blocked|dead_letter");
  assert.ok(!/status: "sent"/.test(bloco), "'sent' está fora do check da tabela e estoura o insert");
  assert.match(bloco, /envio_sem_registro_local/,
    "falha de registro vira aviso visível, não silêncio");
});

test("o vínculo do evento com a lead sai do event_id", () => {
  // O id da lead não viaja no payload que vai para terceiro; todo event_id o
  // carrega por construção (crm-qualcom-<id>, crm-discard-<id>,
  // crm-stage-<id>-ganho), e é de lá que o registro local o extrai.
  const capi = ler("lib", "integrations", "meta", "capi-feedback.ts");
  assert.match(capi, /event_id: `crm-qualcom-\$\{lead\.id\}`/);
  assert.match(capi, /event_id: `crm-discard-\$\{lead\.id\}`/);
  assert.match(capi, /eventId: `crm-stage-\$\{lead\.id\}-ganho`/);
  assert.match(worker, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/, "o worker extrai o uuid do event_id");
});

test("o painel de venda tem as mesmas garantias dos painéis irmãos", () => {
  // Verificado no navegador em 2026-07-28 com a sessão real do corretor:
  // abre com "Por quanto <lead> fechou?", campo focado, botão travado até o
  // valor existir, digitação caractere a caractere sem perder o foco, Escape
  // fecha e NENHUM card muda de coluna.
  //
  // O foco é o ponto sensível: o painel de "comprou em outro lugar" teve um
  // `ref` inline que refocava a moldura a cada render e travava a digitação —
  // defeito de CICLO DE VIDA que nenhum teste estrutural pegou, só a captura
  // de tela do dono. Por isso aqui se fixa `autoFocus` no CAMPO e a AUSÊNCIA
  // de ref que foca.
  assert.match(telaPipeline, /<input[\s\S]{0,200}?id="sale-value"[\s\S]{0,120}?autoFocus/,
    "o foco entra no campo, não na moldura");
  const painel = telaPipeline.slice(
    telaPipeline.indexOf('aria-labelledby="sale-panel-title"'),
    telaPipeline.indexOf("Registrar venda"),
  );
  assert.ok(!/ref=\{\s*\([a-zA-Z]+\)\s*=>[^}]*\.focus\(\)/.test(painel),
    "ref inline que foca roda a cada renderização e trava a digitação");
  assert.match(painel, /event\.key === "Escape"/, "fecha com Escape");
  assert.match(telaPipeline, /disabled=\{valorEmNumero\(saleDraft\.value\) === null/,
    "o botão só libera com valor válido");
  // Cancelar não move: a lead só muda de coluna dentro de confirmSale.
  assert.match(telaPipeline, /function confirmSale\(\)[\s\S]{0,400}?moveLead\(draft\.leadId, "ganho"/);
});

test("o valor aceita o jeito brasileiro de escrever", () => {
  // "450.000,00" e "450000.00" são a mesma venda. Exigir formato de máquina
  // transforma um campo de dois segundos em erro de digitação.
  assert.match(telaPipeline, /replace\(\/\[R\$\\s\.\]\/g, ""\)\.replace\(",", "\."\)/);
});
