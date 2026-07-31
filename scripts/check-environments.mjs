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
 * ── O RUNTIME OFICIAL MUDOU, E A MUDANÇA FOI MEDIDA ────────────────────────
 *
 * Esta linha exigia `">=20.9 <21"`. Em 2026-07-31 isso foi medido e está
 * ERRADO — não por gosto, por incompatibilidade:
 *
 *   · 36 scripts do package.json usam `--experimental-strip-types` ou
 *     `--env-file`. O primeiro chegou no Node 22.6; no 20.9 ele não existe.
 *   · `npm run test:contracts` — a cadeia de verificação INTEIRA — não roda no
 *     engine que estava declarado.
 *   · todo o build, os 1.191 contratos e os 220 portões foram provados em
 *     Node v26.4.0.
 *
 * Declarar 20.9 era pedir à hospedagem que provisionasse uma versão em que o
 * próprio verificador do produto não executa. A faixa passa a ser a que foi
 * REALMENTE provada, e o teto `<27` existe para que uma major nova não entre
 * sem alguém rodar a suíte nela.
 *
 * A asserção continua exata (igualdade, não "contém"): afrouxá-la para aceitar
 * qualquer faixa transformaria o portão em enfeite.
 */
const RUNTIME_OFICIAL = ">=22.6 <27";
if (packageConfig.engines?.node !== RUNTIME_OFICIAL) {
  errors.push(`runtime oficial deve ser Node.js ${RUNTIME_OFICIAL} — 36 scripts usam flags que não existem antes do 22.6`);
}
if (contract.environments?.production?.allowsBootstrap !== false || contract.environments?.production?.allowsTestCredentials !== false) errors.push("produção não pode aceitar bootstrap ou conta de teste");

if (errors.length) {
  console.error("ATLAS ENVIRONMENTS: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`ATLAS ENVIRONMENTS: PASSED (development, homologation e production isolados; Node.js ${RUNTIME_OFICIAL})`);
