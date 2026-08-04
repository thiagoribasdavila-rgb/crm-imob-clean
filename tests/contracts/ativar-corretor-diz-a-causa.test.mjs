/**
 * CONTRATO: ativar e desativar não são simétricos, e a recusa diz a causa.
 *
 * ── O que foi medido em 03/08/2026 ────────────────────────────────────────
 *
 * O gatilho `private.validate_commercial_hierarchy`, no banco vivo, começa
 * assim:
 *
 *     if not new.active then return new; end if;
 *
 * DESATIVAR não valida nada. ATIVAR valida a cadeia RBAC inteira. O botão da
 * tela parece simétrico e não é: um corretor pode ser desligado a qualquer
 * momento e ficar preso fora do sistema se, nesse meio-tempo, o supervisor dele
 * foi desativado.
 *
 * E a rota mapeava TODAS as recusas para uma frase só — "confira o responsável
 * direto escolhido" — enquanto o gatilho levanta SEIS exceções distintas. Em
 * quatro delas o responsável direto não tem nada a ver com o problema.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { traduzirRecusaDaHierarquia, ativarExigeHierarquiaValida } from "../../lib/crm/recusa-da-hierarquia.ts";

/* ── A ASSIMETRIA, DECLARADA ─────────────────────────────────────────────── */

test("desativar não exige hierarquia válida; ativar exige", () => {
  assert.equal(ativarExigeHierarquiaValida(false), false, "o gatilho retorna antes de validar quando active=false");
  assert.equal(ativarExigeHierarquiaValida(true), true);
});

/* ── A RECUSA QUE MAIS ENGANA ────────────────────────────────────────────── */

test("supervisor inativo aponta para OUTRO perfil — campo null, não reportsTo", () => {
  const r = traduzirRecusaDaHierarquia('erro: supervisor_outside_organization_or_inactive');
  assert.equal(r.codigo, "RESPONSAVEL_INATIVO");
  assert.equal(r.campo, null, "o conserto não está neste formulário: está no perfil do gestor desligado");
  assert.match(r.mensagem, /Reative o responsável primeiro/i);
  assert.match(r.mensagem, /prende a equipe dele/i, "quem lê precisa entender a armadilha, não só o sintoma");
});

/* ── CADA CAUSA COM SEU CÓDIGO ───────────────────────────────────────────── */

test("as seis causas do gatilho têm códigos distintos", () => {
  const casos = [
    ["rbac_role_required", "PAPEL_AUSENTE"],
    ["executive_role_requires_root_scope", "EXECUTIVO_COM_SUPERVISOR"],
    ["valid_supervisor_required", "SEM_RESPONSAVEL"],
    ["supervisor_outside_organization_or_inactive", "RESPONSAVEL_INATIVO"],
    ["operational_director_requires_decision_director", "DIRETOR_OPERACIONAL_SEM_DECISOR"],
    ["broker_requires_operational_director", "CORRETOR_SEM_DIRETOR"],
  ];
  const vistos = new Set();
  for (const [bruto, esperado] of casos) {
    const r = traduzirRecusaDaHierarquia(`P0001: ${bruto}`);
    assert.ok(r, `"${bruto}" precisa ser reconhecida`);
    assert.equal(r.codigo, esperado);
    vistos.add(r.codigo);
  }
  assert.equal(vistos.size, casos.length, "códigos repetidos voltariam a colapsar causas diferentes numa só");
});

test("corretor sem diretor manda mexer no responsável, e diz o porquê", () => {
  const r = traduzirRecusaDaHierarquia("broker_requires_operational_director");
  assert.equal(r.campo, "reportsTo");
  assert.match(r.mensagem, /diretor operacional/i);
});

test("executivo com supervisor manda REMOVER o responsável, não trocá-lo", () => {
  const r = traduzirRecusaDaHierarquia("executive_role_requires_root_scope");
  assert.match(r.mensagem, /NENHUM responsável|Remova o responsável/i);
});

/* ── O QUE NÃO SE INVENTA ────────────────────────────────────────────────── */

test("recusa desconhecida devolve null — para a rota mostrar o erro ORIGINAL", () => {
  // Inventar explicação para causa desconhecida é exatamente como a rota passou
  // a culpar o responsável direto por tudo.
  assert.equal(traduzirRecusaDaHierarquia("erro esquisito do postgres 42P01"), null);
  assert.equal(traduzirRecusaDaHierarquia(""), null);
  assert.equal(traduzirRecusaDaHierarquia(null), null);
});

test("a marca é casada por SUBSTRING — o PostgREST embrulha a mensagem", () => {
  const embrulhado = 'unexpected: {"code":"P0001","message":"broker_requires_operational_director","details":null}';
  assert.equal(traduzirRecusaDaHierarquia(embrulhado)?.codigo, "CORRETOR_SEM_DIRETOR");
});
