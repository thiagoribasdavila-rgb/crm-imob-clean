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
import { mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Uma rodada travada mais que isto morreu sem soltar: a trava é retomável. */
const VALIDADE_MS = 15 * 60_000;

export function tentarTravar(chave) {
  const caminho = join(tmpdir(), `atlas-org-de-prova-${chave}.lock`);

  const tentar = () => {
    try {
      mkdirSync(caminho);
      return true;
    } catch (erro) {
      if (erro.code !== "EEXIST") throw erro;
      return false;
    }
  };

  if (!tentar()) {
    // Trava órfã de processo morto não pode bloquear para sempre — mas remover
    // trava VIVA devolveria a colisão. A idade é o único sinal disponível aqui.
    let idade = 0;
    try {
      idade = Date.now() - statSync(caminho).mtimeMs;
    } catch {
      idade = VALIDADE_MS + 1; // sumiu entre as duas chamadas: tenta de novo
    }
    if (idade <= VALIDADE_MS) {
      return {
        travou: false,
        motivo:
          `NÃO EXECUTADO — outra rodada detém a organização de prova (${chave}) há ` +
          `${Math.round(idade / 1000)}s. Contagens agregadas sobre organização ` +
          `compartilhada não sobrevivem a duas fixtures simultâneas, e falso ` +
          `vermelho custa o portão. A propriedade está sendo medida pela outra rodada.`,
        soltar: () => {},
      };
    }
    try {
      rmSync(caminho, { recursive: true, force: true });
    } catch {
      /* outra rodada ganhou a corrida da limpeza: o tentar() abaixo decide */
    }
    if (!tentar()) {
      return {
        travou: false,
        motivo: `NÃO EXECUTADO — a trava de ${chave} foi retomada por outra rodada.`,
        soltar: () => {},
      };
    }
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
