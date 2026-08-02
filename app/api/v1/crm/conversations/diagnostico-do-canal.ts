/**
 * O QUE "0 CONVERSAS" QUER DIZER.
 *
 * ── O defeito que este módulo existe para corrigir ──────────────────────────
 *
 * Medido em 02/08/2026 no banco vivo: `conversations` = 0 linhas, `messages` =
 * 0 linhas. A tela `/conversations` desenhava esse zero como se fosse notícia
 * sobre a operação — "nenhuma conversa sincronizada".
 *
 * Não é. Existem DUAS causas possíveis para o mesmo zero, e elas mandam a
 * pessoa fazer coisas opostas:
 *
 *   · **ninguém conversou** — o canal está de pé, ninguém escreveu ainda.
 *     Ação: ir atrás das leads. O zero é uma cobrança à operação.
 *   · **o canal está desligado** — não há caminho por onde uma mensagem entre.
 *     Ação: ligar o canal. O zero não diz NADA sobre a operação, e cobrá-la
 *     por ele é cobrar por um instrumento que não está medindo.
 *
 * Desenhar as duas do mesmo jeito é a mentira mais cara desta tela: ela faz uma
 * falha de instalação parecer desempenho de corretor.
 *
 * ── Os dois caminhos de entrada, lidos do código que já existe ──────────────
 *
 * 1. **Cloud API oficial** — `app/api/webhooks/whatsapp/route.ts`. Ele resolve
 *    a organização procurando em `integrations` uma linha com
 *    `provider='whatsapp'` e `external_account_id = phone_number_id`. Não
 *    achou, ele faz `continue` e devolve **200 `{received:true, accepted:0}`**.
 *    Ou seja: sem essa linha a mensagem é descartada EM SILÊNCIO, e a Meta
 *    registra entrega bem-sucedida. É por isso que `mensagemEntraENinguemVe`
 *    existe — é o único estado em que o zero da tela é ativamente enganoso.
 *
 * 2. **Ponte do corretor (QR)** — `app/api/v1/whatsapp/bridge/inbound/route.ts`.
 *    Exige o segredo compartilhado (`ATLAS_WHATSAPP_BRIDGE_SECRET`, senão 503)
 *    e uma sessão conectada em `whatsapp_broker_sessions`.
 *
 * Receber por um dos dois já basta para o zero virar informação de verdade.
 *
 * ── Enviar é mais exigente que receber, e de propósito ──────────────────────
 *
 * Pelo caminho oficial, falar PRIMEIRO com alguém exige template aprovado na
 * Meta — `message_templates` com `status='approved'` tem ZERO linhas. Pela
 * ponte, quem fala é o WhatsApp do próprio corretor e não há template.
 *
 * E-mail não entra na conta: `app/api/v2/messages/send/route.ts` recusa o canal
 * na porta com 501 `EMAIL_CHANNEL_NOT_CONNECTED`.
 *
 * ── Por que módulo PURO, e por que aqui ────────────────────────────────────
 *
 * Sem rede, sem banco, sem relógio: os fatos entram por parâmetro. Decisão que
 * mora em `.tsx` fica fora do alcance de `node --test` (o carregador não tira
 * tipos de JSX), então nenhum contrato a alcançaria.
 *
 * Ele fica colado na rota, e não em `lib/`, por uma razão de escopo desta
 * entrega e não de arquitetura — está anotado no relatório.
 */

/** Quem consegue destravar a pendência. A tela não manda o corretor fazer o que só o dono faz. */
export type QuemResolve = "dono" | "operacao" | "engenharia";

/** O que o zero da tela está dizendo. */
export type LeituraDoZero =
  /** Há conversa: o zero não existe e a pergunta não se aplica. */
  | "nao_ha_zero"
  /** O canal recebe. Ninguém escreveu. O zero é informação real sobre a operação. */
  | "ninguem_conversou"
  /** Não há caminho de entrada. O zero não mede a operação — mede a instalação. */
  | "canal_desligado";

export type Pendencia = {
  id: string;
  titulo: string;
  /** A consequência concreta de continuar assim. Nunca "configure X". */
  porque: string;
  quemResolve: QuemResolve;
  bloqueia: Array<"receber" | "enviar">;
};

/**
 * Os fatos, todos com origem rastreável numa tabela ou numa variável de ambiente.
 * Nenhum deles é estimado.
 */
export type FatosDoCanal = {
  /** Linhas em `conversations` dentro do recorte de quem está olhando. */
  conversas: number;
  /** Linhas em `messages` dentro do mesmo recorte. */
  mensagens: number;
  /**
   * Linhas em `integrations` com `provider='whatsapp'` e `external_account_id`
   * preenchido — a condição EXATA que o webhook usa para achar a organização.
   *
   * A coluna `status` de propósito NÃO entra aqui. Ela existe, mas o webhook
   * nunca a consulta, e nenhum código do repositório escreve nela algo além do
   * padrão `'disconnected'` (verificado no banco: `column_default` =
   * `'disconnected'::text`). Exigir `status='active'` faria este painel dizer
   * "canal desligado" para sempre, inclusive depois de o dono cadastrar os dez
   * números — a tela chamaria de defeito exatamente o trabalho que ele fez.
   */
  numerosOficiais: number;
  /** Linhas em `whatsapp_broker_sessions` com `status='conectado'`. */
  sessoesDeCorretorConectadas: number;
  /** `ATLAS_WHATSAPP_BRIDGE_SECRET` presente e com 16+ caracteres. Só o booleano — nunca o valor. */
  ponteConfigurada: boolean;
  /** Linhas em `message_templates` com `status='approved'`. */
  templatesAprovados: number;
};

