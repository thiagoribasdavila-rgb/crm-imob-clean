/**
 * Contrato do CADASTRO DE EMPREENDIMENTOS.
 *
 * `crm_projects` e `developments` guardavam os MESMOS empreendimentos com
 * identificadores DIFERENTES. A tela de Projetos lia a primeira; as 174 leads
 * apontam para a segunda. Nenhuma junção fechava — quatro projetos com ZERO
 * leads, sendo que Inside Perdizes tem 174.
 *
 * `developments` é a canônica sem discussão: 33 tabelas a referenciam contra 6
 * de `crm_projects` — e nenhuma dessas 6 tinha uma única linha apontando para
 * lá. A tabela antiga tinha 4 linhas para as quais nada aponta.
 *
 * Rodar: node --test tests/contracts/empreendimento-tabela-canonica.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const repo = fs.readFileSync(path.join(raiz, "lib", "atlas", "core-v2", "live-repositories.ts"), "utf8");
const launchOs = fs.readFileSync(path.join(raiz, "app", "api", "v1", "launch-os", "route.ts"), "utf8");
const migration = fs.readFileSync(
  path.join(raiz, "supabase", "migrations", "20260727010000_unifica_empreendimentos_em_developments.sql"),
  "utf8",
);

/** Remove comentários para que um portão meça o código, e não o que se escreveu sobre ele. */
function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("a leitura de empreendimentos usa a tabela canônica", () => {
  const bloco = repo.slice(
    repo.indexOf("export async function readCompatibleDevelopments"),
    repo.indexOf("export async function readCompatibleDevelopments") + 1800,
  );
  assert.match(bloco, /\.from\("developments"\)/, "a canônica é `developments`");
  assert.ok(!/\.from\("crm_projects"\)/.test(bloco),
    "ler a tabela órfã devolve IDs que nenhuma lead conhece");
  assert.match(bloco, /"public\.developments"/, "a origem declarada tem que acompanhar");
});

test("as colunas renomeadas entram por alias, sem quebrar quem consome", () => {
  // `code` virou `project_code` e `address` virou `address_line` na migração V3.
  assert.match(repo, /code:project_code/);
  assert.match(repo, /address:address_line/);
});

test("a migration é idempotente e não apaga nada", () => {
  assert.match(migration, /where not exists \(/,
    "rodar de novo não pode duplicar empreendimento");
  for (const destrutivo of [/\bdrop\s+table\b/i, /\bdelete\s+from\b/i, /\btruncate\b/i, /\bdrop\s+column\b/i]) {
    assert.ok(!destrutivo.test(migration),
      `a migration contém comando destrutivo: ${destrutivo}`);
  }
});

test("a migration confere o resultado em vez de torcer", () => {
  assert.match(migration, /raise exception 'Unificacao incompleta/,
    "sem a verificação, uma unificação parcial passaria despercebida");
});

test("o estoque do painel vem da tabela em que o produto grava", () => {
  // MEDIDO na produção: `inventory_units` 0 linhas, `properties` 30 (R$ 9.205.000).
  // A RPC `upsert_canonical_inventory_unit` — o gravador chamado por
  // /api/v1/developments/[id]/inventory — insere e atualiza `properties` e não
  // encosta em `inventory_units`; nenhuma função do banco escreve na antiga.
  assert.match(semComentarios(launchOs), /\.from\("properties"\)/,
    "a canônica de estoque é `properties`: é nela que o gravador escreve");
  assert.ok(!/\.from\("inventory_units"\)/.test(semComentarios(launchOs)),
    "ler a tabela vazia desenha 0 unidade e R$ 0 de VGV como se fosse medição");
});

test("as colunas de estoque são mapeadas uma a uma, e a chave de junção não é remapeada", () => {
  // Os nomes divergem entre as duas tabelas; conferidos no banco.
  assert.match(launchOs, /unit_code:unit_number/, "`unit_code` só existe na tabela antiga");
  assert.match(launchOs, /private_area:area/, "`private_area` só existe na tabela antiga");
  // `properties.development_id` aponta para `developments.id` — a MESMA chave
  // que o painel lista. `inventory_units.project_id` apontava para
  // `crm_projects`: nenhum id fecharia mesmo que a tabela tivesse linhas.
  //
  // A asserção roda sobre o CÓDIGO, sem comentários: a primeira versão deste
  // portão reprovou porque casou com o comentário que documenta o remapeamento
  // removido. Portão que lê prosa mede a prosa, não o comportamento.
  //
  // E recorta a linha DO ESTOQUE. Sem o recorte, ele também casava com a linha
  // de `materials`, que remapeia `development_id: row.project_id` a partir de
  // `knowledge_documents` — cujo `project_id` aponta para `crm_projects`, a
  // órfã. Essa é uma irmã LATENTE deste defeito (0 linhas hoje, então sem
  // efeito medível) e continua em pé de propósito: não é o que esta entrega
  // mediu, e não se conserta no escuro uma junção sem um único dado.
  const codigo = semComentarios(launchOs);
  const linhaEstoque = codigo.slice(codigo.indexOf("const properties: AnyRow[]"));
  assert.ok(!/development_id: row\.project_id/.test(linhaEstoque.slice(0, linhaEstoque.indexOf(";") + 1)),
    "remapear de `project_id` grava undefined por cima da chave boa e zera tudo em silêncio");
});

test("o cartão do projeto não imprime estoque sem lastro", () => {
  // Zero de estoque é afirmação forte: se a fonte não respondeu, a tela diz que
  // não sabe em vez de desenhar 0 unidade, 0% de absorção e R$ 0 de VGV.
  const painel = fs.readFileSync(path.join(raiz, "app", "(crm)", "developments", "page.tsx"), "utf8");
  const cartao = painel.slice(painel.indexOf("Unidades disponíveis"));
  for (const cifra of [/metrics\.inventoryTotal/, /metrics\.absorption/, /metrics\.totalVgv/]) {
    const trecho = cartao.slice(Math.max(0, cartao.search(cifra) - 400), cartao.search(cifra));
    assert.match(trecho, /lastroEstoque\.medido/,
      `a cifra ${cifra} é impressa sem conferir se o estoque respondeu`);
  }
});

test("a contagem de leads do projeto vem da fonte, não da campanha", () => {
  // `marketing_campaigns.leads_count` só existe quando a campanha é registrada
  // E ligada ao projeto. A lead pode chegar por portal, site, indicação ou
  // importação — contar pela campanha era contar uma fatia e chamá-la de total.
  assert.match(launchOs, /db\.from\("leads"\)\.select\("development_id"\)/);
  assert.match(launchOs, /totalLeads: contagemDeLeads\.get\(id\) \?\? 0/);
  assert.match(launchOs, /campaignLeads: leads,/,
    "a contagem por campanha CONTINUA: uma coisa é o que a mídia trouxe, outra é o que o empreendimento tem");
});
