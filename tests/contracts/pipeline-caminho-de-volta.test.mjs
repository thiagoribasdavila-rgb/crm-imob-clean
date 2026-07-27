/**
 * Contrato do CAMINHO DE VOLTA.
 *
 * Toda recusa do pipeline carrega o próximo passo concreto de quem está olhando
 * a tela. A régua não é estética: recusa sem saída faz o corretor repetir a
 * mesma tentativa até desistir da lead.
 *
 * O caso que motivou isto: oito exceções distintas da RPC caíam todas em
 * "Atualize o Kanban e confira a etapa atual". Para a lead que pertence a outra
 * pessoa, isso é um beco — ela não muda de dono porque ele atualizou a tela.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const fonte = ler("lib", "crm", "pipeline-guidance.ts");
const g = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`);

const TODAS = { ...g.RECUSAS, ...g.RECUSAS_DA_ROTA, ...g.RECUSAS_DE_ACESSO };

test("toda recusa tem caminho, e ele não repete o problema", () => {
  for (const [chave, o] of Object.entries(TODAS)) {
    assert.ok(o.caminho && o.caminho.length > 25, `${chave}: caminho vazio ou curto demais`);
    assert.notEqual(o.caminho, o.problema, `${chave}: o caminho só repete o problema`);
    assert.ok(o.problema && o.problema.length > 10, `${chave}: problema vazio`);
  }
});

test("o caminho fala de AÇÃO, não de estado", () => {
  // Um caminho que não contém verbo de ação é descrição disfarçada.
  const verbos = /pe[çc]a|escolha|escreva|atualize|recarregue|entre|avise|espere|confirme|mova|tente|ligue|marque|combine|acompanhe/i;
  for (const [chave, o] of Object.entries(TODAS)) {
    assert.match(o.caminho, verbos, `${chave}: o caminho não diz o que fazer`);
  }
});

test("lead de outra carteira NÃO manda atualizar a tela", () => {
  // O beco original: atualizar não transfere lead nenhuma. Ele atualiza, tenta
  // de novo, lê a mesma frase, e conclui que o CRM está quebrado.
  const fora = g.RECUSAS.pipeline_move_out_of_scope;
  assert.ok(!/^atualize/i.test(fora.caminho));
  assert.match(fora.caminho, /gestor|diretor/i, "o caminho verdadeiro é pedir a transferência");
  assert.equal(fora.acao, "falar-com-gestor");
  // E a mesma lead barrada pela checagem de acesso diz a mesma coisa: as duas
  // portas para o mesmo problema não podem orientar diferente.
  assert.equal(g.RECUSAS_DE_ACESSO.ESCOPO.caminho, fora.caminho);
});

test("as oito exceções da RPC estão mapeadas", () => {
  // Se a RPC ganhar uma exceção nova e ninguém mapear, ela cai na genérica —
  // que é justamente o comportamento que este contrato existe para impedir.
  for (const chave of [
    "pipeline_move_out_of_scope", "pipeline_lead_not_found", "pipeline_stage_conflict",
    "pipeline_stage_invalid", "pipeline_buyer_reason_required", "pipeline_undo_invalid",
    "pipeline_already_reversed", "pipeline_undo_stale",
  ]) {
    assert.ok(g.RECUSAS[chave], `${chave} sem orientação`);
  }
});

test("orientar() acha pela mensagem crua do Postgres", () => {
  // `raise exception 'pipeline_undo_stale'` chega com prefixo do driver.
  assert.equal(
    g.orientar('erro: pipeline_undo_stale').caminho,
    g.RECUSAS.pipeline_undo_stale.caminho,
  );
  assert.equal(g.orientar("").caminho, g.orientar(null).caminho, "vazio cai na genérica");
  assert.ok(g.orientar("coisa que ninguém mapeou").caminho.length > 25, "a genérica também aponta saída");
});

test("orientarAcesso() cobre escopo, sessão e organização", () => {
  assert.equal(g.orientarAcesso("Lead fora do seu escopo comercial.")?.acao, "falar-com-gestor");
  assert.ok(g.orientarAcesso("sessão expirada"));
  assert.ok(g.orientarAcesso("usuário sem organização"));
  assert.equal(g.orientarAcesso("qualquer outra coisa"), null, "sem palpite: null é honesto");
});

// ── A rota entrega isso de fato ────────────────────────────────────────────

test("a rota não recusa sem passar pela orientação", () => {
  const rota = ler("app", "api", "v1", "pipeline", "route.ts");
  // Recusa montada à mão volta a ser frase sem saída. A exceção é o authError,
  // que tem seu próprio caminho, e o 503 de leitura do GET.
  const cruas = rota.split("\n").filter((l) =>
    /NextResponse\.json\(\s*\{\s*error:/.test(l) && !/orientarAcesso|o\.problema/.test(l));
  assert.deepEqual(cruas, [], `recusas sem caminho:\n${cruas.join("\n")}`);
});

test("lead fora do escopo é 403, não 409", () => {
  // 409 faz cliente e tela tratarem como disputa de versão — "tente de novo" —
  // e o corretor entra num laço que nunca termina.
  const rota = ler("app", "api", "v1", "pipeline", "route.ts");
  assert.match(rota, /foraDoEscopo \? 403/);
});

test("a tela mostra o caminho, não só o erro", () => {
  const pagina = ler("app", "(crm)", "pipeline", "page.tsx");
  assert.match(pagina, /payload\.caminho/);
  assert.match(pagina, /O que fazer/);
  assert.match(pagina, /caminho\.acao === "falar-com-gestor"/);
});

// ── Pontos de conhecimento ────────────────────────────────────────────────

test("toda etapa do funil tem ponto de conhecimento", () => {
  // Sem isto cada corretor decide sozinho o que "Qualificação" quer dizer, e o
  // funil deixa de medir a mesma coisa entre pessoas.
  for (const etapa of ["novo", "contato", "qualificacao", "visita", "proposta",
    "contrato", "ganho", "perdido", "comprou_outro"]) {
    const p = g.conhecimentoDaEtapa(etapa);
    assert.ok(p, `${etapa} sem ponto de conhecimento`);
    assert.ok(p.significa.length > 15, `${etapa}: "significa" vazio`);
    assert.ok(p.paraAvancar.length > 25, `${etapa}: "para avançar" vazio`);
  }
  assert.equal(g.conhecimentoDaEtapa("inventada"), null);
});

test("o Kanban mostra o ponto de conhecimento na coluna", () => {
  const pagina = ler("app", "(crm)", "pipeline", "page.tsx");
  assert.match(pagina, /conhecimentoDaEtapa\(stage\.key\)/);
  assert.match(pagina, /Para avançar:/);
  // Só na visão confortável: 9 colunas compactas com texto viram parede.
  assert.match(pagina, /!compact && conhecimentoDaEtapa/);
});