export type DiagnosticoDoCanal = {
  podeReceber: boolean;
  podeEnviar: boolean;
  caminhosDeEntrada: { oficial: boolean; ponte: boolean };
  leituraDoZero: LeituraDoZero;
  /** A frase que a tela mostra no lugar de um vazio mudo. */
  frase: string;
  /**
   * A Cloud API aceitaria a mensagem com 200 e a jogaria fora, porque não há
   * número cadastrado para resolver a organização. Só vale a pena dizer quando
   * ainda não há NENHUM número: com um cadastrado, o descarte deixaria de ser a
   * regra e passaria a ser um caso específico que este módulo não consegue ver.
   */
  mensagemEntraENinguemVe: boolean;
  pendencias: Pendencia[];
};

const PENDENCIA_NUMERO: Pendencia = {
  id: "numero-oficial",
  titulo: "Nenhum número de WhatsApp cadastrado na tabela integrations",
  porque:
    "O webhook da Meta encontra a organização pelo phone_number_id. Sem essa linha ele responde 200 e descarta a mensagem — a Meta marca entrega feita, e a conversa não existe em lugar nenhum.",
  quemResolve: "dono",
  bloqueia: ["receber", "enviar"],
};

const PENDENCIA_TEMPLATE: Pendencia = {
  id: "template-aprovado",
  titulo: "Nenhum template aprovado na Meta",
  porque:
    "Falar primeiro com alguém pelo WhatsApp oficial só é permitido por template aprovado. Sem nenhum, o corretor consegue responder dentro da janela de 24h, mas não consegue iniciar conversa.",
  quemResolve: "dono",
  bloqueia: ["enviar"],
};

const PENDENCIA_PONTE_SEGREDO: Pendencia = {
  id: "ponte-segredo",
  titulo: "A ponte do WhatsApp do corretor está desligada no servidor",
  porque:
    "Sem a variável ATLAS_WHATSAPP_BRIDGE_SECRET, a rota de entrada da ponte responde 503 a tudo. O corretor pode conversar o dia inteiro pelo celular dele que nada chega ao CRM.",
  quemResolve: "engenharia",
  bloqueia: ["receber", "enviar"],
};

const PENDENCIA_PONTE_SESSAO: Pendencia = {
  id: "ponte-sessao",
  titulo: "Nenhum corretor conectou o WhatsApp pelo QR",
  porque:
    "A ponte está habilitada no servidor, mas sem sessão conectada não há celular de onde as mensagens venham.",
  quemResolve: "operacao",
  bloqueia: ["receber", "enviar"],
};

/**
 * Traduz os fatos na única pergunta que a tela precisa responder.
 *
 * A ordem das pendências é por consequência: o que impede RECEBER vem antes do
 * que impede ENVIAR, porque não receber é o que apaga a memória do CRM — e
 * memória perdida não volta depois que o canal liga.
 */
export function diagnosticarCanal(fatos: FatosDoCanal): DiagnosticoDoCanal {
  // A mesma condição do webhook, nada além dela: uma linha whatsapp com
  // `external_account_id`. Ver a nota em `numerosOficiais`.
  const oficial = fatos.numerosOficiais > 0;
  const ponte = fatos.ponteConfigurada && fatos.sessoesDeCorretorConectadas > 0;

  const podeReceber = true; // MUTACAO DO AUDITOR: canal morto passa a "ninguem conversou"
  // Enviar pelo oficial exige o par número+template; pela ponte, quem fala é o
  // WhatsApp do próprio corretor e template não se aplica.
  const podeEnviar = (oficial && fatos.templatesAprovados > 0) || ponte;

  const pendencias: Pendencia[] = [];
  if (fatos.numerosOficiais === 0) pendencias.push(PENDENCIA_NUMERO);
  if (!fatos.ponteConfigurada) pendencias.push(PENDENCIA_PONTE_SEGREDO);
  else if (fatos.sessoesDeCorretorConectadas === 0) pendencias.push(PENDENCIA_PONTE_SESSAO);
  if (fatos.templatesAprovados === 0) pendencias.push(PENDENCIA_TEMPLATE);

  const leituraDoZero: LeituraDoZero =
    fatos.conversas > 0 ? "nao_ha_zero" : podeReceber ? "ninguem_conversou" : "canal_desligado";

  const frase =
    leituraDoZero === "nao_ha_zero"
      ? `${fatos.conversas} conversa(s) registrada(s), com ${fatos.mensagens} mensagem(ns).`
      : leituraDoZero === "ninguem_conversou"
        ? "O canal está de pé e nenhuma mensagem chegou ainda. Este zero é sobre a operação, não sobre a instalação."
        : "Nenhuma mensagem pode chegar: não há caminho de entrada ligado. Este zero NÃO diz que ninguém conversou — diz que o produto não teria como saber.";

  return {
    podeReceber,
    podeEnviar,
    caminhosDeEntrada: { oficial, ponte },
    leituraDoZero,
    frase,
    mensagemEntraENinguemVe: fatos.numerosOficiais === 0,
    pendencias,
  };
}
