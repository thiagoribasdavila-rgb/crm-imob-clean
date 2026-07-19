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
if (packageConfig.engines?.node !== ">=20.9 <21") errors.push("runtime oficial deve permanecer Node.js 20.9+");
if (contract.environments?.production?.allowsBootstrap !== false || contract.environments?.production?.allowsTestCredentials !== false) errors.push("produção não pode aceitar bootstrap ou conta de teste");

if (errors.length) {
  console.error("ATLAS ENVIRONMENTS: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log("ATLAS ENVIRONMENTS: PASSED (development, homologation e production isolados; Node.js 20.9+)");
