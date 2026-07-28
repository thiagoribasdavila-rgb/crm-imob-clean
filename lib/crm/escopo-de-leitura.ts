/**
 * QUEM VÊ O QUÊ na leitura de leads — uma definição só, para as duas telas.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * O Kanban e a listagem de leads decidem a mesma coisa: esta pessoa enxerga o
 * funil inteiro ou só a própria carteira? Até 2026-07-28 cada um respondia por
 * conta própria — e por um tempo responderam DIFERENTE: o Kanban filtrava por
 * dono, a listagem devolvia as 200 leads da imobiliária para um corretor com
 * zero leads atribuídas.
 *
 * Duas cópias da mesma regra é a classe de defeito que mais apareceu neste
 * repositório: `move.moveId` vs `move.id`, `pipeline_history` vs
 * `pipeline_stage_moves`, `developments` vs `crm_projects`, consentimento do
 * webhook vs da importação. Todas começaram como duplicações inofensivas.
 *
 * Um contrato consegue DETECTAR a divergência; um módulo compartilhado a torna
 * impossível. Este arquivo é a segunda opção.
 */

/**
 * Papéis que respondem pela carteira dos outros e, por isso, leem o funil
 * inteiro. Quem não está aqui lê a própria carteira — mais leads sem dono, que
 * precisam ser vistas por alguém para serem adotadas.
 */
const VE_O_FUNIL_INTEIRO = new Set(["director", "superintendent", "manager", "admin"]);

/**
 * `commercialRole` primeiro, `role` como reserva: é a precedência que o resto
 * do CRM usa. Um `admin` sem papel comercial definido continua sendo liderança
 * — daí a segunda checagem.
 */
export function leLiderancaInteira(input: {
  commercialRole?: string | null;
  role?: string | null;
}): boolean {
  const papel = input.commercialRole || input.role;
  return VE_O_FUNIL_INTEIRO.has(String(papel || "")) || input.role === "admin";
}

/** O oposto, nomeado: lê no máximo a própria carteira. */
export function leSoAPropriaCarteira(input: {
  commercialRole?: string | null;
  role?: string | null;
}): boolean {
  return !leLiderancaInteira(input);
}

/**
 * Filtro PostgREST de posse, com as DUAS colunas de dono.
 *
 * A base tem histórico em `assigned_user_id` e em `assigned_to`; filtrar por
 * uma só esconderia parte da carteira da própria pessoa. Lead sem dono nas
 * duas entra de propósito: escondê-la a deixaria parada para sempre.
 */
export function filtroDaMinhaCarteira(userId: string): string {
  return `assigned_user_id.eq.${userId},assigned_to.eq.${userId},and(assigned_user_id.is.null,assigned_to.is.null)`;
}
