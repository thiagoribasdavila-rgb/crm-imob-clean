/**
 * Teste adversarial do AGENDAMENTO DOS WORKERS.
 *
 * A matriz de integrações registrava, com todas as letras, "workers prontos;
 * agendamento NÃO versionado — fila parada sem cron, nada sai". Era verdade: as
 * cadências viviam num crontab de VPS que o repositório não conhecia, e
 * scripts/run-workers.mjs disparava 4 das 14 rotas, sem cadência.
 *
 * O efeito prático apareceu no vigia de SLA de primeiro contato: uma rota
 * correta, provada contra o banco, que nunca rodaria sozinha porque nada a
 * chamava. É o mesmo tipo de buraco do registro de contato — a peça existe, a
 * ligação não.
 *
 * Este portão garante que nenhuma rota worker fique órfã em silêncio: toda rota
 * marcada como worker no contrato de segurança precisa estar no agendamento,
 * com cadência, ou declarada sob demanda com motivo.
 *
 * 100% determinístico: só lê arquivos do repo.
 *
 * Rodar da raiz do repo: node scripts/check-workers-schedule.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENDA = path.join(root, "config", "workers-schedule.json");
const CONTRATO = path.join(root, "config", "api-security-contract.json");
const RUNNER = path.join(root, "scripts", "run-workers.mjs");

const falhas = [];
let passaram = 0;
const check = (nome, ok, detalhe = "") => {
  if (ok) passaram += 1;
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

check("caso 1: o agendamento é versionado no repositório", fs.existsSync(AGENDA), "config/workers-schedule.json ausente");
if (!fs.existsSync(AGENDA) || !fs.existsSync(CONTRATO)) {
  console.log(`\ncheck-workers-schedule: ${passaram} passaram, ${falhas.length} falharam.`);
  for (const f of falhas) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}

const agenda = JSON.parse(fs.readFileSync(AGENDA, "utf8"));
const contrato = JSON.parse(fs.readFileSync(CONTRATO, "utf8"));
const runner = fs.readFileSync(RUNNER, "utf8");

const rotaDoArquivo = (arquivo) => `/${arquivo.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`;
const doContrato = (contrato.workerRoutes ?? []).map(rotaDoArquivo);
const agendadas = new Set((agenda.workers ?? []).map((w) => w.rota));
const sobDemanda = new Set((agenda.sobDemanda ?? []).map((w) => w.rota));

const orfas = doContrato.filter((rota) => !agendadas.has(rota) && !sobDemanda.has(rota));
check(
  "caso 2: nenhuma rota worker fica sem decisão de agendamento",
  orfas.length === 0,
  orfas.length ? `${orfas.join(", ")} — worker sem cron é worker que nunca roda` : "",
);

const fantasmas = [...agendadas, ...sobDemanda].filter((rota) => !doContrato.includes(rota));
check(
  "caso 3: o agendamento não aponta para rota que não existe mais",
  fantasmas.length === 0,
  fantasmas.length ? `${fantasmas.join(", ")} — cron chamando rota inexistente falha todo ciclo` : "",
);

for (const worker of agenda.workers ?? []) {
  check(
    `caso 4/${worker.nome}: cadência em formato de cron com cinco campos`,
    typeof worker.cadencia === "string" && worker.cadencia.trim().split(/\s+/).length === 5,
    `cadência inválida: ${JSON.stringify(worker.cadencia)}`,
  );
  check(
    `caso 5/${worker.nome}: a cadência tem justificativa escrita`,
    typeof worker.porque === "string" && worker.porque.length >= 30,
    "cadência sem motivo é número inventado que ninguém consegue revisar",
  );
}

for (const item of agenda.sobDemanda ?? []) {
  check(
    `caso 6/${item.rota}: sob demanda com motivo declarado`,
    typeof item.porque === "string" && item.porque.length >= 30,
    "deixar de agendar é uma decisão, e decisão sem motivo não é revisável",
  );
}

// O vigia de SLA é o caso que originou este portão: prazo de 5 minutos exige
// cadência de 5 minutos ou menos, senão o aviso chega depois do vencimento.
const vigia = (agenda.workers ?? []).find((w) => w.rota === "/api/v2/crm/first-contact-sla/process");
check("caso 7: o vigia de primeiro contato está agendado", Boolean(vigia), "a rota existe e nada a chama");
if (vigia) {
  const minutos = /^\*\/(\d+) \* \* \* \*$/.exec(vigia.cadencia.trim());
  check(
    "caso 8: o vigia roda a cada 5 minutos ou menos",
    Boolean(minutos) && Number(minutos[1]) <= 5,
    `cadência ${vigia.cadencia} é mais lenta que o prazo mais curto de primeiro contato (5 min)`,
  );
}

check(
  "caso 9: o executor lê o agendamento em vez de trazer lista própria",
  runner.includes("workers-schedule.json") && !/\[\["nightly-sales"/.test(runner),
  "lista embutida no script volta a divergir do contrato na primeira rota nova",
);
check(
  "caso 10: o executor sabe imprimir as linhas de cron",
  runner.includes("--crontab"),
  "sem gerar o crontab, a instalação continua dependendo de alguém lembrar",
);
check(
  "caso 11: nome de worker inexistente falha em vez de sair em silêncio",
  /desconhecidos[\s\S]{0,200}process\.exit\(1\)/.test(runner),
  "erro de digitação no crontab viraria fila parada sem ninguém perceber",
);

// ---------------------------------------------------------------------------
console.log(`\ncheck-workers-schedule: ${passaram} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  for (const f of falhas) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
