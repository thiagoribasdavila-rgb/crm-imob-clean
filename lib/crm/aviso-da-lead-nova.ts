/**
 * O AVISO DE QUE A LEAD CAIU NA CARTEIRA — pelo canal que já existe.
 *
 * ── Por que Telegram e não WhatsApp ─────────────────────────────────────────
 *
 * O pedido foi "avisar o corretor pelo WhatsApp". Investigado em 03/08/2026, o
 * caminho do WhatsApp exige `messages.conversation_id`, que é NOT NULL e aponta
 * para a conversa de UMA LEAD. Um aviso interno entrando ali apareceria no
 * histórico de conversa do cliente — o corretor abriria a ficha e leria o robô
 * avisando sobre a própria lead, no meio do que ele falou com a pessoa.
 *
 * O produto já tem canal para falar com o corretor: `lib/integrations/telegram.ts`,
 * usado pelo vigia de SLA desde a fase dele, com política de PII declarada e
 * envio que nunca derruba quem chama. Reusá-lo custa zero tabela nova e zero
 * poluição de dado de cliente.
 *
 * ── A POLÍTICA DE PII, HERDADA E MANTIDA ───────────────────────────────────
 *
 * O alerta de SLA leva "contagem, prazo e link para a fila" — nunca nome,
 * telefone ou e-mail. Este aviso segue a mesma regra, e a razão é a mesma: a
 * mensagem viaja por um app de terceiro, para um aparelho que pode não ser
 * corporativo, e fica lá para sempre. O nome da lead não precisa fazer essa
 * viagem para o corretor saber que precisa abrir o Atlas.
 *
 * Isso é uma diferença deliberada em relação ao aviso do NAVEGADOR
 * (`lib/crm/aviso-fora-da-aba.ts`), que leva o nome: lá a mensagem não sai do
 * dispositivo já autenticado, e some ao ser lida.
 *
 * PURO: sem banco, sem rede, sem relógio.
 */

export type AtribuicaoRecente = {
  leadId: string;
  corretorId: string;
  /** ISO. Quando a lead foi entregue. */
  em: string;
};

export type CorretorAlcancavel = {
  profileId: string;
  nome: string;
  /** `null` quando o corretor não tem canal cadastrado — é a lacuna que o worker denuncia. */
  telegramChatId: string | null;
};

export type AvisoParaEnviar = {
  profileId: string;
  chatId: string;
  texto: string;
  quantas: number;
};

export type PlanoDeAviso = {
  enviar: AvisoParaEnviar[];
  /**
   * Corretores que receberiam lead e NÃO têm canal. Sem esta lista, ligar o
   * aviso para uma equipe inteira sem `telegram_chat_id` seria um recurso que
   * roda, responde 200 e não avisa ninguém — em silêncio.
   */
  semCanal: Array<{ profileId: string; nome: string; quantas: number }>;
  /** Total de atribuições consideradas nesta passagem. */
  consideradas: number;
};

/**
 * Agrupa as atribuições por corretor e monta uma mensagem por pessoa.
 *
 * UMA mensagem por corretor, não uma por lead: cinco leads em dois minutos
 * seriam cinco notificações, e cinco notificações seguidas é como se ensina
 * alguém a silenciar um canal.
 */
export function planejarAvisos(
  atribuicoes: readonly AtribuicaoRecente[],
  corretores: readonly CorretorAlcancavel[],
  linkDaFila: string,
): PlanoDeAviso {
  const porCorretor = new Map<string, number>();
  for (const atribuicao of atribuicoes) {
    if (!atribuicao.corretorId) continue;
    porCorretor.set(atribuicao.corretorId, (porCorretor.get(atribuicao.corretorId) ?? 0) + 1);
  }

  const porId = new Map(corretores.map((c) => [c.profileId, c]));
  const enviar: AvisoParaEnviar[] = [];
  const semCanal: PlanoDeAviso["semCanal"] = [];

  for (const [profileId, quantas] of [...porCorretor.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const corretor = porId.get(profileId);
    // Quem não está na lista de corretores não é ignorado em silêncio: entra em
    // `semCanal` com o id, porque "recebeu lead e não sei quem é" também é uma
    // lacuna que alguém precisa ver.
    if (!corretor || !corretor.telegramChatId) {
      semCanal.push({ profileId, nome: corretor?.nome ?? profileId.slice(0, 8), quantas });
      continue;
    }
    enviar.push({
      profileId,
      chatId: corretor.telegramChatId,
      quantas,
      texto: montarAviso(quantas, linkDaFila),
    });
  }

  return { enviar, semCanal, consideradas: atribuicoes.length };
}

/**
 * O texto. Sem nome, sem telefone, sem e-mail — ver a política acima.
 *
 * A última linha existe porque o aviso sem próximo passo vira aviso que se
 * aprende a fechar: o que para o relógio do primeiro contato é o registro no
 * Atlas, e é isso que a mensagem pede.
 */
export function montarAviso(quantas: number, linkDaFila: string): string {
  const cabeca = quantas === 1
    ? "🔔 Uma lead nova caiu na sua carteira."
    : `🔔 ${quantas} leads novas caíram na sua carteira.`;
  return [
    cabeca,
    "",
    `Abrir: ${linkDaFila}`,
    "O prazo de primeiro contato começa a correr na chegada — registre o contato no Atlas assim que falar.",
  ].join("\n");
}

/**
 * A marca d'água da passagem anterior.
 *
 * Sem ela, um worker que roda a cada 5 minutos e olha "os últimos 5 minutos"
 * duplica na sobreposição e perde na lacuna. Com ela, cada atribuição é
 * considerada exatamente uma vez.
 *
 * `null` (primeira passagem de todas) NÃO devolve o início dos tempos: avisar
 * sobre todas as atribuições históricas seria a estreia do recurso disparando
 * centenas de mensagens. A primeira passagem olha uma janela curta e assume o
 * resto como passado.
 */
export function marcaDagua(
  ultimaPassagemEm: string | null,
  agora: number,
  janelaDeEstreiaMin = 15,
): string {
  const estreia = new Date(agora - janelaDeEstreiaMin * 60_000).toISOString();
  if (!ultimaPassagemEm) return estreia;
  const anterior = Date.parse(ultimaPassagemEm);
  if (!Number.isFinite(anterior)) return estreia;
  // Teto de segurança: worker parado por dias não pode voltar avisando sobre
  // tudo o que aconteceu no intervalo.
  const tetoDeRecuperacaoMs = 6 * 60 * 60_000;
  const maisAntigoAceitavel = agora - tetoDeRecuperacaoMs;
  return new Date(Math.max(anterior, maisAntigoAceitavel)).toISOString();
}
