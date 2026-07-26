/**
 * PRESENÇA DA IA — o sinal que o robô do canto mostra.
 *
 * A regra que este módulo existe para garantir: **o robô só se mexe quando a IA
 * está de fato trabalhando.** Animação perpétua de "processando" é decoração
 * fingindo ser telemetria — depois de dois dias ninguém olha, e quando a IA
 * realmente travar o indicador vai continuar girando alegremente.
 *
 * Como funciona: quem chama IA anuncia o trabalho e recebe de volta a função que
 * o encerra. Sem par `anunciar`/`encerrar`, nada aparece.
 *
 *     const encerrar = anunciarTrabalhoDeIa("Lendo a carteira");
 *     try { await chamarIa(); } finally { encerrar(); }
 *
 * O `finally` não é zelo: é o que impede o robô de ficar preso em "trabalhando"
 * quando a chamada estoura.
 *
 * Módulo de navegador: o estado vive na aba, não no servidor. Isso é proposital
 * — é presença de INTERFACE, não métrica de operação. O custo e a contagem de
 * chamadas continuam sendo apurados no banco, por quem decide verba.
 */

export type TrabalhoDeIa = {
  id: number;
  rotulo: string;
  desde: number;
};

const EVENTO = "atlas:ia-presenca";

let proximoId = 1;
const emAndamento = new Map<number, TrabalhoDeIa>();

function avisar() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TrabalhoDeIa[]>(EVENTO, { detail: trabalhosEmAndamento() }),
  );
}

/** Lista, do mais antigo para o mais novo. O robô mostra o primeiro. */
export function trabalhosEmAndamento(): TrabalhoDeIa[] {
  return [...emAndamento.values()].sort((a, b) => a.desde - b.desde);
}

/**
 * Anuncia que a IA começou algo. Devolve a função que encerra — chame-a sempre,
 * inclusive no caminho de erro.
 *
 * Encerrar duas vezes é seguro: o segundo `delete` não faz nada. Isso importa
 * porque o padrão de uso é `finally`, e componentes desmontados costumam
 * encerrar de novo por precaução.
 */
export function anunciarTrabalhoDeIa(rotulo: string): () => void {
  const id = proximoId++;
  emAndamento.set(id, { id, rotulo: rotulo.trim() || "Pensando", desde: Date.now() });
  avisar();
  return () => {
    if (emAndamento.delete(id)) avisar();
  };
}

/** Assina as mudanças. Devolve a função de cancelamento. */
export function observarPresencaDaIa(
  aoMudar: (trabalhos: TrabalhoDeIa[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const ouvinte = (evento: Event) => {
    aoMudar((evento as CustomEvent<TrabalhoDeIa[]>).detail ?? []);
  };
  window.addEventListener(EVENTO, ouvinte);
  // Entrega o estado atual na assinatura: um componente que monta no meio de uma
  // chamada precisa saber que ela está correndo, não esperar a próxima.
  aoMudar(trabalhosEmAndamento());
  return () => window.removeEventListener(EVENTO, ouvinte);
}
