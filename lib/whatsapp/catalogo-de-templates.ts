/**
 * O TEMPLATE DE WHATSAPP NÃO TINHA ONDE SER CADASTRADO.
 *
 * ── O defeito que este módulo existe para corrigir ──────────────────────────
 *
 * Medido em 02/08/2026 no banco vivo `pozbrcsfthnhmnebfoxv`:
 * `message_templates` tem **0 linhas de QUALQUER status**. E a varredura do
 * repositório encontra **26 referências à tabela, ZERO delas escrevendo**:
 * seis leitores (`/api/v1/crm/reactivation`, `/api/v1/integrations/whatsapp`,
 * `/api/v1/crm/conversations`, `/api/v1/ai/prontidao-para-ligar`,
 * `/api/v2/ai/nightly-sales`, `/api/v2/ai/sombra-do-atendimento`) exigem uma
 * linha `status='approved'` que nenhum caminho do produto sabia criar.
 *
 * A tela `/integrations/whatsapp` chegava a dizer "Cadastre e sincronize ao
 * menos um template aprovado" — e não havia cadastro nem sincronização. Era
 * uma cobrança sem porta.
 *
 * A consequência dessa lacuna não é local. É uma cadeia inteira parada:
 * sem template aprovado a IA não envia → sem envio não nasce jornada
 * (`ai_sales_journeys` = 0) → sem jornada não há entrega matinal
 * (`nightly_broker_handoffs` = 0). Três tabelas vazias, e o dono sendo
 * cobrado por um dado que não tinha por onde entrar.
 *
 * ── A regra que este módulo protege, e que é a mais cara de todas ──────────
 *
 * **`approved` é um fato da META, nunca uma escolha nossa.**
 *
 * Se o produto deixasse alguém digitar "aprovado", o CRM estaria afirmando
 * algo que só a Meta pode dizer. O prejuízo não é cosmético: os seis leitores
 * acima passariam a considerar a lead elegível, o envio sairia, a Cloud API
 * recusaria — e a lead já teria sido marcada como abordada. Perde-se a lead
 * E a memória de que ela não foi abordada.
 *
 * Por isso a escrita da operação é limitada a `draft` e `pending`
 * (`STATUS_QUE_A_OPERACAO_ESCREVE`), e `approved`/`rejected` só entram por
 * `traduzirStatusDaMeta`, que recebe a palavra literal da Graph API.
 *
 * ── Por que módulo PURO ────────────────────────────────────────────────────
 *
 * Sem rede, sem banco, sem relógio. A decisão que separa "a Meta disse" de
 * "alguém digitou" precisa ser alcançável por `node --test`; decisão que mora
 * dentro da rota ou do `.tsx` fica fora do alcance de qualquer contrato — e
 * este repositório já viu uma asserção sobreviver a `if (false)`.
 *
 * ── O esquema é o REAL, lido de information_schema em 02/08/2026 ───────────
 *
 * Colunas: id, organization_id, channel, name, category, language, subject,
 * body, variables (jsonb, default `[]`), status, external_template_id,
 * created_at, updated_at.
 *
 * CHECKs vivos:
 *   channel ∈ {whatsapp, email, sms, instagram, messenger}
 *   status  ∈ {draft, pending, approved, rejected, archived}
 * UNIQUE (organization_id, channel, name, language)
 *
 * Nada aqui foi deduzido pelo nome da coluna.
 */

/** O CHECK vivo de `message_templates.status`. Nenhum valor além destes é aceito pelo banco. */
export const STATUS_NO_BANCO = ["draft", "pending", "approved", "rejected", "archived"] as const;
export type StatusNoBanco = (typeof STATUS_NO_BANCO)[number];

/**
 * O que a operação pode escrever com as próprias mãos.
 *
 * `draft` = escrito aqui, ainda nem submetido à Meta.
 * `pending` = submetido no Business Manager, aguardando o parecer dela.
 *
 * `approved` e `rejected` estão FORA de propósito: são veredito da Meta.
 * `archived` também — quem arquiva é a sincronização, quando o template some
 * do lado de lá.
 */
export const STATUS_QUE_A_OPERACAO_ESCREVE = ["draft", "pending"] as const;
export type StatusDaOperacao = (typeof STATUS_QUE_A_OPERACAO_ESCREVE)[number];

