/**
 * CONTRATO: o cadastro do corretor normaliza antes de gravar.
 *
 * ── O que estava pronto e parado ──────────────────────────────────────────
 *
 * Medido em 03/08/2026: `profiles` já tinha `avatar_url`, `phone`, `creci` e
 * `bio`; o bucket `profile-avatars` existia desde 22/07, público, com política
 * de envio por pasta do próprio usuário. E:
 *
 *     26 perfis · 0 com foto · 0 com telefone · 0 com CRECI · 0 com bio
 *     0 arquivos no bucket
 *
 * Nada estava quebrado. Faltava o formulário. É a forma mais cara de
 * "construído e nunca ligado", porque tudo parecia pronto.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarTelefone, formatarTelefone, validarCreci, validarBio,
  validarNomeCompleto, validarFoto, caminhoDaFoto, validarCadastro,
  TAMANHO_MAXIMO_DA_FOTO, LIMITE_DA_BIO,
} from "../../lib/crm/cadastro-do-corretor.ts";

/* ── TELEFONE: DÍGITOS, PORQUE FORMATAÇÃO CRIA DUPLICATA ─────────────────── */

test("três formatações do mesmo número chegam ao mesmo valor gravado", () => {
  // A base já tem o mesmo telefone em três formas — é assim que a regra de
  // contato único deixa passar duplicata.
  const formas = ["(11) 98765-4321", "11987654321", "+55 11 98765-4321"];
  const gravados = formas.map((f) => validarTelefone(f).valor);
  assert.deepEqual(new Set(gravados), new Set(["11987654321"]));
});

test("fixo com 10 dígitos é aceito; celular com 11 exige o nono", () => {
  assert.equal(validarTelefone("1133334444").valor, "1133334444");
  const r = validarTelefone("11887654321");
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /começar com 9/);
});

test("telefone vazio é LEGÍTIMO — o cadastro é gradual", () => {
  assert.deepEqual(validarTelefone(""), { ok: true, valor: null });
  assert.deepEqual(validarTelefone(null), { ok: true, valor: null });
});

test("formatar é só para mostrar — nunca é o que se guarda", () => {
  assert.equal(formatarTelefone("11987654321"), "(11) 98765-4321");
  assert.equal(formatarTelefone("1133334444"), "(11) 3333-4444");
});

/* ── CRECI: MIL FORMAS, UM REGISTRO ──────────────────────────────────────── */

test("as formas que o corretor escreve chegam todas ao mesmo CRECI", () => {
  for (const escrito of ["123456-F/SP", "creci 123456 sp", "CRECI: 123456 - SP", "123456/SP"]) {
    assert.equal(validarCreci(escrito).valor, "123456-SP", `falhou para "${escrito}"`);
  }
});

test("CRECI sem UF é recusado — número sozinho não identifica registro", () => {
  const r = validarCreci("123456");
  assert.equal(r.ok, false);
  assert.equal(r.campo, "creci");
  assert.match(r.mensagem, /UF/);
});

test("CRECI vazio é legítimo", () => {
  assert.deepEqual(validarCreci("  "), { ok: true, valor: null });
});

/* ── APRESENTAÇÃO ────────────────────────────────────────────────────────── */

test("a bio colapsa espaços e aceita até o limite exato", () => {
  assert.equal(validarBio("  Especialista   em\n Perdizes  ").valor, "Especialista em Perdizes");
  assert.equal(validarBio("a".repeat(LIMITE_DA_BIO)).ok, true, "o limite exato PASSA — recusar nele é fora por um");
});

test("bio acima do limite recusa dizendo QUANTO passou", () => {
  const r = validarBio("a".repeat(LIMITE_DA_BIO + 25));
  assert.equal(r.ok, false);
  assert.equal(r.campo, "bio");
  assert.match(r.mensagem, new RegExp(String(LIMITE_DA_BIO + 25)), "sem o número, a pessoa apaga no escuro");
});

/* ── NOME: É O QUE A LEAD VÊ ─────────────────────────────────────────────── */

