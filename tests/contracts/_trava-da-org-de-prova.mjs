/**
 * TRAVA DE EXCLUSIVIDADE DA ORGANIZAÇÃO DE PROVA
 *
 * ── O PROBLEMA, MEDIDO ──────────────────────────────────────────────────────
 *
 * Contratos que provam RPC de agregação inserem fixture numa organização FIXA
 * (`ORG_PROVA`) e afirmam contagens. Em 2026-07-30, com duas sessões rodando a
 * suíte ao mesmo tempo, `grafo-de-receita` reprovou três vezes seguidas — e
 * nenhuma das três era defeito de produto:
 *
 *   desfechos_na_base .......... 14 medido · 13 esperado  (campanha compartilhada)
 *   empreendimentos ............  4 medido ·  2 esperado  (bairro compartilhado)
 *   ganhos_rotulados ...........  7 medido ·  4 esperado  (CENSO da organização)
 *
 * Os dois primeiros se resolvem carimbando o PID na fixture. O terceiro NÃO: o
 * censo mede a organização inteira por definição, e não existe rótulo para
 * fatiar. Delta antes/depois também não resolve — a outra rodada insere DENTRO
 * da janela entre as duas leituras.
 *
 * ── POR QUE TRAVA, E NÃO ASSERÇÃO MAIS FROUXA ───────────────────────────────
 *
 * Afrouxar para `>= 4` deixaria o contrato passar num censo errado, que é
 * exatamente o defeito que ele existe para pegar. E falso vermelho não é o lado
 * seguro do erro: ele ensina quem lê a ignorar o portão, o que custa o portão
 * inteiro.
 *
 * O repositório já resolve esta forma de problema em `scripts/route-quarantine.mjs`,
 * que admite UMA execução do repo por vez. Aqui é o mesmo desenho: quem não pega
 * a trava declara NÃO EXECUTADO e diz por quê. A propriedade continua medida —
 * pela outra rodada, que é o mesmo arquivo com o mesmo código.
 *
 * `mkdir` é a primitiva porque é atômica no POSIX: cria e falha se já existe, num
 * único passo. `existsSync` seguido de `mkdirSync` teria a corrida que a trava
 * veio remover.
 */
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Rede secundária: só vale quando o dono não pôde ser identificado. */
const VALIDADE_MS = 15 * 60_000;

/**
 * ── POR QUE ESPERAR, E NÃO PULAR DE CARA ────────────────────────────────────
 *
 * A primeira versão desistia na hora. Entre duas SESSÕES isso é correto: a outra
 * rodada mede o mesmo arquivo, então a propriedade continua coberta.
 *
 * Entre dois ARQUIVOS diferentes da mesma suíte, não é. `test:contracts` roda
 * `node --test tests/contracts/*.test.mjs`, que executa os arquivos em processos
 * PARALELOS: se dois deles pegassem esta trava, um nunca seria medido em rodada
 * nenhuma — e a suíte ficaria verde justamente por não ter olhado. Trocar colisão
 * por cegueira não é conserto.
 *
 * Hoje só `grafo-de-receita` a usa. `oferta-ativa-do-acervo` divide a mesma
 * organização de prova e NÃO a pega — medido em 2026-07-30, ele não colide: cria
 * leads `perdido`/`novo`/`contato` e `ganhos_rotulados` conta `outcome = 'won'`,
 * enquanto as outras contagens do grafo já vão carimbadas com o PID. Quando
 * aquela entrega assentar e adotar a trava, é a espera que torna a adoção segura.
 *
 * Esperar serve aos dois casos: quem chega depois roda em seguida, medido. A
 * desistência sobra para o que ela sempre foi, o caso extremo em que a espera
 * estourou.
 *
 * `Atomics.wait` porque a aquisição acontece no topo do módulo, antes de existir
 * contexto assíncrono — é a única pausa síncrona que não queima CPU.
 */