/** As três categorias que a Meta reconhece para template de WhatsApp. */
export const CATEGORIAS = ["utility", "marketing", "authentication"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/**
 * Idiomas aceitos na tela. A Meta aceita muito mais; a lista curta existe para
 * a operação brasileira não errar o código e criar um template que a Cloud API
 * nunca encontra (o par nome+idioma é a chave do envio).
 */
export const IDIOMAS = ["pt_BR", "en_US", "es_ES", "es_AR"] as const;

/** O nome de template na Meta: minúsculas, números e sublinhado. Nada mais. */
export const REGRA_DO_NOME = /^[a-z0-9_]{1,512}$/;

export type EntradaDeTemplate = {
  nome: string;
  idioma: string;
  categoria: string;
  corpo: string;
  /** `draft` ou `pending`. Ver `STATUS_QUE_A_OPERACAO_ESCREVE`. */
  situacao: string;
};

export type TemplateValidado = {
  name: string;
  language: string;
  category: Categoria;
  body: string;
  /**
   * SEMPRE um array. Não é preferência de estilo: `/api/v1/integrations/whatsapp`
   * decide a elegibilidade do ensaio com `Array.isArray(t.variables) && t.variables.length > 0`.
   * Guardar um objeto aqui faria `Array.isArray` devolver `false`, e um template
   * COM variáveis passaria como se não tivesse nenhuma — o ensaio sairia
   * malformado e a Meta recusaria.
   */
  variables: string[];
  status: StatusDaOperacao;
  channel: "whatsapp";
};

export type Recusa = { campo: string; motivo: string };

/**
 * Os parâmetros que o corpo exige, extraídos do próprio corpo.
 *
 * Digitar a lista de parâmetros à mão, separada do texto, é criar duas
 * verdades sobre o mesmo template: o corpo pede `{{2}}` e a lista diz que só
 * existe um parâmetro. Quem descobre é a Cloud API, no envio, com a lead já
 * marcada. Aqui a lista é DERIVADA — não há como divergir.
 *
 * A ordem é a de aparição, e a repetição é colapsada: `{{1}} ... {{1}}` é um
 * parâmetro usado duas vezes, não dois.
 */
export function extrairParametros(corpo: string): string[] {
  const achados: string[] = [];
  for (const casamento of String(corpo ?? "").matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    const nome = casamento[1];
    if (!achados.includes(nome)) achados.push(nome);
  }
  return achados;
}

/**
 * Valida o que a operação digitou. Devolve recusas — nunca corrige em silêncio.
 *
 * Corrigir em silêncio seria pior do que recusar: o operador acharia que
 * cadastrou o template que a Meta aprovou, e cadastrou outro. O par
 * (nome, idioma) é a chave que a Cloud API usa; errar nele é enviar para o
 * vazio.
 */
export function validarTemplate(entrada: EntradaDeTemplate): { ok: true; template: TemplateValidado } | { ok: false; recusas: Recusa[] } {
  const recusas: Recusa[] = [];
  const nome = String(entrada.nome ?? "").trim().toLowerCase();
  const idioma = String(entrada.idioma ?? "").trim();
  const categoria = String(entrada.categoria ?? "").trim().toLowerCase();
  const corpo = String(entrada.corpo ?? "").trim();
  const situacao = String(entrada.situacao ?? "").trim().toLowerCase();

  if (!REGRA_DO_NOME.test(nome)) {
    recusas.push({
      campo: "nome",
      motivo: "O nome precisa ser exatamente o da Meta: só minúsculas, números e sublinhado. É por ele que a Cloud API encontra o template no envio.",
    });
  }
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(idioma)) {
    recusas.push({
      campo: "idioma",
      motivo: "O idioma precisa ser o código da Meta (ex.: pt_BR). Nome e idioma juntos são a chave do envio — um deles errado e a mensagem não sai.",
    });
  }
  if (!(CATEGORIAS as readonly string[]).includes(categoria)) {
    recusas.push({ campo: "categoria", motivo: `Categoria precisa ser uma das que a Meta reconhece: ${CATEGORIAS.join(", ")}.` });
  }
  if (corpo.length < 2) {
    recusas.push({ campo: "corpo", motivo: "O corpo do template não pode ficar vazio — é o texto que a lead vai ler." });
  }
  if (corpo.length > 1024) {
    recusas.push({ campo: "corpo", motivo: "A Meta limita o corpo do template a 1024 caracteres." });
  }
  if (!(STATUS_QUE_A_OPERACAO_ESCREVE as readonly string[]).includes(situacao)) {
    // A recusa nomeia a razão inteira, e não "valor inválido": é a única
    // salvaguarda entre o produto e uma afirmação que ele não pode fazer.
    recusas.push({
      campo: "situacao",
      motivo:
        `Só é possível registrar como ${STATUS_QUE_A_OPERACAO_ESCREVE.join(" ou ")}. ` +
        "`approved` é um fato da Meta: quem diz que o template está aprovado é ela, pela Graph API, na sincronização. " +
        "Se o CRM marcasse aprovado por conta própria, o envio sairia, a Meta recusaria — e a lead já estaria marcada como abordada.",
    });
  }

  if (recusas.length) return { ok: false, recusas };
  return {
    ok: true,
    template: {
      name: nome,
      language: idioma,
      category: categoria as Categoria,
      body: corpo,
      variables: extrairParametros(corpo),
      status: situacao as StatusDaOperacao,
      channel: "whatsapp",
    },
  };
}

