/**
 * CONTRATO: o limite da recuperação protege a caixa postal, não o IP.
 *
 * ── O defeito medido em 03/08/2026, contra a produção ─────────────────────
 *
 * Um corretor recém-criado não conseguia entrar. A rota respondia
 * `429 — "Muitas solicitações. Aguarde alguns minutos."`
 *
 * A cota era 5 por 15 minutos POR IP, com a chave vinda de `x-forwarded-for`.
 * Duas consequências, e as duas erradas:
 *
 *   · QUEM É LEGÍTIMO TRAVA. O SMTP embutido do Supabase tem limite próprio
 *     (1 envio a cada 57 segundos, visto no log como
 *     `over_email_send_rate_limit`). A pessoa não recebe, tenta de novo, e na
 *     quinta vez leva 429 — que ela lê como "o sistema está quebrado".
 *
 *   · QUEM QUER BURLAR, BURLA. Provado: a mesma chamada que devolvia 429 do
 *     meu IP passou com 202 mandando um `X-Forwarded-For` inventado. O
 *     cabeçalho vem de fora e ninguém o valida.
 *
 * O recurso escasso não é o IP: é a CAIXA POSTAL.
 *
 * ── Por que este contrato lê a FONTE da rota, e não uma função pura ───────
 *
 * A primeira versão testava `avaliarPedidoDeRecuperacao`, uma função pura que
 * ninguém chamava — a rota foi ligada direto em `checkRateLimit` (a ÚNICA
 * implementação de contagem do projeto), no MESMO commit que criou a função
 * pura. Testar a função provava a matemática de um código morto, não o que a
 * produção faz. Ver `lib/security/limite-de-recuperacao.ts` para o porquê da
 * remoção. Este contrato agora ancora na fonte da rota, no mesmo estilo de
 * `tests/contracts/troca-de-senha-nao-e-silenciosa.test.mjs`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fraseDoEnvioAceito, TENTATIVAS_POR_EMAIL, TENTATIVAS_POR_IP,
} from "../../lib/security/limite-de-recuperacao.ts";

const raiz = process.cwd();
const fonteRota = readFileSync(resolve(raiz, "app/api/auth/password-recovery/route.ts"), "utf8");

/**
 * Remove comentários (que explicam a mensagem de propósito, e por isso contêm
 * de forma legítima as palavras aqui checadas) antes de afirmar sobre o que o
 * CÓDIGO de fato envia. Mesma abordagem de troca-de-senha-nao-e-silenciosa.test.mjs.
 */
function semComentarios(source) {
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
}

const fonteRotaSemComentarios = semComentarios(fonteRota);

/* ── A CAIXA POSTAL É O QUE SE PROTEGE ───────────────────────────────────── */

test("a rota usa os números por E-MAIL importados deste módulo, não valores soltos", () => {
  assert.match(
    fonteRota,
    /import\s*\{[\s\S]{0,200}TENTATIVAS_POR_EMAIL[\s\S]{0,200}\}\s*from\s*"@\/lib\/security\/limite-de-recuperacao"/,
    "a rota precisa importar os números daqui, não reinventar",
  );
  assert.match(
    fonteRota,
    /checkRateLimit\(\s*`password-recovery:email:\$\{email\}`,\s*\{\s*limit:\s*TENTATIVAS_POR_EMAIL,\s*windowMs:\s*JANELA_DO_EMAIL_MS,?\s*\}\s*\)/,
    "a trava por e-mail precisa existir e usar os números importados",
  );
});

test("o teto por IP é MUITO mais alto — rede compartilhada é normal", () => {
  assert.ok(TENTATIVAS_POR_IP > TENTATIVAS_POR_EMAIL * 5,
    "operadora de celular, VPN e escritório colocam dezenas de pessoas no mesmo IP");
  assert.match(
    fonteRota,
    /checkRateLimit\(\s*clientKey\(request,\s*"password-recovery"\),\s*\{\s*limit:\s*TENTATIVAS_POR_IP,\s*windowMs:\s*JANELA_DO_IP_MS,?\s*\}\s*\)/,
    "a trava por IP precisa existir e usar os números importados",
  );
});

/* ── A TRAVA DO E-MAIL VEM PRIMEIRO ──────────────────────────────────────── */

test("com as duas travas presentes, o motivo relatado prioriza o E-MAIL", () => {
  // É o que a pessoa consegue entender e agir: olhar a caixa de spam. Dizer
  // "seu IP" a quem não controla o IP é acusar sem saída.
  assert.match(
    fonteRota,
    /!porEmail\.allowed\s*\?\s*porEmail\s*:\s*!porRede\.allowed\s*\?\s*porRede\s*:\s*null/,
    "a checagem do e-mail precisa vencer a do IP quando as duas estouram",
  );
});

test("a frase de bloqueio por e-mail diz QUANDO voltar e lembra do SPAM", () => {
  assert.match(fonteRota, /Já enviamos.*minuto\(s\)/s);
  assert.match(fonteRota, /SPAM/);
});

test("a frase de bloqueio por IP não acusa a pessoa de algo que ela não fez", () => {
  assert.match(fonteRota, /Muitos pedidos de recuperação vindos desta rede/);
  const mensagemDoIp = fonteRotaSemComentarios.slice(fonteRotaSemComentarios.indexOf("Muitos pedidos"));
  assert.doesNotMatch(
    mensagemDoIp.slice(0, mensagemDoIp.indexOf("`")),
    /seu IP|você fez/i,
    "a pessoa não tem como agir sobre o IP dela",
  );
});

test("o corpo é lido, e o e-mail normalizado, antes de qualquer checkRateLimit", () => {
  const ateOPrimeiroLimite = fonteRota.slice(0, fonteRota.indexOf("checkRateLimit("));
  assert.match(ateOPrimeiroLimite, /request\.json\(\)/, "a chave por e-mail depende do corpo já lido");
  assert.match(ateOPrimeiroLimite, /normalizeEmail/);
});

/* ── O QUE A PESSOA LÊ AO DAR CERTO ──────────────────────────────────────── */

test("a frase de sucesso não revela quem tem conta, mas diz o que esperar", () => {
  const f = fraseDoEnvioAceito();
  assert.match(f, /Se este e-mail tiver conta/i, "não confirma nem nega a existência");
  assert.match(f, /SPAM/i);
  assert.match(f, /1 hora/, "o prazo do link evita a segunda tentativa desnecessária");
  assert.match(f, /uma vez/i);
});

test("a rota usa a frase de sucesso importada, não uma string solta", () => {
  assert.match(fonteRota, /fraseDoEnvioAceito\(\)/);
});
