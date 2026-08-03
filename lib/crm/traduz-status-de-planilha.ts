/**
 * O QUE O CORRETOR ESCREVEU NA PLANILHA, TRADUZIDO PARA O FUNIL.
 *
 * ── Por que isto é uma regra e não um `switch` na hora da importação ──────
 *
 * A planilha DAVILA_CHRONOS trouxe 51 leads com o andamento escrito à mão. Em
 * 51 linhas apareceram QUATRO grafias de "em contato" (`Em contato`,
 * `em contato`, `em ontato`, `Em contaro`) e três de "encaminhei"
 * (`Encaminhei`, `Encamminhei`, `Encamiaanhei`). Um `switch` improvisado acerta
 * as certinhas e joga o resto em `novo` sem ninguém perceber — e aí o corretor
 * recebe como "nova" uma pessoa com quem ele já falou três vezes.
 *
 * ── A REGRA MAIS IMPORTANTE: NA DÚVIDA, NÃO FECHA ────────────────────────
 *
 * `ganho` e `perdido` são afirmações caras. Uma venda registrada por engano
 * entra no VGV; uma perda registrada por engano tira a pessoa da fila para
 * sempre. Por isso só fecham com texto INEQUÍVOCO — "contrato assinado",
 * "telefone incorreto", "disse não ter interesse".
 *
 * "Cliente informou que ainda não tem interesse" NÃO fecha: o "ainda" faz todo
 * o trabalho da frase. É um "agora não", e agora-não é lead viva.
 *
 * Texto que não casa com nenhuma regra vira `novo` E preserva o original. Ficar
 * em `novo` com o histórico à vista é honesto; ser adivinhado não.
 *
 * PURO: sem banco, sem rede.
 */

export type EstagioDoFunil = "novo" | "contato" | "qualificacao" | "ganho" | "perdido";

export type Traducao = {
  estagio: EstagioDoFunil;
  /** Motivo do encerramento, quando encerra. `null` nos demais. */
  motivo: string | null;
  /** O texto original, sempre — a tradução nunca substitui o que a pessoa escreveu. */
  textoOriginal: string;
  /** `true` quando alguma regra casou. `false` = caiu em `novo` por não reconhecer. */
  reconhecido: boolean;
};

/** Sem acento e minúsculo: "Em contaro" e "em contato" não podem ser dois casos. */
function normalizar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * As regras, em ordem de precedência. A primeira que casar vence — por isso
 * "ainda não tem interesse" vem ANTES de "não tem interesse", e "agendando
 * visita" vem antes de "visita".
 */
const REGRAS: Array<{
  quando: RegExp;
  estagio: EstagioDoFunil;
  motivo?: string;
  porque: string;
}> = [
  // ── FECHAM, e só com texto inequívoco ────────────────────────────────────
  { quando: /contrato assinado/, estagio: "ganho", porque: "contrato assinado não admite outra leitura" },
  {
    quando: /telefone incorreto|numero (errado|incorreto)/,
    estagio: "perdido",
    motivo: "telefone incorreto",
    porque: "sem telefone válido não há como atender",
  },

  // ── O "AINDA" SALVA A LEAD ───────────────────────────────────────────────
  // Precisa vir antes da regra de "sem interesse", senão o "agora não" vira
  // "nunca" e a pessoa sai da fila.
  {
    quando: /ainda nao tem interesse|deixou (mais )?pra frente|mais pra frente a compra/,
    estagio: "contato",
    porque: "'ainda' e 'mais pra frente' são adiamento, não recusa",
  },
  {
    quando: /(disse|informou) (que )?nao ter interesse|sem interesse|nao tem interesse/,
    estagio: "perdido",
    motivo: "sem interesse declarado",
    porque: "a pessoa disse não",
  },

  // ── VISITA: agendada é qualificação; agendando ainda é contato ───────────
  { quando: /agendando visita|tentando marcar (uma )?visita/, estagio: "contato", porque: "ainda não marcou" },
  { quando: /agendou visita|vai fazer visita|visita agendada/, estagio: "qualificacao", porque: "visita marcada é etapa avançada" },

  // ── TRABALHO EM ANDAMENTO ────────────────────────────────────────────────
  {
    quando: /procura \d|enquadrado em his|solicitou informacoes|com sua solicitacao|vai analisar|em tratativa|pode ir para|mandou in /,
    estagio: "qualificacao",
    porque: "há necessidade declarada — a conversa passou do primeiro contato",
  },
  {
    /**
     * As grafias são literais e ancoradas em `\b`, e as duas coisas foram
     * cobradas pelo contrato:
     *
     *   · `em cont[ae]?r?o` parecia cobrir tudo e NÃO casava com "em contato" —
     *     a grafia CERTA. Eu tinha escrito o padrão olhando o erro de digitação
     *     ("contaro") e a palavra correta ficou de fora. Frouxo não é o mesmo
     *     que abrangente.
     *
     *   · sem o `\b`, "sem contato" casa aqui por dentro ("s|em contato") e uma
     *     lead que nunca foi tocada entra como já trabalhada.
     */
    quando: /\bem cont[ae]to|\bem contaro|\bem ontato|\bem atendimento|primeiro contato|encam[a-z]*nhei|enviei informacoes|tentando (contato|dispertar|despertar)|aguardo retorno|parou de (responder|interagir)|nao responde|comecou a (tratar|interagir)|sumiu/,
    estagio: "contato",
    porque: "o corretor já falou ou tentou falar",
  },

  // ── NADA ACONTECEU AINDA ─────────────────────────────────────────────────
  { quando: /sem interacao|sem contato/, estagio: "novo", porque: "não houve troca" },
];

/**
 * Traduz. `textos` são as células que descrevem o andamento — a planilha usa
 * duas colunas, e a segunda às vezes contradiz a primeira.
 *
 * Regra do conflito: vence o estágio MAIS AVANÇADO entre os reconhecidos, exceto
 * quando um deles FECHA — fechamento sempre vence, porque "telefone incorreto"
 * ao lado de "em contato" significa que o contato não deu certo.
 */
export function traduzirStatusDaPlanilha(...textos: Array<string | null | undefined>): Traducao {
  const original = textos.map((t) => String(t ?? "").trim()).filter(Boolean).join(" · ");
  const alvo = normalizar(original);

  if (!alvo) {
    return { estagio: "novo", motivo: null, textoOriginal: "", reconhecido: false };
  }

  /**
   * PRIMEIRA REGRA QUE CASA VENCE. A ordem declarada JÁ é a precedência.
   *
   * A primeira versão colhia todas as regras que casavam e depois preferia a que
   * FECHA — e isso atropelava a regra do "ainda". "Cliente informou que ainda
   * não tem interesse" casava com a regra do adiamento (contato) E com a de
   * recusa (perdido), e o fechamento vencia. A frase que existia justamente para
   * salvar a lead era anulada pela regra seguinte.
   *
   * Pego no primeiro ensaio, com o texto real da planilha.
   *
   * Com a ordem valendo, o conflito entre as duas colunas também resolve
   * sozinho: "Em contato · Telefone incorreto" casa primeiro em telefone
   * incorreto, que está declarado mais acima porque encerra.
   */
  const regra = REGRAS.find((r) => r.quando.test(alvo));
  if (!regra) {
    // Não reconhecido NÃO vira palpite. Fica `novo` com o texto à vista, e o
    // relatório da importação diz quantas caíram aqui.
    return { estagio: "novo", motivo: null, textoOriginal: original, reconhecido: false };
  }
  return {
    estagio: regra.estagio,
    motivo: regra.motivo ?? null,
    textoOriginal: original,
    reconhecido: true,
  };

}