/* ── O VEREDITO DA META ───────────────────────────────────────────────────── */

/**
 * A única porta por onde `approved` entra no banco.
 *
 * O vocabulário da Graph é maior que o nosso CHECK e a tradução não é
 * decorativa: `PAUSED`, `DISABLED` e `LIMIT_EXCEEDED` descrevem templates que
 * JÁ foram aprovados um dia e que **não podem enviar agora**. Traduzi-los para
 * `approved` porque "já passaram pela Meta" seria reabrir exatamente o buraco
 * que este módulo fecha — os seis leitores olham `status='approved'` e mais
 * nada.
 *
 * A regra é uma frase: só `APPROVED` vira `approved`. Qualquer palavra
 * desconhecida cai em `pending`, que é o estado que NÃO libera envio — um
 * vocabulário novo da Meta nunca pode destravar o produto sozinho.
 */
export function traduzirStatusDaMeta(statusDaMeta: string): StatusNoBanco {
  const palavra = String(statusDaMeta ?? "").trim().toUpperCase();
  if (palavra === "APPROVED") return "approved";
  if (palavra === "REJECTED") return "rejected";
  if (palavra === "PENDING" || palavra === "IN_APPEAL" || palavra === "PENDING_DELETION") return "pending";
  // Aprovados que perderam o direito de enviar. Não são `approved` e não são
  // `rejected` — `archived` diz "existe lá, não serve para enviar agora".
  if (palavra === "PAUSED" || palavra === "DISABLED" || palavra === "LIMIT_EXCEEDED" || palavra === "DELETED") return "archived";
  return "pending";
}

/** O que a Graph devolve em `/{waba}/message_templates`, no recorte que usamos. */
export type TemplateDaMeta = {
  id?: string;
  name?: string;
  status?: string;
  category?: string;
  language?: string;
  components?: Array<{ type?: string; text?: string; format?: string }>;
};

export type TemplateImportado = {
  name: string;
  language: string;
  category: Categoria;
  body: string;
  variables: string[];
  status: StatusNoBanco;
  external_template_id: string | null;
  channel: "whatsapp";
  /** A palavra literal que a Meta usou. Vai para a tela, não para o banco (não há coluna). */
  statusLiteralDaMeta: string;
};

/**
 * Converte um template da Meta na linha que o banco aceita.
 *
 * O corpo sai do componente `BODY` — é o único que a Cloud API renderiza como
 * texto da mensagem. `HEADER` e `FOOTER` existem, mas guardá-los no `body`
 * faria os leitores mandarem para a lead um texto diferente do aprovado.
 *
 * Devolve `null` quando o template não tem nome ou não tem corpo: importar uma
 * linha sem corpo criaria um template que passa nos filtros dos seis leitores e
 * envia mensagem vazia.
 */
export function importarTemplateDaMeta(bruto: TemplateDaMeta): TemplateImportado | null {
  const nome = String(bruto?.name ?? "").trim().toLowerCase();
  if (!REGRA_DO_NOME.test(nome)) return null;
  const corpo = String(bruto?.components?.find((c) => String(c?.type ?? "").toUpperCase() === "BODY")?.text ?? "").trim();
  if (corpo.length < 2) return null;
  const categoriaBruta = String(bruto?.category ?? "").trim().toLowerCase();
  const categoria = (CATEGORIAS as readonly string[]).includes(categoriaBruta) ? (categoriaBruta as Categoria) : "utility";
  const idioma = String(bruto?.language ?? "").trim() || "pt_BR";
  const externo = String(bruto?.id ?? "").trim();
  return {
    name: nome,
    language: idioma,
    category: categoria,
    body: corpo,
    variables: extrairParametros(corpo),
    status: traduzirStatusDaMeta(String(bruto?.status ?? "")),
    external_template_id: externo || null,
    channel: "whatsapp",
    statusLiteralDaMeta: String(bruto?.status ?? "").trim().toUpperCase() || "SEM_STATUS",
  };
}

