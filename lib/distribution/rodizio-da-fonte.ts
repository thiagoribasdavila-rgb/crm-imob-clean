/**
 * O RODÍZIO DE UMA FONTE — sem guardar de quem era a vez.
 *
 * ── Por que este módulo existe ────────────────────────────────────────────
 *
 * `meta_lead_sources.default_owner_id` aceita UM dono. A operação precisa
 * alternar entre dois corretores nas leads novas da Inside, e não há onde
 * escrever "agora é do outro".
 *
 * ── Por que NÃO guardar o ponteiro ───────────────────────────────────────
 *
 * Um campo "próximo da vez" parece o caminho óbvio e é o que quebra: ele fica
 * desatualizado quando alguém entra no rodízio, sai, é desativado, ou quando
 * duas leads chegam ao mesmo tempo e as duas leem o mesmo ponteiro antes de
 * qualquer uma escrever. Aí os dois recebem a mesma, e o "rodízio" vira sorteio.
 *
 * Aqui a vez é DERIVADA do que já aconteceu: recebe quem tem MENOS leads
 * daquela fonte. É autocorretivo — quem ficou de fora por estar inativo volta
 * recebendo mais até emparelhar — e não tem estado para dessincronizar.
 *
 * O desempate é `posicao`, declarada na tabela. Sem ele, dois corretores
 * empatados em zero teriam a escolha decidida pela ordem que o banco devolveu
 * as linhas — e "quem deveria ter recebido" deixaria de ser reproduzível.
 *
 * PURO: sem banco, sem rede.
 */

export type CandidatoDoRodizio = {
  profileId: string;
  /** Ordem declarada. Desempata, e nunca é a ordem física das linhas. */
  posicao: number;
  /** Quantas leads DESTA fonte já são dele. */
  leadsRecebidas: number;
  /** Fora do rodízio: desativado na tabela, perfil inativo, ou sem vaga. */
  indisponivel?: boolean;
  /** Por que está fora — para o histórico dizer, em vez de a lead sumir. */
  motivoDaIndisponibilidade?: string | null;
};

export type EscolhaDoRodizio = {
  profileId: string | null;
  /** A frase que vai para o histórico de distribuição. */
  porque: string;
  /** Quem estava na disputa, para a decisão poder ser conferida depois. */
  consideradosEmOrdem: string[];
};

/**
 * Escolhe quem recebe a próxima.
 *
 * Devolve `profileId: null` quando não há ninguém disponível — e o `porque`
 * explica qual. Nunca escolhe alguém indisponível "para não deixar a lead sem
 * dono": mandar para quem não pode atender é perder a lead com aparência de
 * resolvida.
 */
export function escolherDoRodizio(candidatos: readonly CandidatoDoRodizio[]): EscolhaDoRodizio {
  if (!candidatos.length) {
    return { profileId: null, porque: "Nenhum corretor no rodízio desta fonte.", consideradosEmOrdem: [] };
  }

  const disponiveis = candidatos.filter((c) => !c.indisponivel);
  if (!disponiveis.length) {
    const motivos = [...new Set(candidatos.map((c) => c.motivoDaIndisponibilidade).filter(Boolean))];
    return {
      profileId: null,
      porque:
        `Todos os ${candidatos.length} do rodízio estão indisponíveis` +
        (motivos.length ? `: ${motivos.join("; ")}` : "."),
      consideradosEmOrdem: [],
    };
  }

  // Menos leads primeiro; empate pela posição declarada.
  const ordenados = [...disponiveis].sort(
    (a, b) => a.leadsRecebidas - b.leadsRecebidas || a.posicao - b.posicao,
  );
  const escolhido = ordenados[0];

  const empatados = ordenados.filter((c) => c.leadsRecebidas === escolhido.leadsRecebidas);
  const porque =
    empatados.length > 1
      ? `Rodízio: empate em ${escolhido.leadsRecebidas} lead(s) entre ${empatados.length}; venceu a posição ${escolhido.posicao}.`
      : `Rodízio: tinha ${escolhido.leadsRecebidas} lead(s) desta fonte, menos que os outros ${ordenados.length - 1}.`;

  return { profileId: escolhido.profileId, porque, consideradosEmOrdem: ordenados.map((c) => c.profileId) };
}

/**
 * A regra do WhatsApp, agora com dono.
 *
 * Estava cravada em `hierarchical-cascade.ts`: TODO degrau exigia sessão
 * conectada, inclusive o dono padrão da fonte. Medido em 03/08/2026:
 * `whatsapp_broker_sessions` tinha ZERO linhas em toda a base, 7 fontes tinham
 * dono padrão definido, e 55 leads estavam sem dono. A regra é boa — corretor
 * sem WhatsApp não atende lead paga no prazo — mas cravada ela também é
 * invisível: quem olha a fila vê 55 órfãs e nenhuma explicação.
 */
export function exigeWhatsapp(regra: { require_whatsapp?: boolean | null } | null | undefined): boolean {
  // Ausência de regra mantém o comportamento histórico. Uma organização sem
  // linha em `distribution_rules` não pode ter a política afrouxada por
  // omissão — seria mudar o comportamento de quem nunca pediu nada.
  return regra?.require_whatsapp !== false;
}
