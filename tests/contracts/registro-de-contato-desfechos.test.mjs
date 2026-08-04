import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  CANAIS_ACEITOS,
  RESULTADOS_ACEITOS,
  DESFECHOS,
  DESFECHOS_PRIMARIOS,
  DESFECHOS_SECUNDARIOS,
  ehAceitoPelaRota,
  estadoDaLinha,
  desfechoPorChave,
  rotuloDeContatoAnterior,
} from "../../components/crm/registro-de-contato-desfechos.ts";

/**
 * O REGISTRO DE CONTATO NA LINHA — a asserção que faltava.
 *
 * A entrega que criou este módulo declarou honestamente que ZERO asserções o
 * alcançavam. Estas alcançam, e a mais importante delas não repete o que o
 * `tsc` já faz.
 *
 * ── POR QUE A PRIMEIRA ASSERÇÃO LÊ O ARQUIVO DA ROTA ────────────────────────
 *
 * O módulo ESPELHA à mão os dois Sets de validação da rota. O `tsc` prova que
 * os cinco desfechos são coerentes com o espelho — e nada mais. MEDIDO em
 * 02/08/2026: removendo `numero_invalido` do Set da PRÓPRIA ROTA, o
 * `tsc --noEmit` continua saindo vazio e `ehAceitoPelaRota` continua
 * respondendo `true`, porque ele pergunta ao espelho, não à rota. O botão
 * "⛔ Número não existe" passaria a receber HTTP 400 na mão do corretor sem
 * que nada nesta árvore ficasse vermelho.
 *
 * Essa é exatamente a classe de defeito que este repositório já pagou como
 * "caminhos divergentes": dois lados da mesma chamada evoluindo separados. A
 * defesa só vale se olhar para o LADO QUE MUDA — a rota. Por isso o teste
 * abaixo lê o fonte da rota e compara, em vez de confiar no espelho.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const ROTA = join(AQUI, "../../app/api/v1/leads/[id]/first-contact/route.ts");

function setDaRota(nome) {
  const fonte = readFileSync(ROTA, "utf8");
  const achado = fonte.match(
    new RegExp(`const ${nome} = new Set\\(\\s*(\\[[^\\]]*\\])\\s*\\)`),
  );
  assert.ok(
    achado,
    `não achei o Set ${nome} em ${ROTA}. Se a rota mudou de forma, este teste tem de ser reescrito — e não apagado.`,
  );
  return new Set(JSON.parse(achado[1].replace(/'/g, '"')));
}

test("todo desfecho da lista é aceito pelo Set REAL da rota, lido do fonte", () => {
  const canais = setDaRota("CANAIS");
  const resultados = setDaRota("RESULTADOS");
  assert.ok(canais.size > 0 && resultados.size > 0);

  for (const desfecho of DESFECHOS) {
    assert.ok(
      canais.has(desfecho.canal),
      `o botão "${desfecho.rotulo}" manda canal "${desfecho.canal}", que a ROTA não aceita — HTTP 400 na mão do corretor.`,
    );
    assert.ok(
      resultados.has(desfecho.resultado),
      `o botão "${desfecho.rotulo}" manda resultado "${desfecho.resultado}", que a ROTA não aceita — HTTP 400 na mão do corretor.`,
    );
  }
});

test("o espelho declarado no módulo não divergiu da rota", () => {
  assert.deepEqual(
    [...CANAIS_ACEITOS].sort(),
    [...setDaRota("CANAIS")].sort(),
    "CANAIS_ACEITOS deixou de espelhar o Set da rota.",
  );
  assert.deepEqual(
    [...RESULTADOS_ACEITOS].sort(),
    [...setDaRota("RESULTADOS")].sort(),
    "RESULTADOS_ACEITOS deixou de espelhar o Set da rota.",
  );
});

test("ehAceitoPelaRota rejeita o que está fora do vocabulário", () => {
  assert.equal(ehAceitoPelaRota({ canal: "pombo", resultado: "falou" }), false);
  assert.equal(ehAceitoPelaRota({ canal: "call", resultado: "talvez" }), false);
  assert.equal(ehAceitoPelaRota({ canal: "", resultado: "" }), false);
  assert.equal(ehAceitoPelaRota({ canal: "call", resultado: "falou" }), true);
});

test("o desfecho que ENCERRA a fila existe e é alcançável", () => {
  // Sem ele o corretor marca "não atendeu" num número morto todo dia, e a base
  // de medição que esta tela existe para criar nasce envenenada.
  const morto = DESFECHOS.find((d) => d.resultado === "numero_invalido");
  assert.ok(morto, "sumiu o desfecho de número inválido.");
  assert.equal(morto.tom, "encerra");
});

test("um toque: os primários estão na tela sem gesto anterior, e são de ligação", () => {
  assert.ok(DESFECHOS_PRIMARIOS.length >= 2);
  assert.ok(DESFECHOS_PRIMARIOS.every((d) => d.canal === "call"));
  // Ligar sem desfecho não responde à única pergunta da operação: adiantou?
  assert.ok(DESFECHOS.every((d) => typeof d.resultado === "string" && d.resultado));
  assert.equal(
    DESFECHOS_PRIMARIOS.length + DESFECHOS_SECUNDARIOS.length,
    DESFECHOS.length,
  );
});

test("chave de desfecho é única — ela vira `key` de React e `data-` de teste", () => {
  const chaves = DESFECHOS.map((d) => d.chave);
  assert.equal(new Set(chaves).size, chaves.length);
  for (const chave of chaves) assert.ok(desfechoPorChave(chave));
  assert.equal(desfechoPorChave("não-existe"), null);
});

test("a precedência da linha: falha > enviando > gravado > carimbo antigo", () => {
  const antigo = "2026-07-28T12:00:00.000Z";
  // A falha vem primeiro porque é a única que exige que o corretor repita o gesto.
  assert.equal(
    estadoDaLinha({
      contatadoEm: antigo,
      enviando: "ligacao-falou",
      gravado: "ligacao-falou",
      falha: { chave: "ligacao-falou", motivo: "sessão expirada" },
    }).tipo,
    "falhou",
  );
  assert.equal(
    estadoDaLinha({
      contatadoEm: antigo,
      enviando: "ligacao-falou",
      gravado: "ligacao-falou",
    }).tipo,
    "registrando",
  );
  const gravado = estadoDaLinha({ contatadoEm: antigo, gravado: "ligacao-falou" });
  assert.equal(gravado.tipo, "registrado");
  assert.equal(gravado.ehDesteMomento, true);
});

test("a falha CARREGA o motivo — registro que some sem avisar envenena a base", () => {
  const estado = estadoDaLinha({
    contatadoEm: null,
    falha: { chave: "ligacao-falou", motivo: "lead fora da sua carteira" },
  });
  assert.equal(estado.tipo, "falhou");
  assert.match(estado.motivo, /carteira/);
  assert.ok(estado.motivo.length > 0, "falha muda é pior do que não ter o botão.");
});

test("sem carimbo, a linha diz 'pendente' — e NUNCA um zero desenhado", () => {
  assert.deepEqual(estadoDaLinha({ contatadoEm: null }), { tipo: "pendente" });
  assert.deepEqual(estadoDaLinha({ contatadoEm: undefined }), { tipo: "pendente" });
  // "ausência de dado" não pode virar métrica: nada de 0, 0%, ou "0 tentativas".
  const pendente = estadoDaLinha({ contatadoEm: null });
  assert.equal("rotulo" in pendente, false);
});

test("o carimbo antigo diz a DATA e não inventa o desfecho", () => {
  const estado = estadoDaLinha({ contatadoEm: "2026-07-28T12:00:00.000Z" });
  assert.equal(estado.tipo, "registrado");
  assert.equal(estado.ehDesteMomento, false);
  // A listagem não sabe o canal nem o resultado do contato antigo. Escrever
  // "Falou" ali seria inventar métrica.
  assert.doesNotMatch(estado.rotulo, /falou|atendeu|whatsapp/i);
  assert.match(estado.rotulo, /1º contato/);
});

test("data inválida não vira 'Invalid Date' na cara do corretor", () => {
  assert.equal(rotuloDeContatoAnterior("lixo"), "1º contato registrado");
  assert.doesNotMatch(rotuloDeContatoAnterior("lixo"), /invalid|nan/i);
});
