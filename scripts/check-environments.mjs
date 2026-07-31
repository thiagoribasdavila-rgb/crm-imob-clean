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
 * ── O RUNTIME OFICIAL, CORRIGIDO DUAS VEZES — e a segunda correção é a certa ──
 *
 * **31/07, manhã.** A linha exigia `">=20.9 <21"`. Eu troquei para `">=22.6 <27"`
 * porque 36 scripts do `package.json` usam `--experimental-strip-types`, que só
 * existe a partir do Node 22.6.
 *
 * **31/07, tarde.** O dono confirmou no hPanel: a hospedagem é uma **aplicação
 * Node.js gerenciada da Hostinger, com Node 20.x**. Medido em seguida:
 *
 *   next exige ....................... >=20.9.0
 *   `npm run build` (scripts/build.mjs) flag de Node 22+: ZERO
 *   `npm start` (next start) ......... nenhuma flag
 *   código de aplicação .............. nenhuma API exclusiva de 22+
 *   os 4 scripts com strip-types ..... test:contracts, cron:validar,
 *                                      cron:instalar, reactivation-governance
 *                                      — NENHUM na cadeia npm ci → build → start
 *
 * **Meu `>=22.6` estava errado, e o erro era grave:** ele faria `npm ci` recusar
 * na Hostinger com EBADENGINE. Eu teria bloqueado o deploy inteiro para exigir
 * uma versão que só as MINHAS ferramentas de verificação precisam.
 *
 * `engines` descreve o que a APLICAÇÃO precisa para instalar, construir e servir
 * — não o que a bancada de testes do autor gostaria de ter. A exigência de 22.6+
 * para a cadeia de contratos é real, e vive documentada em
 * `docs/flagship/HOSTINGER_DEPLOY.md`, onde ela pertence: no procedimento de
 * quem verifica, não no portão de quem instala.
 *
 * A asserção continua por IGUALDADE: afrouxar para "contém" transformaria o
 * portão em enfeite.
 */
const RUNTIME_OFICIAL = ">=20.9";
if (packageConfig.engines?.node !== RUNTIME_OFICIAL) {
  errors.push(`runtime oficial deve ser Node.js ${RUNTIME_OFICIAL} — é o que Next e o start exigem. A cadeia de contratos precisa de 22.6+, mas isso é bancada de verificação, não requisito de instalação.`);
}
if (contract.environments?.production?.allowsBootstrap !== false || contract.environments?.production?.allowsTestCredentials !== false) errors.push("produção não pode aceitar bootstrap ou conta de teste");

if (errors.length) {
  console.error("ATLAS ENVIRONMENTS: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`ATLAS ENVIRONMENTS: PASSED (development, homologation e production isolados; Node.js ${RUNTIME_OFICIAL})`);
