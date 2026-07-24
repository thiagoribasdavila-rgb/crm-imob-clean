import assert from "node:assert/strict";
import test from "node:test";

import { scanContent, allowedPublic } from "../../scripts/secret-scan-rules.mjs";

// Segredos DE MENTIRA. Nenhum valor abaixo é real nem já foi real.
//
// Todos são MONTADOS em tempo de execução, nunca escritos por extenso. O motivo
// é concreto: este arquivo é varrido pelo próprio scanner que ele testa, e um
// literal aqui deixaria o portão vermelho eternamente. Concatenar mantém o
// scanner varrendo 100% dos arquivos — sem exclusão, sem allowlist de caminho,
// sem afrouxar regra nenhuma para acomodar o teste.
const FALSO_OPENAI = `${"sk"}-${"A1b2C3d4E5f6G7h8J9k0".repeat(2)}`;
const FALSO_AWS = "AKIA" + "QWERTYUIOPASDFGH";
const FALSO_GITHUB = `${"ghp"}_${"a1B2c3D4e5F6g7H8i9J0".repeat(2)}`;
const FALSO_SLACK = `${"xox"}b-1234567890-abcdefghij`;
const FALSA_CHAVE_PRIVADA = `-----${"BEGIN"} RSA PRIVATE KEY-----`;
const FALSO_JWT_COMPLETO = `${"eyJ"}hbGciOiJIUzI1NiJ9.${"eyJ"}zdWIiOiJhdGxhcyJ9.c2lnbmF0dXJhX2xvbmdhX2RlX3Rlc3RlXzEyMzQ1`;
// Mesmo formato do fixture que já existe em tests/observabilidade.test.ts: assinatura curta.
const JWT_FIXTURE_CURTO = `${"eyJ"}hbGciOiJIUzI1NiJ9.${"eyJ"}zdWIiOiIxIn0.abc`;
// Nomes de variável também são montados, pela mesma razão.
const PUBLICA_NAO_APROVADA = `${"NEXT_PUBLIC"}_STRIPE_SECRET`;
const FAMILIA_NAO_APROVADA = `${"NEXT_PUBLIC"}_PAGAMENTO_`;

test("1. segredo fictício de formato real continua sendo detectado", () => {
  for (const [rotulo, valor] of [
    ["OpenAI", FALSO_OPENAI],
    ["AWS", FALSO_AWS],
    ["GitHub", FALSO_GITHUB],
    ["JWT", FALSO_JWT_COMPLETO],
    ["chave privada", FALSA_CHAVE_PRIVADA],
    ["Slack", FALSO_SLACK],
  ]) {
    const achados = scanContent("lib/qualquer.ts", `const credencial = "${valor}";`);
    assert.ok(
      achados.some((a) => a.includes(rotulo)),
      `${rotulo} deveria ter sido detectado em "${valor.slice(0, 12)}…" — achados: ${JSON.stringify(achados)}`,
    );
  }
});

test("1b. um segredo no início do arquivo seguinte não escapa (regressão de lastIndex)", () => {
  // A versão anterior reusava regex com /g e .test(), que guarda lastIndex entre
  // chamadas: depois de um arquivo dar match, o começo do próximo era pulado.
  const primeiro = scanContent("a.ts", `padding padding ${FALSO_AWS} fim`);
  const segundo = scanContent("b.ts", `${FALSO_AWS} logo no começo`);
  assert.ok(primeiro.some((a) => a.includes("AWS")), "primeiro arquivo deveria acusar");
  assert.ok(segundo.some((a) => a.includes("AWS")), "segundo arquivo TAMBÉM deveria acusar");
});

test("2. JWT fictício curto de fixture de teste não vira falso positivo", () => {
  const achados = scanContent("tests/observabilidade.test.ts", `redigir("${JWT_FIXTURE_CURTO}")`);
  assert.deepEqual(achados, [], `fixture controlado não deveria acusar — achados: ${JSON.stringify(achados)}`);

  // …mas o JWT completo, esse sim, é pego mesmo dentro de um teste.
  const achadosReais = scanContent("tests/observabilidade.test.ts", `const t = "${FALSO_JWT_COMPLETO}"`);
  assert.ok(achadosReais.some((a) => a.includes("JWT")), "JWT com assinatura longa deve acusar até em teste");
});

test("3. placeholder documental de família não gera falso positivo", () => {
  // As duas formas que existem de verdade no runbook de deploy.
  const glob = scanContent("docs/deploy/RUNBOOK.md", "Build sem `NEXT_PUBLIC_SUPABASE_*` no ambiente gera bundle quebrado.");
  assert.deepEqual(glob, [], `glob de família não deveria acusar — ${JSON.stringify(glob)}`);

  const alternacao = scanContent("docs/deploy/RUNBOOK.md", "/^(NEXT_PUBLIC_SUPABASE_(URL|PUBLISHABLE_KEY|ANON_KEY)|DATABASE_URL)=/");
  assert.deepEqual(alternacao, [], `alternação de família não deveria acusar — ${JSON.stringify(alternacao)}`);

  // A proteção continua: família DESCONHECIDA segue reprovada.
  const desconhecida = scanContent("docs/x.md", `use ${FAMILIA_NAO_APROVADA}* para as chaves`);
  assert.ok(
    desconhecida.some((a) => a.includes("família pública não aprovada")),
    "família fora da allowlist deve continuar reprovando",
  );
});

test("4. .env.example com placeholders seguros é aceito", () => {
  const conteudo = [
    "NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
    "NEXT_PUBLIC_APP_URL=http://localhost:3000",
    "SUPABASE_SERVICE_ROLE_KEY=",
  ].join("\n");
  assert.deepEqual(scanContent(".env.example", conteudo), []);

  // Qualquer outro .env versionado continua sendo achado, mesmo vazio.
  assert.ok(scanContent(".env.local", "").some((a) => a.includes("arquivo de ambiente versionado")));
  assert.ok(scanContent(".env", "").some((a) => a.includes("arquivo de ambiente versionado")));
});

test("5. variável pública fora da allowlist continua bloqueada", () => {
  const achados = scanContent("app/page.tsx", `process.env.${PUBLICA_NAO_APROVADA}`);
  assert.ok(
    achados.some((a) => a.includes(`variável pública não aprovada ${PUBLICA_NAO_APROVADA}`)),
    `variável não aprovada deve acusar — ${JSON.stringify(achados)}`,
  );

  // E as aprovadas continuam passando.
  for (const aprovada of allowedPublic) {
    assert.deepEqual(scanContent("app/page.tsx", `process.env.${aprovada}`), []);
  }
});

test("6. um valor real dentro de .env.example ainda é bloqueado", () => {
  // Placeholder vazio passa (teste 4); credencial de verdade, não.
  const achados = scanContent(".env.example", `SUPABASE_SERVICE_ROLE_KEY=${FALSO_JWT_COMPLETO}`);
  assert.ok(achados.some((a) => a.includes("JWT")), "credencial em .env.example deve acusar");
});
