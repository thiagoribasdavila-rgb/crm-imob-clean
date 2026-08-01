/**
 * Executa os workers do Atlas a partir do agendamento versionado.
 *
 * Antes este script disparava quatro workers em sequência, sem cadência e sem
 * relação com o resto da fila. Quem quisesse rodar os outros dez precisava
 * descobrir sozinho que eles existiam — e o vigia de SLA, cujo prazo é de cinco
 * minutos, dependia disso.
 *
 * Agora a lista e as cadências vivem em config/workers-schedule.json, e o cron
 * chama este script por nome:
 *
 *     node scripts/run-workers.mjs first-contact-sla
 *     node scripts/run-workers.mjs --todos          # todos os agendados
 *     node scripts/run-workers.mjs --crontab        # imprime o bloco de cron
 *
 * Saída em JSON por linha, para o log do cron ser legível por máquina.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agenda = JSON.parse(fs.readFileSync(path.join(root, "config", "workers-schedule.json"), "utf8"));

const argumentos = process.argv.slice(2);
const pedidos = argumentos.filter((a) => !a.startsWith("--"));
const todos = argumentos.includes("--todos") || pedidos.length === 0;

if (argumentos.includes("--crontab")) {
  // O caminho do projeto e o carregamento do ambiente mudam por servidor, então
  // saem como marcador explícito em vez de palpite.
  console.log("# Atlas — agendamento dos workers (gerado por npm run workers:crontab)");
  console.log("# Substitua CAMINHO_DO_PROJETO. ATLAS_BASE_URL e ATLAS_CRON_SECRET precisam estar no ambiente do cron.");
  for (const worker of agenda.workers) {
    console.log(`# ${worker.porque}`);
    console.log(`${worker.cadencia} cd CAMINHO_DO_PROJETO && node scripts/run-workers.mjs ${worker.nome} >> /var/log/atlas-workers.log 2>&1`);
  }
  console.log("#");
  console.log("# Sob demanda, sem cadência (não agende sem decidir antes):");
  for (const item of agenda.sobDemanda) console.log(`#   ${item.rota} — ${item.porque}`);
  process.exit(0);
}

const baseUrl = (process.env.ATLAS_BASE_URL || "").replace(/\/$/, "");
const secret = process.env.ATLAS_CRON_SECRET || "";
if (!baseUrl || !secret) {
  console.error("ATLAS_BASE_URL e ATLAS_CRON_SECRET são obrigatórios.");
  process.exit(1);
}

const desconhecidos = pedidos.filter((nome) => !agenda.workers.some((w) => w.nome === nome));
if (desconhecidos.length) {
  // Falhar aqui é melhor do que rodar nada e sair com sucesso: um nome errado no
  // crontab viraria fila parada em silêncio.
  console.error(`Worker desconhecido: ${desconhecidos.join(", ")}. Disponíveis: ${agenda.workers.map((w) => w.nome).join(", ")}.`);
  process.exit(1);
}

const selecionados = todos
  ? agenda.workers
  : agenda.workers.filter((worker) => pedidos.includes(worker.nome));

for (const worker of selecionados) {
  const inicio = Date.now();
  try {
    const response = await fetch(`${baseUrl}${worker.rota}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(worker.timeoutMs ?? 55_000),
    });
    const body = await response.text();
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      worker: worker.nome,
      status: response.status,
      duracaoMs: Date.now() - inicio,
      response: body.slice(0, 2_000),
    }));
    if (!response.ok) process.exitCode = 1;
  } catch (erro) {
    // Um worker que estoura o tempo não pode impedir os seguintes de rodar.
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      worker: worker.nome,
      status: "erro",
      duracaoMs: Date.now() - inicio,
      erro: erro instanceof Error ? erro.message : String(erro),
    }));
    process.exitCode = 1;
  }
}
