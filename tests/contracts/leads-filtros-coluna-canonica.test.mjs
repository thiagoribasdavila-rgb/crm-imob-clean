/**
 * Contrato dos FILTROS DA TELA DE LEADS: nenhum filtro pode consultar coluna
 * vazia.
 *
 * Este projeto arrasta pares legado/canônico desde a migração para o V3:
 *
 *   legado            canônico          cobertura medida em 26/07/2026
 *   ────────────────  ────────────────  ──────────────────────────────
 *   project_id        development_id    0/217   vs  174/217
 *   next_contact      next_action_at    0/217   vs    9/217
 *   assigned_user_id  assigned_to     211/217   vs  213/217
 *
 * Cinco filtros da tela consultavam a coluna VAZIA e devolviam nada:
 * empreendimento, atrasadas, agendada, hoje e próximos 7 dias.
 *
 * **Filtro que devolve vazio é pior que filtro ausente.** Quem escolhe "Inside
 * Perdizes" e vê a lista limpar conclui que não há lead ali — e vai embora com
 * 174 leads sem atendimento atrás da tela.
 *
 * Rodar: node --test tests/contracts/leads-filtros-coluna-canonica.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const rota = fs.readFileSync(
  path.join(raiz, "app", "api", "v1", "crm", "leads", "route.ts"),
  "utf8",
);
// Comentários fora: este arquivo EXPLICA as colunas legadas em prosa, e um
// portão que lê prosa mede a documentação em vez do comportamento.
const codigo = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("o filtro por empreendimento não consulta só a coluna legada", () => {
  assert.ok(
    !/query = query\.eq\("project_id", developmentId\)/.test(codigo),
    "project_id está vazio em 217/217 — filtrar só por ele devolve zero com 174 leads dentro",
  );
  assert.match(
    codigo,
    /development_id\.eq\.\$\{developmentId\},project_id\.eq\.\$\{developmentId\}/,
    "as duas colunas precisam entrar: a base tem histórico nos dois lados",
  );
});

test("os filtros de próxima ação alcançam a coluna canônica", () => {
  assert.match(codigo, /const emAlgumaProxima = /,
    "falta o auxiliar que aplica a mesma condição às duas colunas");
  for (const filtro of ["overdue", "scheduled", "today", "next_7_days"]) {
    // Âncora na COMPARAÇÃO, e não no literal solto: `"overdue"` aparece antes,
    // na lista de valores aceitos, e ancorar ali media o lugar errado.
    const inicio = codigo.indexOf(`=== "${filtro}"`);
    assert.ok(inicio > 0, `o ramo do filtro "${filtro}" sumiu`);
    const trecho = codigo.slice(inicio, inicio + 260);
    assert.match(trecho, /emAlgumaProxima|janela\(/,
      `o filtro "${filtro}" precisa cobrir next_action_at, não só next_contact`);
  }
});

test('"sem próxima ação" exige as DUAS colunas vazias', () => {
  // Conferir só a legada devolveria a base inteira e continuaria dizendo
  // "sem ação" para quem acabou de agendar uma.
  assert.match(
    codigo,
    /query\.is\("next_action_at", null\)\.is\("next_contact", null\)/,
    "é AND das duas, não OR nem só a legada",
  );
});

test("nenhum filtro sobrou consultando next_contact sozinho", () => {
  const sozinho = [
    /query\.lt\("next_contact"/,
    /query\.gte\("next_contact"/,
    /query\.lte\("next_contact"/,
    /\.not\("next_contact", "is", null\)(?!\s*\))/,
  ].filter((padrao) => padrao.test(codigo));
  assert.deepEqual(
    sozinho.map(String),
    [],
    "sobrou filtro amarrado só à coluna legada — ele devolve zero nesta base",
  );
});

test("a janela de datas compara a MESMA coluna nos dois lados", () => {
  // `and(next_action_at.gte.X, next_contact.lte.Y)` misturaria as colunas e
  // devolveria lead cuja ação canônica começou na janela e cuja legada terminou
  // nela — um resultado que não corresponde a nada no mundo real.
  assert.match(
    codigo,
    /and\(\$\{c\}\.gte\.\$\{inicio\.toISOString\(\)\},\$\{c\}\.lte\.\$\{fim\.toISOString\(\)\}\)/,
    "as duas pontas da janela têm que usar a mesma coluna `c`",
  );
});