/* ── O QUE DESTRAVA QUANDO O TEMPLATE ENTRAR ──────────────────────────────── */

/**
 * Uma medida que sabe dizer que não foi medida.
 *
 * Mesma forma de `lib/ai/prontidao-para-ligar.ts`, e pela mesma razão: `0` é
 * uma afirmação sobre o mundo, `null` é uma afirmação sobre a leitura. Um
 * `count ?? 0` nesta fronteira faria a tela desenhar "0 leads esperando —
 * nada a ganhar" no dia em que o banco não respondesse, e ninguém abre chamado
 * contra uma tela que mostra zero.
 */
export type Medida = { valor: number | null; comoFoiMedido: string; motivoSemMedida?: string };

export type FatosDoDestrave = {
  /** `leads` com `first_contacted_at IS NULL` nesta organização. */
  semPrimeiroContato: Medida;
  /** `leads` com `status='perdido'` nesta organização. */
  perdidas: Medida;
  /** `ai_sales_journeys` nesta organização. */
  jornadas: Medida;
  /** `nightly_broker_handoffs` nesta organização. */
  entregasMatinais: Medida;
};

export type Destrave = {
  /** A frase que a tela mostra. Nunca inventa número que não foi medido. */
  frase: string;
  /** Cada elo da cadeia, com o número medido ou a confissão de que não deu para medir. */
  elos: Array<{ titulo: string; numero: number | null; detalhe: string }>;
  /** Verdadeiro quando ALGUMA leitura falhou — a tela precisa dizer isso em voz alta. */
  algumaLeituraFalhou: boolean;
};

const frag = (m: Medida, singular: string, plural: string) =>
  m.valor === null ? `um número que não deu para medir de ${plural}` : `${m.valor} ${m.valor === 1 ? singular : plural}`;

/**
 * Traduz os fatos medidos na única frase que justifica o cadastro.
 *
 * Ela nunca diz "0 leads esperando" quando a leitura falhou, e nunca promete
 * envio: template aprovado é condição NECESSÁRIA, não suficiente — o número
 * oficial em `integrations` e o consentimento continuam valendo. Prometer
 * envio aqui criaria a segunda mentira desta cadeia.
 */
export function descreverDestrave(fatos: FatosDoDestrave, temTemplateAprovado: boolean): Destrave {
  const algumaLeituraFalhou = [fatos.semPrimeiroContato, fatos.perdidas, fatos.jornadas, fatos.entregasMatinais].some((m) => m.valor === null);

  const elos = [
    {
      titulo: "Leads que nunca foram procuradas",
      numero: fatos.semPrimeiroContato.valor,
      detalhe: "Falar PRIMEIRO com alguém pelo WhatsApp oficial só é permitido por template aprovado. Sem nenhum, estas leads não têm como receber a primeira mensagem.",
    },
    {
      titulo: "Leads perdidas",
      numero: fatos.perdidas.valor,
      detalhe: "A reativação (`/api/v1/crm/reactivation`) procura uma linha `status='approved'` antes de qualquer envio. Não achando, ela nem tenta.",
    },
    {
      titulo: "Jornadas de venda criadas",
      numero: fatos.jornadas.valor,
      detalhe: "A jornada nasce do primeiro envio. Sem template, nenhuma nasceu.",
    },
    {
      titulo: "Entregas matinais ao corretor",
      numero: fatos.entregasMatinais.valor,
      detalhe: "A entrega matinal resume a jornada da noite. Sem jornada, não há o que entregar.",
    },
  ];

  if (temTemplateAprovado) {
    return {
      frase:
        "Já existe template aprovado pela Meta nesta organização — este elo da cadeia está resolvido. " +
        "Se ainda não sai mensagem, o bloqueio está em outro lugar (número oficial em `integrations` ou consentimento da lead), não aqui.",
      elos,
      algumaLeituraFalhou,
    };
  }

  return {
    frase:
      `Enquanto não houver template aprovado, ${frag(fatos.semPrimeiroContato, "lead nunca procurada continua", "leads nunca procuradas continuam")} ` +
      `sem receber a primeira mensagem, e ${frag(fatos.perdidas, "lead perdida segue", "leads perdidas seguem")} sem reativação. ` +
      "Aprovar o template não faz a mensagem sair sozinha — ele destrava a permissão de FALAR PRIMEIRO, que hoje é o que está faltando.",
    elos,
    algumaLeituraFalhou,
  };
}
