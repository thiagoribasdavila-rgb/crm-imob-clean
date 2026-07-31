#!/usr/bin/env node
/**
 * GERA O CRONTAB A PARTIR DA CADÊNCIA VERSIONADA.
 *
 * ── POR QUE ESTE SCRIPT EXISTE ──────────────────────────────────────────────
 *
 * `config/workers-schedule.json` versiona 11 workers com cadência e justificativa.
 * Medido em 2026-07-30: NENHUM deles roda. Um evento ficou 44h49m entre entrar na
 * fila e receber a primeira tentativa, contra uma cadência declarada de 2 em 2
 * minutos.
 *
 * A causa foi isolada por execução (`scripts/prova-fila-e-agendador.mjs`, 13/13):
 * o worker funciona — reclama a linha, processa, faz backoff, respeita o teto de
 * 5 tentativas e manda para dead_letter. O que falta é ALGUÉM CHAMAR.
 *
 * Escrever as linhas do crontab à mão convida a dois erros que já custaram caro
 * neste projeto: cadência divergindo do arquivo versionado (duas verdades), e
 * segredo colado no arquivo do cron (que fica legível em texto puro). Este script
 * deriva tudo do JSON e NUNCA imprime o segredo — usa a variável de ambiente.
 *
 * ── ESTE SCRIPT NÃO INSTALA NADA, E ISSO É DELIBERADO ───────────────────────
 *
 * A versão anterior deste cabeçalho sugeria:
 *
 *     node scripts/gera-crontab-dos-workers.mjs > /tmp/atlas.cron && crontab /tmp/atlas.cron
 *
 * Esse `&&` apaga o passo em que alguém OLHA o que vai ser aplicado. Ele foi
 * executado no Mac de desenvolvimento em 2026-07-30 e agendou 11 workers
 * comerciais na máquina local apontando para PRODUÇÃO — incluindo o `outbox`,
 * que envia mensagem, a cada 2 minutos. Só não houve dano porque
 * `/var/www/atlas/.env` não existe no Mac e o `source` abortava o comando.
 *
 * Agora são três comandos, e o do meio é obrigatório:
 *
 *     npm run cron:gerar      # imprime; não toca em nada
 *     npm run cron:validar    # diz SE esta máquina poderia instalar, e por quê
 *     npm run cron:instalar   # recusa fora do servidor autorizado
 *
 * Variáveis: ATLAS_BASE_URL (padrão https://atlasaios.com.br)
 */
import { readFileSync } from "node:fs";

const BASE = (process.env.ATLAS_BASE_URL || "https://atlasaios.com.br").replace(/\/+$/, "");
const bruto = JSON.parse(readFileSync("config/workers-schedule.json", "utf8"));
const workers = Array.isArray(bruto) ? bruto : (bruto.workers ?? bruto.jobs ?? []);

if (!workers.length) {
  console.error("Nenhum worker em config/workers-schedule.json — nada a gerar.");
  process.exit(1);
}

const linhas = [
  "# ATLAS ONE — agendamento dos workers",
  "# GERADO por scripts/gera-crontab-dos-workers.mjs a partir de config/workers-schedule.json.",
  "# Não edite as cadências aqui: edite o JSON e gere de novo. Duas verdades sobre a",
  "# mesma cadência é a classe de defeito que este projeto mais paga.",
  "#",
  "# O SEGREDO NÃO ENTRA NESTE ARQUIVO. Ele é lido de ATLAS_CRON_SECRET, que precisa",
  "# estar no ambiente do cron — a linha abaixo carrega o .env do app antes de cada",
  "# chamada. Crontab é texto puro e legível por quem tiver a conta.",
  "",
  "SHELL=/bin/bash",
  "MAILTO=\"\"",
  "",
];

for (const w of workers) {
  const nome = w.nome ?? w.name ?? "sem-nome";
  const cadencia = w.cadencia ?? w.cron ?? w.schedule;
  const rota = w.rota ?? w.route ?? w.path;
  const timeout = Math.ceil((w.timeoutMs ?? 55_000) / 1000);
  if (!cadencia || !rota) {
    linhas.push(`# ⚠ ${nome}: SEM cadência ou rota no JSON — não gerei linha para ele.`);
    continue;
  }
  if (w.porque) linhas.push(`# ${nome}: ${w.porque}`);
  linhas.push(
    `${cadencia} set -a; . /var/www/atlas/.env; set +a; ` +
      `curl -fsS --max-time ${timeout} -X POST "${BASE}${rota}" ` +
      `-H "authorization: Bearer $ATLAS_CRON_SECRET" ` +
      `>> /var/log/atlas/${nome}.log 2>&1`,
  );
  linhas.push("");
}

linhas.push(
  "# Depois de instalar, a prova NÃO é o `crontab -l` ter saído certo — é o efeito:",
  "#   1) crie um evento e veja `attempts` sair de 0 sozinho, em até 5 minutos;",
  "#   2) curl -s $BASE/api/v1/ready | grep -o '\"agendamento\":{[^}]*}'",
  "#   3) node scripts/check-commit-publicado.mjs",
  "#",
  "# Para PAUSAR sem desinstalar o cron (kill switch), no /var/www/atlas/.env:",
  "#   ATLAS_OUTBOX_PAUSADO=1",
  "#   ATLAS_OUTBOX_PAUSADO_MOTIVO=\"por que você pausou\"",
  "# A pausa aparece em /api/v1/ready. Pausa silenciosa é indistinguível de pane —",
  "# foi por isso que 44h de fila parada passaram despercebidas.",
);

console.log(linhas.join("\n"));
