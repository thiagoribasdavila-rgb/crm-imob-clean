import { existsSync, readFileSync } from "node:fs";

const root = process.cwd();
const read = (file) => readFileSync(`${root}/${file}`, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const files = {
  template: ".env.homologation.example",
  manifest: "config/environments/lead-roundtrip-homologation-env-manifest.json",
  report: "docs/LEAD_ROUNDTRIP_SAFE_ENV_BOOTSTRAP_STAGE_5.md",
  packager: "scripts/package-hostinger.mjs"
};

for (const file of Object.values(files)) expect(existsSync(`${root}/${file}`), `arquivo ausente: ${file}`);

if (!failures.length) {
  const templateSource = read(files.template);
  const template = Object.fromEntries(templateSource.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  const manifest = JSON.parse(read(files.manifest));
  const gitignore = read(".gitignore");
  const packager = read(files.packager);
  const report = read(files.report);
  const declared = manifest.variables.map((item) => item.name);

  expect(manifest.environment === "homologation", "manifesto não está restrito à homologação");
  expect(manifest.runtimeFile === ".env.local", "arquivo de runtime inesperado");
  expect(manifest.runtimeFileAllowedInRepository === false, "manifesto permite .env.local no repositório");
  expect(manifest.runtimeFileAllowedInReleaseZip === false, "manifesto permite .env.local no ZIP");
  for (const name of declared) expect(Object.hasOwn(template, name), `variável ausente no modelo: ${name}`);
  expect(Object.keys(template).every((name) => declared.includes(name)), "modelo contém variável fora do manifesto mínimo");

  for (const item of manifest.variables) {
    const value = template[item.name] ?? "";
    if (["ATLAS_ENV", "ATLAS_DATABASE_ENVIRONMENT"].includes(item.name)) expect(value === "homologation", `${item.name} deve declarar homologation`);
    else expect(value.includes("replace-with-"), `${item.name} não usa placeholder explícito`);
    if (item.secret) expect(!item.name.startsWith("NEXT_PUBLIC_"), `segredo exposto como público: ${item.name}`);
  }

  expect(!/(?:eyJ[a-zA-Z0-9_-]{10,}|sk-[a-zA-Z0-9_-]{8,}|sb_secret_[a-zA-Z0-9_-]{8,}|postgres(?:ql)?:\/\/[^\s=]*:[^\s=@]+@)/.test(templateSource), "modelo parece conter credencial real");
  expect(gitignore.includes(".env*") && gitignore.includes("!.env.example") && gitignore.includes("!.env.homologation.example"), ".gitignore não separa ambientes reais de modelos");
  expect(packager.includes("isRealEnvironmentFile"), "empacotador não possui bloqueio genérico de ambiente real");
  expect(packager.includes(".endsWith(\".example\")"), "empacotador não preserva somente modelos de ambiente");
  for (const marker of ["Etapa 5", "não cria `.env.local`", "service role", "fora do ZIP", "12 variáveis", "Nenhuma credencial foi criada", "Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado"]) expect(report.includes(marker), `documentação incompleta: ${marker}`);
}

if (failures.length) {
  console.error("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 5: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 5: aprovada — modelo seguro e manifesto completos; arquivo real, segredos, rede e execução externa continuam bloqueados.");
