/**
 * Contrato do filtro "Funil de" no Kanban — por corretor e por equipe.
 *
 * Nasceu quando a operação passou a ter DOIS corretores com carteira (Diego
 * 195, Vinicius 270). Com um só, "ver o funil de alguém" e "ver o funil" eram
 * a mesma coisa; com dois, a liderança precisa recortar.
 *
 * Prova comportamental viva: a prova de sessão real cobre 10 verificações,
 * incluindo que corretor NÃO consegue espiar carteira alheia pelo parâmetro.
 * Aqui ficam os invariantes que impedem o recorte de virar vazamento.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const rota = ler("app", "api", "v1", "pipeline", "route.ts");
const tela = ler("app", "(crm)", "pipeline", "page.tsx");
const escopo = ler("lib", "crm", "escopo-de-leitura.ts");
const repo = ler("lib", "atlas", "core-v2", "live-repositories.ts");

test("o filtro só existe para quem já vê mais de uma carteira", () => {
  // Um corretor não "filtra" para ver a carteira de outro — ele não a vê. Os
  // parâmetros são IGNORADOS para ele, não recusados: recusar com mensagem
  // entregaria a informação de que aquela pessoa existe.
  assert.match(rota, /lideranca \? \(params\.get\("corretor"\) \|\| ""\)\.trim\(\) : ""/);
  assert.match(rota, /lideranca \? \(params\.get\("equipe"\) \|\| ""\)\.trim\(\) : ""/);
  // E a lista de pessoas filtráveis também não vai para quem não filtra.
  assert.match(rota, /equipe: lideranca \? await/);
});

test("a equipe vem da HIERARQUIA, não da coluna de texto", () => {
  // `profiles.team` está vazio em 27 de 27 perfis ativos (medido em
  // 2026-07-28); um filtro por ele devolveria só o próprio gerente e pareceria
  // "equipe de uma pessoa". `reports_to` é o que o RBAC exige e o que tem dado.
  assert.match(escopo, /export function idsDaEquipe/);
  assert.match(escopo, /reports_to \?\? p\.reportsTo/);
  assert.match(rota, /idsDaEquipe\(perfis \?\? \[\], equipePedida\)/);
});

test("uuid de fora da organização é ignorado, não devolve funil vazio", () => {
  // Filtrar por alguém de outra empresa devolveria zero leads e pareceria
  // "este corretor não tem nada" — mentira com cara de fato.
  const bloco = rota.slice(rota.indexOf("} else if (corretorPedido"), rota.indexOf("const compatiblePipeline"));
  assert.match(bloco, /\.eq\("organization_id", identity\.organizationId\)\.eq\("id", corretorPedido\)/);
  assert.match(bloco, /if \(alvo\) \{/, "sem a pessoa na organização, nenhum filtro é aplicado");
});

test("o recorte acontece na CONSULTA, não na tela", () => {
  // Filtrar no cliente devolveria só o que veio no lote de 500: o funil de um
  // corretor grande apareceria cortado, sem aviso nenhum.
  assert.match(repo, /ownerIds\?: string\[\] \| null/);
  assert.match(repo, /assigned_user_id\.in\.\(\$\{ids\}\),assigned_to\.in\.\(\$\{ids\}\)/,
    "as DUAS colunas de dono — a base tem histórico nas duas");
  assert.match(rota, /ownerIds: idsDoFiltro/);
  assert.match(tela, /\?\$\{filtroDeQuem\.tipo\}=\$\{encodeURIComponent\(filtroDeQuem\.id\)\}/);
  assert.match(tela, /useEffect\(\(\) => \{ void load\(\); \}, \[filtroDeQuem\]\)/,
    "trocar o filtro tem que RECARREGAR do servidor");
});

test("lead sem dono não entra no funil de uma equipe", () => {
  // A fila de não atribuídos não pertence a equipe nenhuma: incluí-la faria o
  // funil do gerente inchar com o que ainda não é dele. (No filtro de carteira
  // individual ela entra de propósito — lá é a fila de quem pode adotar.)
  const bloco = repo.slice(repo.indexOf("if (input.ownerIds?.length)"), repo.indexOf("} else if (input.ownerId)"));
  assert.ok(!/is\.null/.test(bloco), "equipe não herda a fila de leads sem dono");
});

test("gerente sem equipe não vira opção de filtro", () => {
  // Filtrar por ele devolveria o funil de uma pessoa só, e o rótulo "e time"
  // mentiria sobre o que está sendo mostrado.
  assert.match(rota, /\.filter\(\(g\) => g\.pessoas > 1\)/);
});

test("a resposta declara o filtro que aplicou", () => {
  // Sem isso a tela não sabe distinguir "funil vazio" de "filtro não pegou".
  assert.match(rota, /filtroAplicado,/);
  assert.match(rota, /tipo: "equipe", id: equipePedida, pessoas: idsDoFiltro\.length/);
});

test("corretor e equipe são UM controle, não dois", () => {
  // Dois seletores lado a lado permitiriam escolher os dois ao mesmo tempo —
  // estado que o servidor não sabe responder.
  assert.match(tela, /useState<\{ tipo: "corretor" \| "equipe"; id: string \} \| null>\(null\)/);
  assert.match(tela, /<option value="">Todo mundo<\/option>/);
  assert.match(tela, /optgroup label="Equipes"/);
  assert.match(tela, /optgroup label="Corretores"/);
});
