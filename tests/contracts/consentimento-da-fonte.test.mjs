/**
 * Contrato: TODA LEAD NASCE COM A MESMA REGRA DE CONSENTIMENTO.
 *
 * ── O defeito que isto fixa ─────────────────────────────────────────────────
 *
 * Existem dois caminhos para uma lead nascer neste produto:
 *
 *   · webhook da Meta → fila (`/api/v2/outbox/process`) — aplicava a regra;
 *   · importação de arquivo (`/api/v1/leads/import`)   — criava a lead SEM
 *     `metadata` nenhum: sem consentimento, sem formulário, sem origem.
 *
 * Foi assim que 173 das 199 leads entraram. Elas só têm base legal porque
 * alguém registrou em lote depois.
 *
 * É a TERCEIRA vez que essa forma de defeito aparece: dois caminhos para o mesmo
 * fato, um completo e o outro pela metade (ver `move.id` do pipeline e as duas
 * tabelas do desfazer). Por isso o contrato não olha só o resultado — olha se a
 * regra continua morando num lugar SÓ.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const fonte = ler("lib", "crm", "meta-consent.ts");
const m = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`);

test("fonte com cláusula concede, e a origem é o formulário", () => {
  // A base já existia antes de o CRM tocar no assunto: a pessoa aceitou dentro
  // da Meta. Não é alguém afirmando depois, em nome dela.
  const r = m.consentimentoDaFonte({ conversion_sharing_enabled: true, consent_basis: "clausula_x", name: "Arvo v5" });
  assert.equal(r.estado, "concedido");
  assert.equal(r.origem, "formulario_meta");
  assert.equal(r.dataSharingConsent, true);
  assert.equal(r.consentBasis, "clausula_x");
});

test("fonte SEM cláusula não ganha base legal por tabela", () => {
  // Formulário sem a cláusula não herda base por estar no mesmo sistema que
  // outro que tem. É o erro que uma fiscalização procura.
  for (const f of [{ conversion_sharing_enabled: false }, { conversion_sharing_enabled: null }, {}, null, undefined]) {
    const r = m.consentimentoDaFonte(f);
    assert.equal(r.estado, "nao_perguntado", `fonte ${JSON.stringify(f)} concedeu sem cláusula`);
    assert.equal(r.dataSharingConsent, false);
    assert.notEqual(r.origem, "formulario_meta", "só a Meta pode ser origem quando a base veio de lá");
    assert.equal(r.consentBasis, null, "sem cláusula não há base a citar");
  }
});

test("o estado gravado é lido de volta igual", () => {
  // Ida e volta: o que `consentimentoDaFonte` decide tem que sobreviver ao
  // `aplicarConsentimento` e ser lido pelo `lerEstado`. Divergir aqui faz a
  // lead ter consentimento no banco e aparecer sem na tela.
  for (const temClausula of [true, false]) {
    const c = m.consentimentoDaFonte({ conversion_sharing_enabled: temClausula });
    const metadata = m.aplicarConsentimento({}, { estado: c.estado, origem: c.origem, registradoPor: "quem" });
    assert.equal(m.lerEstado(metadata), c.estado);
  }
});

test("a importação aplica a MESMA função, não uma cópia da regra", () => {
  // O defeito original foi a importação ter (ou não ter) sua própria versão.
  const importacao = ler("app", "api", "v1", "leads", "import", "route.ts");
  assert.match(importacao, /import \{ consentimentoDaFonte \} from "@\/lib\/crm\/meta-consent"/);
  assert.match(importacao, /const consentimento = consentimentoDaFonte\(fonte\)/);
  assert.match(importacao, /metadata: metadataDaImportacao/,
    "o metadata precisa entrar no insert, senão a lead nasce sem nada de novo");
});

test("a importação consulta a fonte pelo formulário informado", () => {
  const importacao = ler("app", "api", "v1", "leads", "import", "route.ts");
  assert.match(importacao, /from\("meta_lead_sources"\)/);
  assert.match(importacao, /\.eq\("organization_id", org\)\.eq\("form_id", formId\)/,
    "buscar por form_id sem prender à organização vazaria base legal entre empresas");
});

test("sem formulário informado, a lead nasce sem base legal — e isso é correto", () => {
  // Planilha de origem desconhecida não vira consentimento. A tela mostra
  // "não perguntado" e o diretor resolve.
  const importacao = ler("app", "api", "v1", "leads", "import", "route.ts");
  assert.match(importacao, /const formId = typeof body\?\.formId === "string"/);
  assert.match(importacao, /: \{ data: null \}/, "sem formId, não consulta fonte nenhuma");
});

test("a razão de o campo ser opcional está escrita junto dele", () => {
  const importacao = ler("app", "api", "v1", "leads", "import", "route.ts");
  assert.match(importacao, /Opcional de prop[óo]sito/i,
    "sem a explicação, alguém torna formId obrigatório e quebra a importação de base histórica");
});
