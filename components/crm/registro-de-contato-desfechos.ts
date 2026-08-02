/**
 * O VOCABULÁRIO DO REGISTRO DE CONTATO — e por que ele mora fora do `.tsx`.
 *
 * ── O BURACO QUE ISTO FECHA ─────────────────────────────────────────────────
 *
 * Medido no banco em 02/08/2026: 490 leads, 22 com `first_contacted_at` (4,5%),
 * **0 atividades de contato**. As 481 atividades existentes são todas
 * `pipeline_stage_changed` — ou seja: o CRM registra que a lead mudou de
 * coluna, e não registra que alguém falou com ela.
 *
 * A rota `POST /api/v1/leads/[id]/first-contact` existe, está correta e fecha
 * o SLA. O componente de registro em 1 clique existe. Os dois estão montados
 * em UM lugar só: `app/(crm)/leads/[id]/page.tsx`, a ficha. Na LISTA — onde o
 * corretor passa o dia e de onde ele liga — não havia nenhuma ocorrência.
 *
 * Para registrar, era preciso abrir a ficha de cada lead. Ninguém faz isso 30
 * vezes por dia. É por isso que 95,5% da base não tem primeiro contato: não é
 * desleixo da operação, é que não havia onde clicar.
 *
 * ── POR QUE UM MÓDULO PURO, E NÃO CONSTANTES DENTRO DO COMPONENTE ───────────
 *
 * `node --test` não tira tipos de JSX: nada que more num `.tsx` é alcançável
 * por contrato neste repositório. A decisão que importa aqui — QUAIS pares
 * (canal, resultado) o botão pode enviar, e o que a linha deve mostrar em cada
 * estado — é decisão pura e precisa ficar onde um teste possa pegá-la.
 *
 * ── E POR QUE OS DOIS CONJUNTOS DA ROTA SÃO DECLARADOS AQUI ─────────────────
 *
 * A rota valida `canal` contra um Set e `resultado` contra outro, e devolve
 * 400 para o que estiver fora. Um rótulo novo escrito à mão no componente com
 * um `resultado` que a rota não conhece não falha em teste nenhum: falha na
 * mão do corretor, como um erro genérico, e ele conclui que o CRM quebrou.
 *
 * Esta é EXATAMENTE a classe de defeito que este repositório já pagou como
 * "caminhos divergentes": dois lados da mesma chamada evoluindo separados.
 * Declarar os conjuntos aqui e anotar `DESFECHOS` com o tipo derivado deles
 * transforma a divergência em erro de `tsc`, e não em 400 silencioso na mão do
 * corretor. `ehAceitoPelaRota` faz a mesma pergunta em tempo de execução, para
 * um contrato poder varrer a lista inteira sem depender do compilador.
 */

/**
 * Os canais que a rota aceita. Espelho de `CANAIS` em
 * `app/api/v1/leads/[id]/first-contact/route.ts`.
 */
export const CANAIS_ACEITOS = [
  "call",
  "whatsapp",
  "email",
  "message",
  "visit",
  "meeting",
  "contact",
] as const;

/**
 * Os desfechos que a rota aceita. Espelho de `RESULTADOS` na mesma rota.
 *
 * Não existe "registrei que liguei" sem desfecho: `resultado` é obrigatório do
 * lado do servidor (o default é `falou`, o que é pior do que exigir — assume
 * sucesso). Do lado do corretor a exigência é explícita: todo botão desta
 * lista carrega um resultado escolhido, nenhum manda o default.
 */
export const RESULTADOS_ACEITOS = [
  "falou",
  "sem_resposta",
  "numero_invalido",
  "agendou",
] as const;

export type CanalDeContato = (typeof CANAIS_ACEITOS)[number];
export type ResultadoDeContato = (typeof RESULTADOS_ACEITOS)[number];

/** O que o botão manda para a rota. Mesma forma que o corpo do POST espera. */
export type RegistroDeContato = {
  canal: CanalDeContato;
  resultado: ResultadoDeContato;
};

