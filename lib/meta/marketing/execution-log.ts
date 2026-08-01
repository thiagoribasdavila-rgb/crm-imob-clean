/**
 * Rastro de órfãos da execução governada de campanha Meta — coletores PUROS
 * que a ROTA usa para persistir o que ficou criado (e, se preciso, limpar).
 *
 * Contexto: executeSteps (campaign-executor) PARA na primeira falha e devolve
 * os StepResult já emitidos — inclusive os passos que criaram estruturas reais
 * na Graph antes do erro. Essas estruturas nascem PAUSED, mas ficam ÓRFÃS
 * (uma campanha sem ad set, um ad set sem ad, etc.). Este módulo não toca banco
 * nem rede: transforma os StepResult num registro que a rota grava, e monta o
 * plano de DELETE que uma rotina de limpeza executaria depois.
 *
 * Tudo aqui é PURO e determinístico — nenhum acesso a banco/rede/relógio.
 */

import type { StepResult } from "./campaign-executor";

/** Um id realmente criado na Graph, com o tipo do objeto. */
export type OrphanId = { kind: string; id: string };

/**
 * Registro de órfãos que a rota persistiria após uma execução real.
 * - createdIds: objetos que a Graph confirmou criar (com id real), em ordem de criação.
 * - complete: a execução chegou ao fim sem falha (nada a limpar).
 * - orphaned: sobrou estrutura criada numa execução que NÃO completou (há o que limpar).
 */
export type OrphanRecord = {
  createdIds: OrphanId[];
  complete: boolean;
  orphaned: boolean;
};

/** id "de verdade" (não é o sintético do dry-run) e não vazio. */
function isRealId(id: string | undefined, dryRun: boolean): id is string {
  return !dryRun && typeof id === "string" && id.length > 0 && !id.startsWith("DRYRUN_");
}

/**
 * Coletor puro sobre os StepResult devolvidos por executeSteps.
 *
 * Regras:
 * - createdIds só inclui passos ok, com id REAL (dry-run não cria nada).
 * - complete: houve resultado e TODOS deram ok (a execução chegou ao fim).
 * - orphaned: NÃO completou E sobrou pelo menos um id real criado.
 *
 * Dry-run: createdIds fica vazio (nada tocou a rede) e orphaned é false —
 * mesmo que o dry-run "complete", ele não deixa rastro real a limpar.
 */
export function buildOrphanRecord(stepResults: readonly StepResult[]): OrphanRecord {
  const complete = stepResults.length > 0 && stepResults.every((r) => r.ok);
  const createdIds: OrphanId[] = [];
  for (const r of stepResults) {
    if (r.ok && isRealId(r.id, r.dryRun)) {
      createdIds.push({ kind: r.kind, id: r.id });
    }
  }
  const orphaned = !complete && createdIds.length > 0;
  return { createdIds, complete, orphaned };
}

/** Um passo de limpeza: arquiva/deleta um objeto criado (a rota é quem executa). */
export type CleanupStep = {
  kind: string;
  id: string;
  /** DELETE em /{version}/{id} — a Graph aceita DELETE para remover o objeto. */
  method: "DELETE";
  /** Path relativo à raiz da Graph (a rota antepõe host + versão). */
  path: string;
};

/**
 * Monta os passos de limpeza dos órfãos — PURO, NÃO executa nada.
 *
 * Ordem INVERSA à criação: a cadeia é campanha → ad set → creative → ad, então
 * remove-se ad → creative → ad set → campanha (filho antes do pai) para não
 * esbarrar em dependência. Cada passo é um DELETE /{id}; a rotina de limpeza
 * (numa rota, com token + versão) é quem toca a rede.
 */
export function cleanupPlan(createdIds: readonly OrphanId[]): CleanupStep[] {
  return [...createdIds]
    .reverse()
    .map(({ kind, id }) => ({ kind, id, method: "DELETE" as const, path: id }));
}