test("nome sem sobrenome é recusado, e a mensagem diz o porquê", () => {
  const r = validarNomeCompleto("Luciano");
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /é o que a lead vê/);
});

test("espaços repetidos colapsam — 'Luciano  Silva' e 'Luciano Silva' são um nome", () => {
  assert.equal(validarNomeCompleto("  Luciano   Pereira  ").valor, "Luciano Pereira");
});

/* ── A FOTO ──────────────────────────────────────────────────────────────── */

test("foto de celular acima de 2 MB é recusada ANTES de subir", () => {
  const r = validarFoto({ type: "image/jpeg", size: TAMANHO_MAXIMO_DA_FOTO + 1 });
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /2 MB/);
  assert.match(r.mensagem, /celular/, "quem lê precisa saber por que a foto dele passou");
});

test("PDF disfarçado de foto não passa", () => {
  assert.equal(validarFoto({ type: "application/pdf", size: 1000 }).ok, false);
  assert.equal(validarFoto({ type: "image/gif", size: 1000 }).ok, false);
});

test("arquivo vazio é recusado — 0 byte sobe sem erro e some", () => {
  assert.equal(validarFoto({ type: "image/png", size: 0 }).ok, false);
});

test("JPG, PNG e WEBP passam", () => {
  for (const tipo of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(validarFoto({ type: tipo, size: 500_000 }).ok, true, tipo);
  }
});

/* ── O CAMINHO NO BUCKET É REGRA DO BANCO, NÃO ESCOLHA ───────────────────── */

test("a pasta é o id do usuário — a política do storage exige exatamente isso", () => {
  // `storage.foldername(name)[1] = auth.uid()`. Qualquer outro caminho é
  // recusado, e o erro que volta não fala em pasta.
  const id = "9f1c2b3a-0000-4444-8888-aaaabbbbcccc";
  assert.equal(caminhoDaFoto(id, "image/png"), `${id}/avatar.png`);
  assert.equal(caminhoDaFoto(id, "image/webp"), `${id}/avatar.webp`);
  assert.equal(caminhoDaFoto(id, "image/jpeg"), `${id}/avatar.jpg`);
});

test("o nome do arquivo é fixo — trocar a foto SUBSTITUI, não acumula", () => {
  const id = "abc";
  assert.equal(caminhoDaFoto(id, "image/jpeg"), caminhoDaFoto(id, "image/jpeg"));
});

/* ── O CADASTRO INTEIRO ──────────────────────────────────────────────────── */

test("grava `name` e `full_name` com o MESMO valor", () => {
  // As duas colunas convivem nesta base e metade das telas lê uma, metade a
  // outra. Divergir aqui dá dois nomes para a mesma pessoa.
  const r = validarCadastro({ fullName: "Luciano Pereira", phone: "(11) 98765-4321", creci: "123456/SP", bio: "  Especialista   em Perdizes " });
  assert.equal(r.ok, true);
  assert.equal(r.valor.name, r.valor.full_name);
  assert.equal(r.valor.phone, "11987654321");
  assert.equal(r.valor.creci, "123456-SP");
  assert.equal(r.valor.bio, "Especialista em Perdizes");
});

test("devolve a PRIMEIRA recusa, com o campo nomeado", () => {
  // Cinco erros de uma vez fazem a pessoa consertar tudo errado ao mesmo tempo.
  const r = validarCadastro({ fullName: "Luciano", phone: "999", creci: "x", bio: "a".repeat(LIMITE_DA_BIO + 1) });
  assert.equal(r.ok, false);
  assert.equal(r.campo, "full_name", "a ordem importa: o nome vem primeiro");
});

test("cadastro mínimo passa: só nome completo", () => {
  const r = validarCadastro({ fullName: "Luciano Pereira", phone: "", creci: "", bio: "" });
  assert.equal(r.ok, true);
  assert.deepEqual([r.valor.phone, r.valor.creci, r.valor.bio], [null, null, null]);
});
