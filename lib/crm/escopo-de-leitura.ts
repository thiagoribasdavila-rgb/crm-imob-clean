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

/**
 * O MESMO recorte de `filtroDaMinhaCarteira`, mas em JavaScript — para quem já
 * tem a linha na mão e precisa DECIDIR, não consultar.
 *
 * ── POR QUE O GÊMEO EXISTE ───────────────────────────────────────────────────
 *
 * Duas rotas precisam da regra depois de já terem lido a lead (o registro de
 * primeiro contato é uma delas). Sem esta função elas escreveriam a comparação
 * à mão — e comparação escrita à mão é exatamente como nasceram os caminhos
 * divergentes deste repositório: `move.moveId` vs `move.id`,
 * `pipeline_history` vs `pipeline_stage_moves`.
 *
 * As duas formas TÊM de concordar caso a caso, e um contrato executável cobra
 * isso: dono por qualquer das duas colunas entra, lead de outra pessoa fica de
 * fora, lead sem dono nenhum entra (a mesma cláusula órfã do filtro, pelo mesmo
 * motivo: escondê-la a deixaria parada para sempre e ninguém a adotaria).
 */
export function estaNaMinhaCarteira(
  userId: string,
  lead: { assigned_to?: string | null; assigned_user_id?: string | null },
): boolean {
  const porUsuario = lead.assigned_user_id ?? null;
  const porResponsavel = lead.assigned_to ?? null;
  if (!porUsuario && !porResponsavel) return true;
  return porUsuario === userId || porResponsavel === userId;
}

/**
 * O piso de carteira APLICADO a uma consulta — a única forma de ligá-lo.
 *
 * Existia uma terceira cópia do recorte esperando para nascer: cada rota que
 * precisasse do piso montaria o seu `if (papel) query.or(filtro)`. Duas cópias
 * já divergiram neste repositório mais de uma vez; esta função não deixa a
 * terceira existir, e é EXECUTÁVEL — um contrato consegue chamá-la com uma
 * consulta de mentira e conferir se o `or` entrou (e se, para a liderança, não
 * entrou).
 */
export function aplicarPisoDeCarteira<Q extends { or(filtro: string): Q }>(
  consulta: Q,
  perfil: { commercialRole?: string | null; role?: string | null },
  userId: string,
): Q {
  if (!leSoAPropriaCarteira(perfil)) return consulta;
  return consulta.or(filtroDaMinhaCarteira(userId));
}

/**
 * Ids da EQUIPE de alguém: a pessoa e todos que reportam a ela, direta ou
 * indiretamente.
 *
 * ── POR QUE `reports_to` E NÃO `team` ────────────────────────────────────────
 *
 * Existiam duas noções de equipe no código: esta (hierarquia por `reports_to`,
 * a mesma que a trigger private.validate_commercial_hierarchy valida no banco)
 * e uma por `profiles.team`, um texto livre usado no filtro da listagem de
 * leads.
 *
 * Medido em 2026-07-28: `team` está VAZIO em 27 de 27 perfis ativos, enquanto
 * `reports_to` está preenchido em 16. O filtro por texto nunca teve o que
 * comparar — devolvia só o próprio gerente e parecia "equipe de uma pessoa".
 * A hierarquia é a que tem dado e a que o RBAC já exige.
 */
export function idsDaEquipe(
  perfis: ReadonlyArray<{ id: string; reports_to?: string | null; reportsTo?: string | null }>,
  raizId: string,
): string[] {
  const equipe = new Set([raizId]);
  // Repete até estabilizar: a cadeia pode ter mais de um nível (diretor →
  // gerente → corretor) e a ordem da lista não é garantida.
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of perfis) {
      const chefe = String(p.reports_to ?? p.reportsTo ?? "");
      const id = String(p.id ?? "");
      if (id && chefe && equipe.has(chefe) && !equipe.has(id)) {
        equipe.add(id);
        mudou = true;
      }
    }
  }
  return [...equipe];
}

/**
 * A CARTEIRA DE UMA PESSOA — sem as leads de ninguém.
 *
 * Difere de `filtroDaMinhaCarteira` num ponto, e o ponto importa: NÃO inclui a
 * cláusula de lead órfã. Naquela, lead sem dono aparece de propósito, porque
 * uma LISTA precisa que alguém a veja para adotá-la. Aqui é o "Meu dia" do
 * corretor — e lead de ninguém no dia de todo mundo é trabalho que parece
 * atribuído sem ter dono.
 *
 * O que ele conserta: a rota do dia filtrava por `assigned_user_id` sozinho.
 * Medido em 2026-07-29 na organização viva, 3 leads abertos têm `assigned_to`
 * preenchido e `assigned_user_id` NULO — 2 do Vinicius, 1 do Francisco, e uma
 * delas NUNCA foi contatada. Elas aparecem na lista de leads daquelas pessoas
 * e sumiam do dia delas: o painel dizia menos trabalho do que existe, que é a
 * direção errada do erro numa operação com 442 leads sem primeiro contato.
 *
 * As duas colunas, pelo mesmo motivo do resto do arquivo: a base tem histórico
 * nos dois lados e escolher uma só esconde parte da carteira.
 */
export function filtroDaCarteiraDaPessoa(userId: string): string {
  return `assigned_user_id.eq.${userId},assigned_to.eq.${userId}`;
}
