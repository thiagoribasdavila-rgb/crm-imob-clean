/**
 * Contrato do BASELINE DE CONVERSÃO — e da recusa a chamá-lo de previsão.
 *
 * A auditoria deu 3,0/10 para análise preditiva: "existe pontuação, não existe
 * modelo". `conversion_feature_snapshots` tinha 0 linhas, e `score_ia`
 * correlaciona r ≈ 0,88 com `data_quality_percent` — completude de cadastro com
 * outro nome. Com 1 venda em 483 leads, nada pode ser treinado nem avaliado.
 *
 * Este contrato guarda as duas coisas que importam: que a aritmética tem a
 * direção certa, e que ela SE RECUSA a afirmar acurácia sem base.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  avaliarBaseline, aferirBaseline, TAXA_BASE_MEDIDA, DESFECHOS_PARA_AFIRMAR, VERSAO_DO_BASELINE,
} from "../../lib/ai/baseline-de-conversao.ts";

const lead = (extra = {}) => ({ idadeDias: 1, tevePrimeiroContato: false, etapaAlcancada: "novo", origem: "meta", temDono: true, ...extra });

test("probabilidade nunca é 0 nem 1 — este baseline não tem direito a certeza", () => {
  const pior = avaliarBaseline(lead({ idadeDias: 9999, etapaAlcancada: "novo", temDono: false }));
  const melhor = avaliarBaseline(lead({ etapaAlcancada: "contrato", tevePrimeiroContato: true }));
  assert.ok(pior.probabilidade > 0 && pior.probabilidade < 1);
  assert.ok(melhor.probabilidade > 0 && melhor.probabilidade < 1);
});

test("quem chegou à proposta é mais provável que quem está em novo", () => {
  const novo = avaliarBaseline(lead({ etapaAlcancada: "novo" }));
  const proposta = avaliarBaseline(lead({ etapaAlcancada: "proposta" }));
  assert.ok(proposta.probabilidade > novo.probabilidade);
});

test("primeiro contato aumenta; a ausência dele reduz", () => {
  assert.ok(avaliarBaseline(lead({ tevePrimeiroContato: true })).probabilidade
          > avaliarBaseline(lead({ tevePrimeiroContato: false })).probabilidade);
});

test("lead sem dono vale menos — é afirmação sobre o processo, não sobre o cliente", () => {
  assert.ok(avaliarBaseline(lead({ temDono: false })).probabilidade
          < avaliarBaseline(lead({ temDono: true })).probabilidade);
});

test("lead de 69 dias vale menos que lead de hoje", () => {
  assert.ok(avaliarBaseline(lead({ idadeDias: 69 })).probabilidade
          < avaliarBaseline(lead({ idadeDias: 0 })).probabilidade);
});

test("cada parcela vem com peso e com o PORQUÊ — número sem explicação não se discute", () => {
  const a = avaliarBaseline(lead());
  assert.ok(a.parcelas.length >= 3);
  for (const p of a.parcelas) {
    assert.ok(Number.isFinite(p.peso));
    assert.ok(p.porque.length > 30, `parcela ${p.fator} sem explicação utilizável`);
  }
});

test("etapa desconhecida não quebra nem inventa peso — cai no neutro", () => {
  const desconhecida = avaliarBaseline(lead({ etapaAlcancada: "etapa-que-nao-existe" }));
  const nova = avaliarBaseline(lead({ etapaAlcancada: "novo" }));
  assert.equal(desconhecida.probabilidade, nova.probabilidade);
});

test("a versão do baseline viaja junto — comparar previsões de versões diferentes é erro", () => {
  assert.equal(avaliarBaseline(lead()).versaoDoBaseline, VERSAO_DO_BASELINE);
});

// ── A RECUSA, que é o coração deste arquivo ─────────────────────────────────

test("sem desfecho nenhum, a aferição RECUSA e diz por quê", () => {
  const a = aferirBaseline([]);
  assert.equal(a.afirmavel, false);
  assert.equal(a.brier, null);
  assert.match(a.porqueNaoAfirmavel, /Nenhum desfecho conhecido/i);
});

test("com 1 conversão a aferição RECUSA — a próxima venda mudaria tudo em mais de 100%", () => {
  const muitos = Array.from({ length: 200 }, () => ({ probabilidadePrevista: 0.01, converteu: false }));
  const a = aferirBaseline([...muitos, { probabilidadePrevista: 0.5, converteu: true }]);
  assert.equal(a.desfechos, 201);
  assert.equal(a.convertidas, 1);
  assert.equal(a.afirmavel, false, "afirmou acurácia sobre um único desfecho positivo");
  assert.match(a.porqueNaoAfirmavel, /menos de 2 desfechos positivos/i);
});

test("com amostra pequena a aferição RECUSA mesmo com 2 conversões", () => {
  const a = aferirBaseline([{ probabilidadePrevista: 0.5, converteu: true }, { probabilidadePrevista: 0.5, converteu: true }]);
  assert.equal(a.afirmavel, false);
  assert.match(a.porqueNaoAfirmavel, new RegExp(String(DESFECHOS_PARA_AFIRMAR)));
});

test("com base suficiente ela AFIRMA — sem este caso, a recusa seria um 'nunca'", () => {
  const dados = Array.from({ length: DESFECHOS_PARA_AFIRMAR }, (_, i) => ({ probabilidadePrevista: i < 5 ? 0.6 : 0.02, converteu: i < 5 }));
  const a = aferirBaseline(dados);
  assert.equal(a.afirmavel, true);
  assert.equal(a.porqueNaoAfirmavel, null);
  assert.ok(a.brier !== null && a.brier >= 0 && a.brier <= 1);
});

test("o Brier do previsor TRIVIAL vem junto — sem o rival, 0,002 parece ótimo e não diz nada", () => {
  // Num evento raro, chutar sempre "não converte" já dá Brier baixíssimo.
  // Publicar o baseline sem o trivial ao lado seria vender sorte como mérito.
  const dados = Array.from({ length: DESFECHOS_PARA_AFIRMAR }, (_, i) => ({ probabilidadePrevista: i < 5 ? 0.6 : 0.02, converteu: i < 5 }));
  const a = aferirBaseline(dados);
  assert.ok(a.brierDaTaxaBase !== null);
  assert.notEqual(a.brier, a.brierDaTaxaBase);
});

test("Brier de acerto perfeito é 0 e de erro total é 1 — a métrica não está invertida", () => {
  const perfeito = aferirBaseline([{ probabilidadePrevista: 1, converteu: true }], 1);
  const errado = aferirBaseline([{ probabilidadePrevista: 0, converteu: true }], 1);
  assert.equal(perfeito.brier, 0);
  assert.equal(errado.brier, 1);
});

test("a taxa base é a MEDIDA nesta operação, não um número de mercado", () => {
  // 1 venda em 483 leads = 0,207%. Inventar "3% é o normal do setor" seria
  // inventar informação comercial.
  assert.ok(Math.abs(TAXA_BASE_MEDIDA - 1 / 483) < 0.0005);
});

// ── A UNIDADE, que custou 363 linhas ────────────────────────────────────────

test("a coluna do banco é PERCENTUAL e a escala aguenta evento raro", () => {
  // Medido em 31/07: com numeric(5,2), 363 das 370 linhas gravadas viraram
  // 0.00 — e zero não é "probabilidade baixa", é "certeza de que não
  // converte", exatamente o que `avaliarBaseline` se recusa a afirmar.
  const sql = readFileSync("supabase/migrations/20260731150000_probabilidade_rara_nao_pode_virar_zero.sql", "utf8");
  assert.match(sql, /numeric\(9,\s*6\)/);
  assert.match(sql, /ROLLBACK/i);
});

test("o worker converte fração → percentual na gravação e percentual → fração na leitura", () => {
  // As duas conversões vivem no MESMO arquivo, coladas. Unidade que muda em
  // lugares distantes é como esta base já perdeu 363 linhas.
  const rota = readFileSync("app/api/v2/ai/baseline-de-conversao/process/route.ts", "utf8");
  assert.match(rota, /avaliacao\.probabilidade \* 100/);
  assert.match(rota, /prevista \/ 100/);
});

test("o worker exige ATLAS_CRON_SECRET, falha FECHADO e não escreve em leads", () => {
  const rota = readFileSync("app/api/v2/ai/baseline-de-conversao/process/route.ts", "utf8");
  assert.match(rota, /if\s*\(\s*!esperado\s*\|\|/);
  assert.doesNotMatch(rota, /from\("leads"\)[\s\S]{0,120}\.(update|insert|upsert|delete)\(/);
});

test("o snapshot do worker não tem autor humano, e isso é declarado", () => {
  const sql = readFileSync("supabase/migrations/20260731140000_snapshot_de_conversao_sem_autor_humano.sql", "utf8");
  assert.match(sql, /drop not null/i);
  assert.match(sql, /ROLLBACK/i);
  // O rollback precisa apagar as linhas do worker antes de repor o not null,
  // senão ele falha — e um rollback que não roda não é rollback.
  assert.match(sql, /delete from public\.conversion_feature_snapshots where created_by is null/i);
});
