/**
 * Contrato de `/api/version` — a rota que responde "o que está no ar".
 *
 * NASCEU DE UM INCIDENTE REAL, em 31/07/2026. A produção subiu sem as variáveis
 * do Supabase; `/api/v1/ready` — que consulta o banco — passou a responder
 * `banco_fora`, e a identidade da versão foi junto. Ficamos sem saber **o que**
 * estava no ar exatamente no momento em que isso mais importava.
 *
 * Daí a regra que este contrato guarda: a rota de versão **não pode depender de
 * nada que possa cair**.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rota = readFileSync("app/api/version/route.ts", "utf8");

/**
 * O CÓDIGO SEM OS COMENTÁRIOS.
 *
 * A primeira versão deste contrato reprovou a rota por conter a palavra
 * "unknown" — e ela estava no **comentário que explica por que "unknown" é
 * proibido**. O instrumento leu a explicação como se fosse a implementação.
 *
 * É a mesma classe que já mordeu esta base várias vezes: a busca não coleta o
 * que se acha que coleta. Asserção sobre comportamento tem de olhar código.
 */
const codigo = rota
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("não toca em banco, rede nem integração — se o processo subiu, ela responde", () => {
  assert.doesNotMatch(codigo, /getSupabaseAdmin|createClient|from\(["']/);
  assert.doesNotMatch(codigo, /fetch\(/);
  assert.doesNotMatch(codigo, /await /, "qualquer await abre a porta para a rota travar junto com uma dependência");
});

test("NÃO devolve 'unknown' — ausência é null, com o motivo escrito", () => {
  // "unknown" é uma string plausível ocupando o lugar de uma ausência, e é
  // assim que um deploy não rastreável passa despercebido.
  assert.doesNotMatch(codigo, /["']unknown["']/i);
  assert.match(rota, /commit: commit \|\| null/, "ausência precisa virar null, não string");
  assert.match(rota, /porqueNaoConfiavel/);
});

test("declara quando a identidade NÃO é confiável", () => {
  assert.match(rota, /identidadeConfiavel/);
  // Build de árvore suja não corresponde a commit nenhum do repositório.
  assert.match(rota, /arvore-suja/);
});

test("não vaza branch, caminho, usuário, máquina nem variável de ambiente", () => {
  for (const proibido of ["branch", "cwd", "hostname", "process.env.PATH", "USER", "HOME"]) {
    assert.ok(!codigo.includes(proibido), `a rota de versão não pode expor ${proibido}`);
  }
  // Só três variáveis de ambiente podem ser lidas, e nenhuma é segredo.
  const lidas = [...codigo.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(lidas)].sort(), ["ATLAS_BUILD_COMMIT", "ATLAS_BUILD_TIME", "NODE_ENV"].sort());
});

test("a rota é pública e está declarada como tal no contrato de segurança", () => {
  const contrato = JSON.parse(readFileSync("config/api-security-contract.json", "utf8"));
  assert.ok(contrato.publicRoutes.includes("app/api/version/route.ts"));
});

test("o build injeta a identidade — sem isso a rota nasce inútil", () => {
  // `next.config.ts` precisa inlinar: rotas de servidor leem process.env em
  // RUNTIME, e sem o bloco `env` o valor morre entre o build e a rota. Foi o
  // defeito de ATLAS_BUILD_MIGRATIONS em 30/07.
  assert.match(readFileSync("next.config.ts", "utf8"), /ATLAS_BUILD_COMMIT: process\.env\.ATLAS_BUILD_COMMIT/);
});