export type Desfecho = {
  /** Identidade estável do botão — usada em `key`, em `data-` e em teste. */
  chave: string;
  canal: CanalDeContato;
  resultado: ResultadoDeContato;
  /** O que o botão diz. Sempre um DESFECHO, nunca uma intenção. */
  rotulo: string;
  /**
   * Emoji de CANAL, e só isso.
   *
   * A lei do emoji deste produto reprova enfeite e aprova canal lido em
   * varredura. O rótulo diz o desfecho ("Falei", "Não atendeu") e não diz por
   * onde — o emoji é o único lugar onde a informação de canal cabe sem gastar
   * uma linha por botão. Vai sempre com `aria-hidden`, e o `aria` abaixo
   * carrega a frase inteira para quem não vê o ícone.
   */
  marca: string;
  /** A frase que o leitor de tela ouve — canal e desfecho por extenso. */
  aria: string;
  /** Como a linha fica depois de gravado este desfecho. */
  confirmacao: string;
  /**
   * Primário = fica visível sem nenhum toque anterior. A exigência é registrar
   * o desfecho em UM toque; o que é primário tem de estar na tela já.
   */
  primario: boolean;
  /** Tom da borda. `encerra` = este desfecho tira a lead da fila de ligação. */
  tom: "positivo" | "neutro" | "encerra";
};

const CANAIS = new Set<string>(CANAIS_ACEITOS);
const RESULTADOS = new Set<string>(RESULTADOS_ACEITOS);

/**
 * O par (canal, resultado) sobrevive à validação da rota?
 *
 * Exportada porque é a asserção que um contrato precisa fazer sobre a lista
 * inteira — e porque a própria construção de `DESFECHOS` a usa. Sem isto, o
 * único lugar onde a divergência apareceria seria um HTTP 400 na mão de quem
 * está trabalhando.
 */
export function ehAceitoPelaRota(registro: {
  canal: string;
  resultado: string;
}): boolean {
  return CANAIS.has(registro.canal) && RESULTADOS.has(registro.resultado);
}

/**
 * OS DESFECHOS QUE CABEM NUMA LINHA DE LISTA.
 *
 * ── Por que dois primários, e não cinco ─────────────────────────────────────
 *
 * A fila mostra 20 leads por página. Cinco botões por linha são cem alvos de
 * 44px na tela ao mesmo tempo — a parede que faz a pessoa parar de ler a fila.
 * Os dois primários são os dois desfechos da LIGAÇÃO, que é o gesto descrito:
 * ele vê a fila, liga, e marca o que aconteceu.
 *
 * Os outros três existem e são alcançáveis, um toque atrás do "⋯", no mesmo
 * lugar da tela. Um toque a mais para o caso menos frequente é um preço muito
 * menor do que a fila ilegível — e infinitamente menor do que o preço atual,
 * que é abrir a ficha.
 *
 * ── Por que `numero_invalido` não podia ficar de fora ───────────────────────
 *
 * É o único desfecho que TIRA a lead da fila de ligação. Sem ele o corretor
 * marca "não atendeu" num número morto todo dia, e a base de medição que esta
 * entrega existe para criar nasce envenenada — "tentamos 8 vezes" seria
 * indistinguível de "o telefone não existe".
 *
 * `agendou` fica de fora de propósito: quem agendou tem `NextActionQuickSet`
 * na mesma linha para gravar o compromisso, e "Falei" já carimba o contato.
 * Dois botões para o mesmo ato dividiriam a medição em duas contas.
 */
export const DESFECHOS: readonly Desfecho[] = [
  {
    chave: "ligacao-falou",
    canal: "call",
    resultado: "falou",
    rotulo: "Falei",
    marca: "📞",
    aria: "Registrar: liguei e falei com a pessoa",
    confirmacao: "Falou por telefone",
    primario: true,
    tom: "positivo",
  },
  {
    chave: "ligacao-sem-resposta",
    canal: "call",
    resultado: "sem_resposta",
    rotulo: "Não atendeu",
    marca: "📞",
    aria: "Registrar: liguei e a pessoa não atendeu",
    confirmacao: "Ligou, não atenderam",
    primario: true,
    tom: "neutro",
  },
  {
    chave: "whatsapp-falou",
    canal: "whatsapp",
    resultado: "falou",
    rotulo: "Respondeu no WhatsApp",
    marca: "💬",
    aria: "Registrar: falei por WhatsApp e a pessoa respondeu",
    confirmacao: "Respondeu no WhatsApp",
    primario: false,
    tom: "positivo",
  },
  {
    chave: "whatsapp-sem-resposta",
    canal: "whatsapp",
    resultado: "sem_resposta",
    rotulo: "Mandei, sem retorno",
    marca: "💬",
    aria: "Registrar: mandei WhatsApp e não houve retorno",
    confirmacao: "WhatsApp sem retorno",
    primario: false,
    tom: "neutro",
  },
  {
    chave: "numero-invalido",
    canal: "call",
    resultado: "numero_invalido",
    rotulo: "Número não existe",
    marca: "⛔",
    aria: "Registrar: o número desta lead não existe",
    confirmacao: "Número inválido",
    primario: false,
    tom: "encerra",
  },
];

