/**
 * Contrato: RECUSA DE ACESSO NUNCA É 500.
 *
 * ── O defeito que isto fixa ─────────────────────────────────────────────────
 *
 * Todo usuário criado depois do primeiro nasce `active = false` — o gatilho
 * `handle_new_auth_user` faz `active = primeiro_perfil`. É trava de segurança
 * correta: ninguém entra sozinho numa empresa e começa a trabalhar.
 *
 * Mas as 51 rotas que usam `requireApiIdentity` escolhem o status HTTP testando
 * PALAVRAS da mensagem de erro. "Perfil inativo." não continha nenhuma delas, e
 * caía no `: 500` de todas.
 *
 * Medido na varredura: o corretor recém-criado recebia HTTP 500 em 7 rotas.
 * "O servidor quebrou" quando a verdade era "seu acesso não foi liberado" —
 * e ninguém procura o diretor por causa de um erro de servidor.
 *
 * ── Por que o teste é assim ─────────────────────────────────────────────────
 *
 * Não dá para afirmar o status sem subir servidor. Dá para afirmar o que o
 * produz: que toda recusa carregue uma palavra que as rotas reconhecem. É a
 * junta frouxa entre `api-auth` e as rotas — e junta frouxa sem contrato é onde
 * o defeito volta.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const auth = fs.readFileSync(path.join(raiz, "lib", "security", "api-auth.ts"), "utf8");

/** As palavras que as rotas testam para escolher 401/403 em vez de 500. */
const RECONHECIDAS = /token|sess[ãa]o|autentica[çc][ãa]o|autoriz|organiza[çc][ãa]o|escopo/i;

/** Recusa que é MESMO falha de servidor: o ambiente está mal configurado. */
const DE_SERVIDOR = /Supabase p[úu]blico n[ãa]o configurado/;

function recusas(fonte) {
  return [...fonte.matchAll(/deny\(request,\s*"([^"]+)"\)/g)].map((m) => m[1]);
}

test("toda recusa de acesso é reconhecível pelas rotas", () => {
  const todas = recusas(auth);
  assert.ok(todas.length >= 8, `esperava ao menos 8 recusas, achei ${todas.length}`);
  for (const mensagem of todas) {
    if (DE_SERVIDOR.test(mensagem)) continue;
    assert.match(mensagem, RECONHECIDAS,
      `"${mensagem}" não contém palavra que as rotas reconhecem — vira HTTP 500 nas 51 rotas`);
  }
});

test("perfil inativo diz O QUE FAZER, não só o que é", () => {
  // "Perfil inativo." é diagnóstico. Quem lê não sabe se espera, se recarrega,
  // se ligou para a pessoa errada. A mensagem tem que nomear quem resolve.
  const inativo = recusas(auth).find((m) => /acesso ainda n[ãa]o foi autorizado/i.test(m));
  assert.ok(inativo, "a recusa de perfil inativo sumiu ou mudou de texto");
  assert.match(inativo, /diretor/i, "precisa nomear quem resolve");
  assert.match(inativo, /Usu[áa]rios/, "precisa dizer onde");
});

test("perfil ausente também aponta quem cria", () => {
  const ausente = recusas(auth).find((m) => /perfil comercial autorizado/i.test(m));
  assert.ok(ausente, "a recusa de perfil ausente sumiu ou mudou de texto");
  assert.match(ausente, /diretor/i);
});

test("a razão do gatilho está escrita junto da regra", () => {
  // Sem isto, o próximo a ler acha que perfil inativo é bug e "conserta"
  // ativando todo mundo — que é justamente o que a trava impede.
  assert.match(auth, /active = primeiro_perfil|primeiro usu[áa]rio|handle_new_auth_user/,
    "explicar POR QUE o usuário nasce inativo evita que alguém remova a trava");
});

test("nenhuma rota devolve 500 para falta de permissão", () => {
  // A régua nas rotas: quem testa a mensagem para escolher o status precisa
  // incluir `autoriz`, senão as recusas novas voltam a cair no 500.
  const rotas = [];
  (function varrer(dir) {
    for (const nome of fs.readdirSync(dir)) {
      const completo = path.join(dir, nome);
      if (fs.statSync(completo).isDirectory()) varrer(completo);
      else if (nome === "route.ts") rotas.push(completo);
    }
  })(path.join(raiz, "app", "api"));

  const frouxas = [];
  for (const arquivo of rotas) {
    const fonte = fs.readFileSync(arquivo, "utf8");
    for (const m of fonte.matchAll(/\/([^/\n]*(?:sess|token|autoriz|autentica)[^/\n]*)\/i\.test\(\s*message\s*\)/g)) {
      // Se a rota decide status pela mensagem, tem que reconhecer TODAS as
      // famílias de recusa que `api-auth` produz. Exigir só `autoriz` deixava
      // "Organização inativa.", "Organização não encontrada." e "Usuário sem
      // organização vinculada." caindo no 500 de 14 rotas — sete delas da ficha
      // da lead, que a tela chama. Achado por auditoria adversarial depois de
      // eu ter declarado o problema resolvido.
      const faltando = ["autoriz", "organiza"].filter((palavra) => !m[1].includes(palavra));
      if (faltando.length) {
        frouxas.push(`${path.relative(raiz, arquivo)}: /${m[1]}/i — não reconhece ${faltando.join(", ")}`);
      }
    }
  }
  assert.deepEqual(frouxas, [],
    `estas rotas mandam recusa de autorização para 500:\n${frouxas.join("\n")}`);
});