const ESPERA_MAXIMA_MS = 120_000;
const INTERVALO_MS = 250;
const dormir = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * ── POR QUE A TRAVA GUARDA O PID DO DONO ────────────────────────────────────
 *
 * Pular porque OUTRA rodada está medindo é legítimo: a propriedade continua
 * coberta. Pular porque uma trava ficou presa NÃO é — aí o portão fica verde sem
 * medir nada, que é a doença que este repositório mais pagou (a cadeia morreu na
 * fase 018 e escondeu as fases 019 a 047).
 *
 * Só a idade não separa os dois casos. O PID separa: `process.kill(pid, 0)` não
 * envia sinal nenhum, só pergunta se o processo existe. Dono morto = retomada
 * IMEDIATA, sem os 15 minutos de janela cega. E isto importa em concreto porque
 * a trava mora no temp do SO, compartilhado entre as cópias que
 * `scripts/mutacoes.mjs` faz do repositório com rsync — uma rodada morta ali
 * calaria o contrato por 15 minutos de mutações seguidas, e cada mutação não
 * pega vira buraco relatado na rede.
 */
function donoVivo(caminho) {
  let pid;
  try {
    pid = Number(readFileSync(join(caminho, "dono"), "utf8").trim());
  } catch {
    return null; // sem dono legível: quem decide é a idade
  }
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (erro) {
    // EPERM = existe e não é meu (vivo). ESRCH = não existe (morto).
    return erro.code === "EPERM";
  }
}

export function tentarTravar(chave) {
  const caminho = join(tmpdir(), `atlas-org-de-prova-${chave}.lock`);

  const tentar = () => {
    try {
      mkdirSync(caminho);
      writeFileSync(join(caminho, "dono"), String(process.pid));
      return true;
    } catch (erro) {
      if (erro.code !== "EEXIST") throw erro;
      return false;
    }
  };

  const limite = Date.now() + ESPERA_MAXIMA_MS;
  let retomadas = 0;

  while (!tentar()) {
    if (Date.now() >= limite) {
      return {
        travou: false,
        motivo:
          `NÃO EXECUTADO — a organização de prova (${chave}) seguiu ocupada depois de ` +
          `${Math.round(ESPERA_MAXIMA_MS / 1000)}s de espera. Contagens agregadas sobre ` +
          `organização compartilhada não sobrevivem a duas fixtures simultâneas, e falso ` +
          `vermelho custa o portão.`,
        soltar: () => {},
      };
    }

    const vivo = donoVivo(caminho);
    // Trava órfã de processo morto não pode bloquear para sempre — mas remover
    // trava VIVA devolveria a colisão. Idade é a rede secundária, para quando o
    // dono não pôde ser identificado.
    let idade = 0;
    try {
      idade = Date.now() - statSync(caminho).mtimeMs;
    } catch {
      idade = VALIDADE_MS + 1; // sumiu entre as duas chamadas: tenta de novo
    }

    // Dono morto: retomar AGORA, sem gastar a espera. O teto de 3 existe para
    // que uma remoção que nunca funciona (permissão, disco) caia na espera em vez
    // de girar a CPU até o prazo.
    if ((vivo === false || (vivo === null && idade > VALIDADE_MS)) && retomadas < 3) {
      retomadas += 1;
      try {
        rmSync(caminho, { recursive: true, force: true });
      } catch {
        /* outra rodada ganhou a corrida da limpeza: o tentar() acima decide */
      }
      continue;
    }

    dormir(INTERVALO_MS);
  }

  let solto = false;
  const soltar = () => {
    if (solto) return;
    solto = true;
    try {
      rmSync(caminho, { recursive: true, force: true });
    } catch {
      /* já removida */
    }
  };
  // Queda dura (falha de asserção derruba o processo) não pode deixar a trava
  // presa por 15 min: os dois gatilhos, porque `exit` não roda em sinal.
  process.once("exit", soltar);
  process.once("SIGINT", soltar);
  process.once("SIGTERM", soltar);

  return { travou: true, motivo: null, soltar };
}