export const DESFECHOS_PRIMARIOS = DESFECHOS.filter((d) => d.primario);
export const DESFECHOS_SECUNDARIOS = DESFECHOS.filter((d) => !d.primario);

export function desfechoPorChave(chave: string): Desfecho | null {
  return DESFECHOS.find((d) => d.chave === chave) ?? null;
}

/**
 * O QUE A LINHA MOSTRA — a decisão inteira, sem JSX no meio.
 *
 * Quatro estados, e nenhum deles é "silêncio". A falha em particular tem de
 * ser dita: registro otimista que some sem avisar não é um pixel errado, é uma
 * mentira na base de medição — o corretor jura que registrou, o banco não tem
 * a linha, e a próxima auditoria conclui de novo que ninguém liga para lead.
 */
export type EstadoDaLinha =
  | { tipo: "pendente" }
  | { tipo: "registrando"; rotulo: string }
  | { tipo: "registrado"; rotulo: string; ehDesteMomento: boolean }
  | { tipo: "falhou"; rotulo: string; motivo: string };

export function estadoDaLinha(entrada: {
  /** `first_contacted_at` da lead, como veio do servidor ou do patch otimista. */
  contatadoEm: string | null | undefined;
  /** Chave do desfecho em voo, se houver. */
  enviando?: string | null;
  /** Chave do desfecho que acabou de ser gravado nesta sessão de tela. */
  gravado?: string | null;
  /** Mensagem de falha da última tentativa, se houver. */
  falha?: { chave: string; motivo: string } | null;
}): EstadoDaLinha {
  // A falha vem primeiro: ela é a única informação desta lista que o corretor
  // PRECISA ver, porque é a única que exige que ele repita o gesto.
  if (entrada.falha) {
    const alvo = desfechoPorChave(entrada.falha.chave);
    return {
      tipo: "falhou",
      rotulo: alvo ? alvo.confirmacao : "Registro de contato",
      motivo: entrada.falha.motivo,
    };
  }
  if (entrada.enviando) {
    const alvo = desfechoPorChave(entrada.enviando);
    return { tipo: "registrando", rotulo: alvo ? alvo.rotulo : "Registrando" };
  }
  if (entrada.gravado) {
    const alvo = desfechoPorChave(entrada.gravado);
    return {
      tipo: "registrado",
      rotulo: alvo ? alvo.confirmacao : "Contato registrado",
      ehDesteMomento: true,
    };
  }
  // Sem desfecho conhecido, mas com carimbo do servidor: a lead já tinha
  // primeiro contato antes desta tela abrir. O QUE aconteceu não está na
  // listagem (a rota de leads não devolve o canal), e inventar um seria pior
  // que não dizer — então diz-se só a data, que é o que se sabe.
  if (entrada.contatadoEm) {
    return {
      tipo: "registrado",
      rotulo: rotuloDeContatoAnterior(entrada.contatadoEm),
      ehDesteMomento: false,
    };
  }
  return { tipo: "pendente" };
}

/**
 * "1º contato em 28/07".
 *
 * Data curta e nada mais. A listagem não sabe o canal nem o desfecho do
 * contato antigo, e escrever "Falou" ali seria inventar métrica — o defeito
 * que este repositório trata como o mais caro de todos.
 */
export function rotuloDeContatoAnterior(iso: string): string {
  const quando = new Date(iso);
  if (Number.isNaN(quando.getTime())) return "1º contato registrado";
  return `1º contato em ${quando.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })}`;
}
