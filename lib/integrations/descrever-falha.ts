/**
 * O QUE FOI LANÇADO, EM PALAVRAS — inclusive quando não é um `Error`.
 *
 * ── O que motivou ──────────────────────────────────────────────────────────
 *
 * O processador do outbox fazia:
 *
 *     const message = erro instanceof Error ? erro.message : "Falha desconhecida";
 *
 * Medido em 01/08/2026, na fila de produção: das 8 entregas mortas, **sete**
 * tinham `last_error = "Falha desconhecida"`. Só uma guardou a causa real. As
 * outras sete morreram sem deixar rastro — no momento exato em que o rastro era
 * a única coisa que importava.
 *
 * Em JavaScript qualquer valor pode ser lançado: string, objeto, resposta de
 * `fetch`, `null`. O `instanceof Error` cobre um caso e apaga todos os outros.
 *
 * ── A regra ────────────────────────────────────────────────────────────────
 *
 * Nada é descartado. Se não há descrição possível, o TIPO vai junto — saber que
 * "foi lançado um object vazio" já é infinitamente mais do que "falha
 * desconhecida".
 */

const LIMITE = 900;

function cortar(texto: string): string {
  return texto.length > LIMITE ? `${texto.slice(0, LIMITE)}…` : texto;
}

export function descreverFalha(erro: unknown): string {
  if (erro instanceof Error) {
    /* `cause` do próprio Error costuma carregar o erro de rede por baixo — é
       onde mora a razão real de uma falha de `fetch`, e ela se perdia. */
    const raiz = erro.cause;
    const extra = raiz instanceof Error ? ` · causa: ${raiz.message}` : typeof raiz === "string" ? ` · causa: ${raiz}` : "";
    /* `new Error("")` é legal em JavaScript e devolvia string VAZIA daqui —
       o mesmo silêncio que este módulo existe para acabar, só que por outra
       porta. Foi o contrato deste arquivo que pegou, na primeira execução.
       Sem mensagem, o NOME do erro é a informação que sobra (TypeError,
       AbortError, FetchError…) e ele quase sempre basta para localizar. */
    const descricao = erro.message.trim() || `${erro.name || "Error"} sem mensagem`;
    return cortar(`${descricao}${extra}`);
  }

  if (typeof erro === "string") return cortar(erro.trim() || "erro lançado como string vazia");
  if (typeof erro === "number" || typeof erro === "boolean" || typeof erro === "bigint") return `erro lançado como ${typeof erro}: ${String(erro)}`;
  if (erro === null) return "erro lançado como null";
  if (erro === undefined) return "erro lançado como undefined";

  if (typeof erro === "object") {
    /* Objeto de erro da Graph API e afins: `{ error: { message, code } }`. */
    const alvo = erro as Record<string, unknown>;
    const aninhado = alvo.error && typeof alvo.error === "object" ? (alvo.error as Record<string, unknown>) : null;
    const mensagem = [alvo.message, aninhado?.message].find((v) => typeof v === "string" && v.trim());
    if (typeof mensagem === "string") {
      const codigo = alvo.code ?? aninhado?.code;
      return cortar(codigo === undefined ? mensagem : `${mensagem} [code ${String(codigo)}]`);
    }
    try {
      const json = JSON.stringify(erro);
      /* `{}` serializa para "{}" e não diz nada — nesse caso o TIPO é a
         informação, e o construtor costuma nomeá-lo (Response, TypeError…). */
      if (json && json !== "{}") return cortar(`erro lançado como objeto: ${json}`);
      const nome = (erro as { constructor?: { name?: string } })?.constructor?.name;
      return `erro lançado como objeto ${nome || "sem nome"} e sem propriedades enumeráveis`;
    } catch {
      return "erro lançado como objeto que não pôde ser serializado (referência circular?)";
    }
  }

  return `erro lançado como ${typeof erro}`;
}
