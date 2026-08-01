/**
 * Contrato do PORTEIRO DA INSTALAÇÃO DO CRON.
 *
 * Nasceu de um incidente real. Em 2026-07-30 foi entregue o comando
 * `gera-crontab > /tmp/atlas.cron && crontab /tmp/atlas.cron`, e ele foi executado
 * no Mac de desenvolvimento: 11 workers comerciais agendados na máquina local,
 * apontando para PRODUÇÃO, incluindo o `outbox` (que envia mensagem) a cada 2
 * minutos.
 *
 * Não houve dano porque `/var/www/atlas/.env` não existe no Mac e o `source`
 * abortava o comando — o que é ACIDENTE de caminho, não proteção. Este contrato
 * transforma a sorte em verificação.
 *
 * A regra deste repositório: guarda que nunca foi vista RECUSANDO é guarda não
 * verificada. Por isso os casos de recusa vêm primeiro e são a maioria.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  avaliarAutorizacaoDeInstalacao,
  VALOR_DE_AUTORIZACAO,
  PLATAFORMAS_RECUSADAS,
} from "../../lib/deploy/autorizacao-de-instalacao.ts";

/** Um servidor legítimo: é a partir dele que cada teste tira UMA condição. */
const servidor = {
  plataforma: "linux",
  hostname: "atlas-prod-01",
  usuario: "atlas",
  diretorioDaAplicacaoExiste: true,
  diretorioDaAplicacao: "/var/www/atlas",
  autorizacaoExplicita: VALOR_DE_AUTORIZACAO,
};

test("o servidor legítimo é autorizado — sem isto o portão só sabe dizer não", () => {
  const v = avaliarAutorizacaoDeInstalacao(servidor);
  assert.equal(v.autorizado, true);
  assert.deepEqual(v.impedimentos, []);
  assert.match(v.motivo, /atlas-prod-01/);
});

test("RECUSA no macOS — a máquina exata onde o incidente aconteceu", () => {
  const v = avaliarAutorizacaoDeInstalacao({ ...servidor, plataforma: "darwin" });
  assert.equal(v.autorizado, false);
  assert.ok(v.impedimentos.includes("plataforma_de_desenvolvimento"));
  assert.match(v.motivo, /desenvolvimento/);
});

test("RECUSA em toda plataforma da lista, não só na que lembramos", () => {
  for (const plataforma of PLATAFORMAS_RECUSADAS) {
    const v = avaliarAutorizacaoDeInstalacao({ ...servidor, plataforma });
    assert.equal(v.autorizado, false, `${plataforma} deveria ser recusada`);
  }
});

test("RECUSA sem a autorização explícita — o padrão é NÃO instalar", () => {
  const v = avaliarAutorizacaoDeInstalacao({ ...servidor, autorizacaoExplicita: undefined });
  assert.equal(v.autorizado, false);
  assert.ok(v.impedimentos.includes("sem_autorizacao_explicita"));
});

test("RECUSA valores que 'parecem sim' — o consentimento não é adivinhado", () => {
  // `1`, `true` e `sim` são o que alguém digita no automático. A frase inteira
  // exige que a pessoa afirme onde está.
  for (const valor of ["1", "true", "sim", "yes", "SIM", VALOR_DE_AUTORIZACAO.toUpperCase()]) {
    const v = avaliarAutorizacaoDeInstalacao({ ...servidor, autorizacaoExplicita: valor });
    assert.equal(v.autorizado, false, `"${valor}" não pode autorizar`);
  }
});

test("RECUSA quando o diretório da aplicação não existe — foi ele que salvou o incidente", () => {
  const v = avaliarAutorizacaoDeInstalacao({ ...servidor, diretorioDaAplicacaoExiste: false });
  assert.equal(v.autorizado, false);
  assert.ok(v.impedimentos.includes("sem_diretorio_da_aplicacao"));
  assert.match(v.motivo, /\/var\/www\/atlas/);
});

test("RECUSA hostname fora da lista, QUANDO a lista existe", () => {
  const v = avaliarAutorizacaoDeInstalacao({
    ...servidor,
    hostname: "macbook-do-thiago",
    hostnamesAutorizados: ["atlas-prod-01", "atlas-homolog-01"],
  });
  assert.equal(v.autorizado, false);
  assert.ok(v.impedimentos.includes("hostname_nao_autorizado"));
});

test("lista de hostnames VAZIA não restringe — senão o portão trava quem ainda não configurou", () => {
  const v = avaliarAutorizacaoDeInstalacao({ ...servidor, hostnamesAutorizados: [] });
  assert.equal(v.autorizado, true);
});

test("o Mac REAL do incidente é recusado por TRÊS motivos ao mesmo tempo", () => {
  // Reprodução literal: macOS, sem a variável, e sem /var/www/atlas. A mensagem
  // precisa listar os três — corrigir um e ainda ser recusado sem saber por quê
  // é como se descobre que a guarda tem mais de uma condição.
  const v = avaliarAutorizacaoDeInstalacao({
    plataforma: "darwin",
    hostname: "macbook-do-thiago",
    usuario: "thiagoribasdavila",
    diretorioDaAplicacaoExiste: false,
    diretorioDaAplicacao: "/var/www/atlas",
    autorizacaoExplicita: undefined,
  });
  assert.equal(v.autorizado, false);
  assert.equal(v.impedimentos.length, 3);
  assert.ok(v.impedimentos.includes("plataforma_de_desenvolvimento"));
  assert.ok(v.impedimentos.includes("sem_autorizacao_explicita"));
  assert.ok(v.impedimentos.includes("sem_diretorio_da_aplicacao"));
});

test("autorização no servidor NÃO depende de haver lista de hostnames", () => {
  const v = avaliarAutorizacaoDeInstalacao({ ...servidor, hostnamesAutorizados: undefined });
  assert.equal(v.autorizado, true);
});
