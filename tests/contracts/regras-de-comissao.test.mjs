/**
 * Contrato da REGRA DE COMISSÃO.
 *
 * `opportunities.commission_*` e `commission_events` já existiam — com ZERO
 * linhas, e ambos sobre a APURAÇÃO de um negócio fechado. Nenhum dizia quem
 * ganha quanto, e `commission_split_percentage` é um número só: não cabe
 * "40% corretor, 10% gerente, 5% diretor, 45% imobiliária".
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const fonte = ler("lib", "crm", "commission-rules.ts");
const c = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`);

const regra = (e = {}) => ({
  id: "r1", escopo: "empreendimento",
  pctCorretor: 40, pctGerente: 10, pctDiretor: 5, pctImobiliaria: 45,
  premioValor: 0, premioObservacao: null, ...e,
});

test("a soma das partes bate com a comissão bruta", () => {
  const r = c.apurarRateio(regra(), 30000);
  assert.equal(r.corretor + r.gerente + r.diretor + r.imobiliaria, 30000);
  assert.equal(r.naoRateado, 0);
});

test("centavos não somem no arredondamento", () => {
  // Arredondar cada parcela, não o total: somar precisão infinita e arredondar
  // depois faz a soma das partes não bater com o todo, e é sempre no
  // contracheque de alguém que isso aparece.
  const r = c.apurarRateio(
    regra({ pctCorretor: 33.333, pctGerente: 33.333, pctDiretor: 33.334, pctImobiliaria: 0 }),
    10000,
  );
  assert.equal(Math.round((r.corretor + r.gerente + r.diretor) * 100) / 100, 10000);
});

test("o prêmio NÃO sai da comissão", () => {
  // Prêmio vem da incorporadora, por unidade, em outra data e outro extrato.
  const r = c.apurarRateio(regra({ premioValor: 2000 }), 30000);
  assert.equal(r.corretor + r.gerente + r.diretor + r.imobiliaria, 30000);
  assert.equal(r.premio, 2000);
});

test("percentual que não fecha 100% é DECLARADO, não escondido", () => {
  // Pode ser intencional (retenção, imposto) — mas tem que aparecer, senão
  // vira dinheiro que ninguém sabe de quem é.
  const g = regra({ pctImobiliaria: 40 });
  assert.equal(c.somaDosPercentuais(g), 95);
  assert.equal(c.apurarRateio(g, 30000).naoRateado, 1500);
  assert.match(c.avisoDaRegra(g), /não está atribuído a ninguém/);
});

test("regra coerente não gera aviso", () => {
  // Avisar sobre o que está certo treina a pessoa a ignorar o aviso.
  assert.equal(c.avisoDaRegra(regra()), null);
});

test("a ordem é empreendimento → incorporadora → padrão", () => {
  assert.match(fonte, /const porEmpreendimento[\s\S]{0,200}if \(porEmpreendimento\) return/);
  assert.match(fonte, /const porIncorporadora[\s\S]{0,200}if \(porIncorporadora\) return/);
  assert.match(fonte, /const padrao = linhas\.find/);
});

test("sem regra devolve null — e null NÃO é zero", () => {
  // Não saber quanto cada um ganha é diferente de saber que ninguém ganha
  // nada. O CRM não pode fingir que sabe.
  assert.match(fonte, /return padrao \? daLinha\(padrao\) : null;/);
  assert.match(fonte, /null NÃO é zero/);
});

test("uma consulta só, não três", () => {
  assert.equal([...fonte.matchAll(/\.from\("commission_rules"\)/g)].length, 1);
});

test("a migration está versionada com as travas", () => {
  const m = ler("supabase", "migrations", "20260727040000_regras_de_comissao.sql");
  assert.match(m, /constraint soma_ate_cem/, "rateio acima de 100% só apareceria no fechamento do mês");
  assert.match(m, /constraint escopo_coerente/, "regra com empreendimento E incorporadora teria duas leituras");
  assert.match(m, /numeric\(6,3\)/, "dinheiro não se calcula em ponto flutuante");
});
