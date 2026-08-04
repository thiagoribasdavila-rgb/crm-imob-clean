import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// CLASSE DE DEFEITO QUE ESTE CONTRATO TRANCA
//
// Havia DUAS formulas para normalizar o telefone de uma lead:
//   · private.apply_canonical_lead_contract  -> prefixa '55' quando tem 10 ou 11 digitos
//   · private.enforce_unique_lead_identity   -> NAO prefixava nada
// A guarda de unicidade procurava a chave num formato e o produto lia em
// outro. Medido em producao: 18 de 488 leads ja estavam gravadas sob um valor
// diferente do que a tela de duplicidades le, e 467 de 467 leads testaveis
// aceitavam um segundo cadastro da mesma pessoa so trocando o formato do
// numero. Duas leads, dois corretores, o mesmo cliente.
//
// O contrato aqui NAO confere se as duas formulas dao o mesmo resultado.
// Conferir empate entre copias e fraco: alguem edita uma copia e o empate
// volta a quebrar. O contrato exige que exista UMA formula so.

const DIR = 'supabase/migrations';

const arquivos = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();

function definicaoMaisRecente(nomeFuncao) {
  for (const arquivo of [...arquivos].reverse()) {
    const texto = readFileSync(join(DIR, arquivo), 'utf8');
    const marca = new RegExp(`function\\s+private\\.${nomeFuncao}\\s*\\(`, 'i');
    if (marca.test(texto)) {
      const inicio = texto.search(marca);
      // corpo entre o primeiro $$ depois da assinatura e o $$ que fecha
      const abre = texto.indexOf('$$', inicio);
      const fecha = texto.indexOf('$$', abre + 2);
      assert.ok(abre > -1 && fecha > -1, `corpo de ${nomeFuncao} nao delimitado em ${arquivo}`);
      return { arquivo, corpo: texto.slice(abre + 2, fecha) };
    }
  }
  assert.fail(`nenhuma migration define private.${nomeFuncao}`);
}

// Um normalizador de telefone e reconhecido por remover os nao-digitos do
// telefone. Se a guarda tiver o seu proprio, existem duas verdades de novo.
const FORMULA_PROPRIA = /regexp_replace\s*\(\s*(coalesce\s*\(\s*)?new\.phone\b/i;

test('a guarda de identidade nao tem formula propria de telefone', () => {
  const { arquivo, corpo } = definicaoMaisRecente('enforce_unique_lead_identity');
  assert.equal(
    FORMULA_PROPRIA.test(corpo), false,
    `${arquivo}: a guarda voltou a normalizar o telefone por conta propria. ` +
    'Ela deve LER new.phone_normalized, calculado pelo contrato canonico no mesmo comando.'
  );
});

test('a guarda le exatamente a coluna que o produto le', () => {
  const { arquivo, corpo } = definicaoMaisRecente('enforce_unique_lead_identity');
  assert.match(
    corpo, /new\.phone_normalized/,
    `${arquivo}: a guarda precisa comparar por new.phone_normalized, que e a mesma ` +
    'coluna usada por app/api/v1/leads/deduplication/route.ts e pela RPC merge_duplicate_lead_identity.'
  );
});

test('o contrato canonico segue sendo o unico a normalizar telefone', () => {
  const { arquivo, corpo } = definicaoMaisRecente('apply_canonical_lead_contract');
  assert.match(FORMULA_PROPRIA.test(corpo) ? 'sim' : 'nao', /^sim$/,
    `${arquivo}: o contrato canonico deixou de calcular phone_normalized; ` +
    'sem ele a guarda passa a comparar com nulo e para de bloquear qualquer coisa.');
  assert.match(corpo, /new\.phone_normalized\s*:=/i,
    `${arquivo}: o contrato precisa atribuir new.phone_normalized.`);
});

// A propriedade que o usuario sente: o mesmo numero, escrito de qualquer
// jeito, tem que virar UMA chave so. Porta fiel da formula do contrato.
function normalizar(telefone) {
  let digitos = String(telefone ?? '').replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  return digitos.length >= 10 && digitos.length <= 15 ? digitos : null;
}

test('o mesmo numero em formatos diferentes vira uma chave so', () => {
  const formatos = [
    '11973364099',
    '5511973364099',
    '+55 11 97336-4099',
    '(11) 97336-4099',
    '+55 (11) 97336 4099',
  ];
  const chaves = new Set(formatos.map(normalizar));
  assert.equal(
    chaves.size, 1,
    `formatos do mesmo telefone geraram ${chaves.size} chaves: ${[...chaves].join(', ')}. ` +
    'Cada chave a mais e uma lead duplicada que a guarda deixa entrar.'
  );
  assert.equal([...chaves][0], '5511973364099');
});

test('telefone curto ou vazio nao vira chave de identidade', () => {
  // Sem isto, leads sem telefone colidiriam todas na mesma chave vazia e a
  // guarda recusaria a segunda lead sem telefone da organizacao.
  for (const invalido of ['', null, undefined, '1234', '(11) 9733']) {
    assert.equal(normalizar(invalido), null, `${JSON.stringify(invalido)} nao pode virar chave`);
  }
});
