import { readFileSync } from "node:fs";

const contract = JSON.parse(readFileSync(new URL("../config/environments.json", import.meta.url), "utf8"));
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const ecosystem = readFileSync(new URL("../ecosystem.config.cjs", import.meta.url), "utf8");
const packageConfig = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const errors = [];

for (const name of ["development", "homologation", "production"]) if (!contract.environments?.[name]) errors.push(`ambiente ausente: ${name}`);
for (const variable of contract.requiredIdentityVariables || []) if (!envExample.includes(`${variable}=`)) errors.push(`variável de identidade ausente no exemplo: ${variable}`);
if (!envExample.includes("ATLAS_ENV=development")) errors.push(".env.example deve iniciar em development");
if (!envExample.includes("ATLAS_HOSTING_PROVIDER=local")) errors.push(".env.example não pode simular Hostinger por padrão");
if (!ecosystem.includes('ATLAS_ENV: "homologation"')) errors.push("PM2 deve iniciar em homologation");
if (!ecosystem.includes('ATLAS_DATABASE_ENVIRONMENT: "homologation"')) errors.push("PM2 deve identificar o banco de homologação");
if (!ecosystem.includes('ATLAS_HOSTING_PROVIDER: "hostinger"')) errors.push("PM2 deve declarar Hostinger");
/**
 * ── O RUNTIME OFICIAL — corrigido TRÊS vezes, e esta é a análise completa ────
 *
 * | quando | valor | por quê estava errado |
 * |---|---|---|
 * | original | `">=20.9 <21"` | teto artificial: excluía 22 e 24 |
 * | 31/07 manhã | `">=22.6 <27"` | certo por acaso — eu olhei só os meus scripts |
 * | 31/07 tarde | `">=20.9"` | **errado**: olhei só o `next`, não as dependências |
 * | agora | `">=22.6"` | auditoria das 24 dependências de PRODUÇÃO |
 *
 * O que a auditoria completa encontrou:
 *
 *   @supabase/supabase-js ... >=22.0.0   ← o cliente do BANCO
 *   ai ...................... >=22
 *   prisma .................. ^20.19 || ^22.12 || >=24.0
 *   next .................... >=20.9.0
 *   4 scripts strip-types ... >=22.6     ← a exigência mais apertada
 *
 * **O cliente do Supabase declara Node >=22.** Ele é usado em praticamente toda
 * rota do produto. Declarar `>=20.9` colocaria a dependência mais central do
 * sistema fora da faixa que o próprio autor dela suporta.
 *
 * `npm` avisa `EBADENGINE` e instala assim mesmo — então rodar em Node 20 não
 * quebra na hora. Quebra depois, num caminho não testado, e a causa não aparece
 * no log. É a pior forma de incompatibilidade.
 *
 * **22.6 é o piso que satisfaz TODAS as exigências ao mesmo tempo.** Sem teto:
 * fixar `<27` foi cautela sem medição, e cautela sem medição vira portão que
 * reprova ambiente bom.
 *
 * A lição: `engines` se decide lendo as dependências de produção, uma a uma —
 * não o framework principal, nem a bancada de testes do autor.
 */
const RUNTIME_OFICIAL = ">=22.6";
if (packageConfig.engines?.node !== RUNTIME_OFICIAL) {
  errors.push(`runtime oficial deve ser Node.js ${RUNTIME_OFICIAL} — @supabase/supabase-js exige >=22.0.0 e o pacote "ai" exige >=22. 22.6 é o piso que satisfaz todas as dependências de produção ao mesmo tempo.`);
}
if (contract.environments?.production?.allowsBootstrap !== false || contract.environments?.production?.allowsTestCredentials !== false) errors.push("produção não pode aceitar bootstrap ou conta de teste");

/**
 * ── E O TETO DE NODE VIVE AQUI, NÃO EM `engines` ────────────────────────────
 *
 * O dono do produto tem uma regra: **não usar Node 26 em produção**. Em
 * 01/08/2026 eu tentei aplicá-la subindo `engines` para `">=22.6 <26"` — e este
 * portão reprovou, com razão. O comentário dele já dizia por quê: teto em
 * `engines` sem medição reprova ambiente bom, e `engines` fala do que o CÓDIGO
 * precisa, não de qual runtime a operação escolheu.
 *
 * A regra é real e pertence a outra camada: o runtime que o deploy e o CI usam.
 * Quem declara isso é o `.nvmrc` — o CI o consome via `node-version-file`, e
 * quem usa nvm na máquina também.
 *
 * Medido no momento em que esta asserção nasceu: `.nvmrc` = 22, e a máquina de
 * desenvolvimento rodava Node 26.4.0. A divergência era invisível porque
 * ninguém a media.
 */
const nvmrc = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
const maiorNvmrc = Number.parseInt(nvmrc.replace(/^v/, ""), 10);
if (!Number.isInteger(maiorNvmrc)) {
  errors.push(`.nvmrc traz "${nvmrc}", que não é uma versão maior legível — o CI consome este arquivo e precisa dele determinístico`);
} else if (maiorNvmrc >= 26) {
  errors.push(`.nvmrc aponta Node ${maiorNvmrc}: o dono do produto excluiu Node 26 do runtime de produção. O teto mora aqui, não em \`engines\` — \`engines\` diz o que o código precisa.`);
} else if (maiorNvmrc < 22) {
  errors.push(`.nvmrc aponta Node ${maiorNvmrc}, abaixo do piso ${RUNTIME_OFICIAL} exigido pelas dependências de produção`);
}

if (errors.length) {
  console.error("ATLAS ENVIRONMENTS: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`ATLAS ENVIRONMENTS: PASSED (development, homologation e production isolados; Node.js ${RUNTIME_OFICIAL})`);
