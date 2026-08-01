/**
 * Contrato do REGISTRO DE CONSENTIMENTO — a tela não pode oferecer o que a
 * escrita vai negar.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * A regra "só a diretoria registra base legal" existia em DOIS lugares, com
 * derivações diferentes e FONTES diferentes:
 *
 *   servidor: papel = commercialRole || (role === "admin" ? "director" : role)
 *             lido de public.profiles
 *   tela:     papel = JWT.app_metadata.access_role ?? role
 *             lido do token da sessão
 *
 * MEDIDO em 2026-07-29, rodando as duas derivações sobre as linhas reais de
 * `profiles ⋈ auth.users` (fora os 17 @atlas-teste.local). Das 3 contas reais com
 * papel de diretoria, DUAS divergiam — inclusive a do DONO do produto:
 *
 *   role=manager  · commercial=manager  · jwt=director → servidor 403 · tela OFERECE
 *   role=director · commercial=manager  · jwt=director → servidor 403 · tela OFERECE
 *   role=admin    · commercial=director · jwt=admin    → os dois permitem
 *
 * Preço: 270 das 469 leads estão em `nao_perguntado`, e só `concedido` libera
 * envio para a CAPI. O elo que fecha o ciclo com a Meta ficava travado atrás de um
 * botão que convida e recusa.
 *
 * ── POR QUE NÃO BASTAVA ALINHAR AS DUAS ─────────────────────────────────────
 *
 * Alinhadas hoje, divergem amanhã: o claim do JWT só coincide com o perfil
 * enquanto ninguém troca um papel sem reemitir token. E dar precedência a claim
 * sobre perfil é a armadilha que já vazou dado entre empresas neste projeto.
 *
 * Então a tela parou de decidir: ela PERGUNTA ao `GET` da rota. Este contrato
 * guarda as duas metades — a regra (executando) e o fato de a tela não ter mais
 * derivação própria.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  podeRegistrarConsentimento,
  MOTIVO_SEM_REGISTRO,
} from "../../lib/crm/registro-de-consentimento.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

/**
 * SEM OS COMENTÁRIOS.
 *
 * Guarda que proíbe NOMEAR o problema reprova por causa do comentário que o
 * explica — aconteceu QUATRO vezes neste repositório em 2026-07-29, e o conserto
 * tentador é apagar a explicação junto com o defeito. Aqui as asserções negativas
 * olham só o CÓDIGO: o comentário pode (e deve) contar a história inteira.
 */
const semComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const rota = semComentarios(ler("app", "api", "v1", "crm", "leads", "meta-consent", "route.ts"));
const tela = semComentarios(ler("components", "crm", "meta-consent-control.tsx"));

/**
 * As três formas REAIS de perfil, medidas no banco. Não são exemplos inventados:
 * são as contas que existem, e a segunda é a do dono.
 */
const PERFIS_REAIS = [
  { nome: "ddcorretorsp@icloud.com", commercialRole: "manager", role: "manager", registra: false },
  { nome: "thiagoribasdavila@gmail.com (o dono)", commercialRole: "manager", role: "director", registra: false },
  { nome: "thiagoribasdavila@hotmail.com", commercialRole: "director", role: "admin", registra: true },
];

test("a regra decide igual para as três formas de perfil que existem no banco", () => {
  for (const p of PERFIS_REAIS) {
    assert.equal(
      podeRegistrarConsentimento(p),
      p.registra,
      `"${p.nome}" (commercial=${p.commercialRole}, role=${p.role}) deveria ${p.registra ? "" : "NÃO "}registrar`,
    );
  }
});

test("corretor não registra, e diretor registra — os dois lados", () => {
  // Sem o segundo, uma regra que devolve `false` para todo mundo passaria no
  // teste de "corretor não registra" e desligaria o consentimento do produto.
  assert.equal(podeRegistrarConsentimento({ commercialRole: "broker", role: "broker" }), false);
  assert.equal(podeRegistrarConsentimento({ commercialRole: "director", role: "director" }), true);
});

test("admin sem papel comercial continua registrando", () => {
  // O RBAC deste produto tem `admin` como papel-raiz. Traduzi-lo para "director"
  // (como o servidor fazia) perdia a informação de que ele é raiz.
  assert.equal(podeRegistrarConsentimento({ commercialRole: null, role: "admin" }), true);
});

test("papel desconhecido ou ausente NÃO registra", () => {
  // Falha fechada: base legal é declaração jurídica, e na dúvida não se declara.
  for (const p of [{}, { role: "" }, { commercialRole: "supervisor", role: "supervisor" }]) {
    assert.equal(podeRegistrarConsentimento(p), false, `${JSON.stringify(p)} não deveria registrar`);
  }
});

test("o servidor usa a regra compartilhada, não uma derivação própria", () => {
  assert.match(rota, /podeRegistrarConsentimento\(identity\.access\.profile\)/,
    "a rota precisa CHAMAR a regra, não reimplementá-la");
  assert.doesNotMatch(rota, /commercialRole\s*\|\|\s*\(/,
    "a derivação de papel escrita à mão voltou para dentro da rota");
  assert.match(rota, /export async function GET/,
    "sem o GET a tela volta a ter de adivinhar");
});

test("e a TELA não decide mais — ela pergunta", () => {
  /**
   * Esta é a metade que fecha a classe. Enquanto a tela puder derivar o papel
   * sozinha, ela vai divergir do servidor em algum ponto, e o modo de falha é o
   * pior: oferecer e recusar.
   */
  assert.doesNotMatch(tela, /app_metadata/,
    "a tela voltou a ler o claim do JWT para decidir — foi exatamente o defeito");
  assert.doesNotMatch(tela, /access_role/,
    "a tela voltou a derivar papel do token");
  assert.match(tela, /podeRegistrar/,
    "a tela precisa consumir a decisão do servidor");
  assert.match(tela, /const editavel = podeEditar \?\? podeRegistrar \?\? false/,
    "na dúvida, NÃO oferecer: o `?? false` é o que impede o botão de convidar sem poder");
});

test("a recusa tem UMA redação, usada na tela e no 403", () => {
  // Duas redações da mesma recusa é como o usuário aprende que o produto não
  // sabe o que está fazendo.
  assert.ok(MOTIVO_SEM_REGISTRO.length > 30, "o motivo precisa explicar, não só negar");
  assert.match(rota, /MOTIVO_SEM_REGISTRO/, "o 403 precisa usar a frase compartilhada");
  assert.match(rota, /motivo: podeRegistrar \? null : MOTIVO_SEM_REGISTRO/,
    "o GET precisa devolver o motivo, senão o botão cinza não tem como se explicar");
});
