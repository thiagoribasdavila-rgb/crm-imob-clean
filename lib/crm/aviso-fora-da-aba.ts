/**
 * O AVISO QUE PRECISA SAIR DA ABA.
 *
 * ── O que existia, e o que faltava ──────────────────────────────────────────
 *
 * `useAlertaDeLeadNova` relê a fila a cada 60 s e acende uma pastilha na barra
 * lateral. Correta e honesta — mas invisível para quem está com o Atlas em
 * segundo plano, que é onde o corretor passa a maior parte do dia: no WhatsApp,
 * na planilha, no portal.
 *
 * O SLA de primeiro contato mais curto desta operação é de 5 minutos. A
 * releitura consome até 60 s deles só para PERCEBER; se ninguém estiver olhando
 * a aba, consome todos.
 *
 * ── AS TRÊS REGRAS QUE ESTE MÓDULO IMPÕE ────────────────────────────────────
 *
 * 1. AVISA UMA VEZ POR LEAD. Repetir o mesmo aviso a cada releitura é o jeito
 *    mais rápido de ensinar alguém a desligar a permissão. Quem já foi avisado
 *    não volta a ser, nem depois de recarregar a página.
 *
 * 2. NÃO AVISA O QUE JÁ ESTÁ NA TELA. Com o Atlas em primeiro plano, a pastilha
 *    já cumpre o papel; empilhar notificação do sistema por cima é ruído.
 *
 * 3. NÃO AVISA A PRIMEIRA LEITURA. Ao abrir o Atlas de manhã com 8 leads
 *    pendentes de ontem, oito notificações não são oito novidades — são o
 *    passado chegando de uma vez. A primeira leitura só estabelece a linha de
 *    base.
 *
 * PURO: sem DOM, sem timers, sem `Notification`. Quem chama decide o que fazer
 * com o resultado — é o que torna cada regra acima testável.
 */

export type ChegadaConhecida = {
  leadId: string;
  nome: string;
  origem: string;
  esperaMinutos: number;
};

export type EstadoDoAviso = {
  /** Ids que já foram anunciados alguma vez nesta instalação. */
  jaAvisados: ReadonlySet<string>;
  /** `false` até a primeira leitura completar. */
  linhaDeBaseEstabelecida: boolean;
  /** O Atlas está em primeiro plano AGORA? */
  abaVisivel: boolean;
};

export type Anuncio = {
  /** O que anunciar. Vazio quando não há nada a anunciar. */
  paraAnunciar: ChegadaConhecida[];
  /** Título curto do aviso do sistema. `null` quando não há aviso. */
  titulo: string | null;
  /** Corpo do aviso. `null` quando não há aviso. */
  corpo: string | null;
  /** Para onde levar ao clicar. Uma lead → a ficha dela; várias → a lista. */
  destino: string | null;
  /** Os ids que passam a contar como avisados. Inclui os suprimidos. */
  proximosAvisados: string[];
};

/**
 * Decide o que anunciar.
 *
 * Os ids suprimidos (por aba visível ou por linha de base) TAMBÉM entram em
 * `proximosAvisados`. É deliberado: se ficassem de fora, minimizar a janela
 * depois dispararia o anúncio de tudo o que a pessoa acabou de ver na tela.
 */
export function decidirAnuncio(
  chegadas: readonly ChegadaConhecida[],
  estado: EstadoDoAviso,
): Anuncio {
  const novas = chegadas.filter((chegada) => !estado.jaAvisados.has(chegada.leadId));
  const todosOsIds = [...estado.jaAvisados, ...chegadas.map((c) => c.leadId)];

  const silencio = (): Anuncio => ({
    paraAnunciar: [],
    titulo: null,
    corpo: null,
    destino: null,
    proximosAvisados: todosOsIds,
  });

  if (!novas.length) return silencio();
  // Regra 3: a primeira leitura só estabelece a linha de base.
  if (!estado.linhaDeBaseEstabelecida) return silencio();
  // Regra 2: a pastilha já está fazendo o trabalho.
  if (estado.abaVisivel) return silencio();

  const primeira = novas[0];
  const titulo = novas.length === 1
    ? "Lead nova na sua carteira"
    : `${novas.length} leads novas na sua carteira`;
  const corpo = novas.length === 1
    ? `${primeira.nome} · ${primeira.origem}${primeira.esperaMinutos > 0 ? ` · esperando há ${primeira.esperaMinutos} min` : " · agora"}`
    : `${primeira.nome} e mais ${novas.length - 1}. A mais antiga espera há ${Math.max(...novas.map((n) => n.esperaMinutos))} min.`;

  return {
    paraAnunciar: novas,
    titulo,
    corpo,
    // Uma lead: abre a ficha, que é onde o atendimento começa. Mais de uma:
    // abre a lista, porque escolher qual atender primeiro é decisão de quem
    // atende — e a lista é onde ela se toma.
    destino: novas.length === 1 ? `/leads/${primeira.leadId}` : "/leads",
    proximosAvisados: todosOsIds,
  };
}

/**
 * Poda a memória de avisados para não crescer sem fim.
 *
 * Guardar todo id já avisado desde sempre transformaria o `localStorage` num
 * cemitério que só cresce. O teto é generoso o suficiente para que uma lead não
 * volte a ser anunciada dentro de qualquer jornada real, e os mais RECENTES são
 * os que ficam — são eles que podem reaparecer na próxima leitura.
 */
export function podarAvisados(ids: readonly string[], teto = 500): string[] {
  const unicos = [...new Set(ids)];
  return unicos.length <= teto ? unicos : unicos.slice(unicos.length - teto);
}
