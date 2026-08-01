/**
 * Contrato: TODA TROCA DE SENHA FECHA A PORTA ATRÁS DE SI.
 *
 * ── O QUE FOI MEDIDO, E CONTRA O QUE ESTA GUARDA APONTA ──────────────────────
 *
 * Até 2026-07-29 `scripts/check-password-recovery.mjs` cobrava um MECANISMO:
 * a página de reset não podia conter `supabase.auth.updateUser`. A justificativa
 * era que só o servidor aplicaria política de senha, revogaria sessões e
 * registraria a troca. Medido no projeto de homologação pozbrcsfthnhmnebfoxv em
 * 2026-07-29, com usuário descartável `pwd-` e DUAS sessões vivas:
 *
 *   1. A REVOGAÇÃO NÃO DEPENDE DO SERVIDOR. Uma única troca pelo caminho do
 *      navegador (PUT /auth/v1/user com a sessão de recuperação) levou as duas
 *      sessões antigas de GET /auth/v1/user = 200 para 403, e o refresh_token de
 *      200 para 400, SEM nenhum signOut. O GoTrue revoga sozinho. A suspeita de
 *      "a senha muda e o invasor continua dentro" está REFUTADA por medição.
 *
 *   2. O QUE SOBRA VIVA É A SESSÃO DE RECUPERAÇÃO. GET /auth/v1/user com ela
 *      respondeu 200 DEPOIS da troca (expires_in = 3600). Quem tem o link segue
 *      trocando a senha por ~1 h. Esta é a ponta solta real, e a antiga guarda
 *      não olhava para ela.
 *
 *   3. A POLÍTICA DO PROVEDOR É SÓ "6 CARACTERES". Via PUT /auth/v1/user foram
 *      ACEITAS (HTTP 200) as senhas "aaaaaa", "abc123", "12345678" e
 *      "senhasimples". Logo 12/128/3 existe apenas no código do Atlas, e VALIDAR
 *      ANTES de chamar o provedor é propriedade de segurança, não estilo.
 *
 * Apagar o caminho do navegador, como o mecanismo antigo exigia, não protegeria
 * nenhuma das três — e removeria o caminho que ainda funciona quando o cookie
 * `atlas-recovery-intent` (15 min) expira antes de o corretor digitar a senha,
 * enquanto a sessão de recuperação dura ~1 h.
 *
 * Provado que o conserto vale, nos DOIS lados: depois do signOut global a sessão
 * de recuperação foi a GET 403 / refresh 400, e o login com a senha NOVA seguiu
 * respondendo 200 — a guarda fecha o invasor sem barrar o dono da conta.
 *
 * ── POR QUE ESTE CONTRATO OLHA A FORMA, E NÃO EXECUTA ────────────────────────
 *
 * `handleSubmit` vive dentro de um componente de cliente: exige React, DOM e o
 * cliente do Supabase do navegador. Nesta sessão era proibido subir servidor
 * (`route-quarantine.mjs` admite uma execução por vez e havia outros agentes),
 * então a parte de navegador não foi executada — o que foi executado contra o
 * provedor está nos números acima. Para não repetir os erros já conhecidos, as
 * asserções (a) rodam sobre a fonte SEM COMENTÁRIOS, para não aprovar por uma
 * palavra solta nem reprovar por causa da frase que explica o problema; e
 * (b) ancoram na REGIÃO do envio, não em uma linha, para sobreviver a reflow.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const raiz = process.cwd();
const lerSemComentarios = (caminho) => {
  const source = readFileSync(resolve(raiz, caminho), "utf8");
  let out = "";
  let quote = null;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += next ?? ""; i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; continue; }
    if (c === "/" && next === "/") { while (i < source.length && source[i] !== "\n") i += 1; out += "\n"; continue; }
    if (c === "/" && next === "*") { i += 2; while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1; i += 1; continue; }
    out += c;
  }
  return out;
};

const pagina = lerSemComentarios("app/(auth)/reset-password/page.tsx");
const rota = lerSemComentarios("app/api/auth/password-reset/route.ts");
const contrato = JSON.parse(readFileSync(resolve(raiz, "config/password-recovery.json"), "utf8"));

function regiao(fonte, abre, fecha) {
  const inicio = fonte.indexOf(abre);
  assert.ok(inicio >= 0, `região não encontrada: ${abre}`);
  const fim = fonte.indexOf(fecha, inicio + abre.length);
  return fonte.slice(inicio, fim < 0 ? fonte.length : fim);
}

const envio = regiao(pagina, "async function handleSubmit", "return (");

test("a resposta da rota de troca nunca é engolida no navegador", () => {
  assert.match(envio, /\/api\/auth\/password-reset/, "o navegador precisa falar com a rota do servidor");
  assert.doesNotMatch(
    envio,
    /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/,
    "catch vazio na região de envio: a troca pode terminar sem registro e sem revogação, em silêncio",
  );
});

test("toda troca pelo navegador encerra a sessão de recuperação que sobrevive à troca", () => {
  assert.match(
    envio,
    /signOut\(\s*\{\s*scope:\s*"global"\s*\}\s*\)/,
    "medido: a sessão de recuperação responde 200 depois da troca; sem revogação explícita o link troca a senha por ~1 h",
  );
  assert.equal(contrato.invalidateSessionsAfterReset, "global");
});

test("a política 12/128/3 é aplicada antes de chamar o provedor, que aceita 6 caracteres", () => {
  const posPolitica = envio.indexOf("strength.valid");
  const posProvedor = envio.indexOf("auth.updateUser");
  assert.ok(posPolitica >= 0, "a região de envio precisa consultar a validação de política");
  if (posProvedor >= 0) {
    assert.ok(posPolitica < posProvedor, "o provedor foi chamado antes de a política ser aplicada");
  }
  assert.equal(contrato.passwordPolicy.minimumLength, 12);
  assert.equal(contrato.passwordPolicy.maximumLength, 128);
  assert.equal(contrato.passwordPolicy.minimumCharacterCategories, 3);
});

test("a rota continua exigindo o cookie de intenção e registrando a troca", () => {
  // Sem o cookie, qualquer sessão apenas logada trocaria a senha sem provar
  // recuperação e sem saber a senha atual. Afrouxar isto para "consertar" a
  // guarda anterior seria rebaixar a segurança.
  const verificacao = regiao(rota, "async function verifiedRecovery", "export async function GET");
  assert.match(verificacao, /RECOVERY_COOKIE/, "a verificação deixou de olhar o cookie de intenção");
  assert.match(verificacao, /return null/, "a verificação deixou de recusar quem não prova recuperação");
  assert.match(rota, /logger\.info\("auth\.recovery\.password_updated"/, "a troca pela rota precisa ficar registrada");
  assert.match(rota, /scope:\s*"global"/, "a rota precisa revogar sessões");
});
