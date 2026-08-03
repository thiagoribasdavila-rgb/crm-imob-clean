/**
 * OS IDENTIFICADORES DA META — e o que cada número NÃO é.
 *
 * ── O defeito que este módulo existe para tornar impossível ────────────────
 *
 * A Meta usa números longos para coisas diferentes, e trocar um pelo outro
 * produz erro de PERMISSÃO em vez de erro de identificador. Foi assim que a
 * conta de anúncios `2169318190556460` foi tratada como Página: a Graph
 * responde "não autorizado", quem lê conclui que falta permissão, e o
 * diagnóstico erra de camada — às vezes por meses.
 *
 * A regra dura: **conta de anúncios nunca é Página**. Não vira Página com
 * prefixo `act_`, não vira Página sem ele.
 *
 * ── Por que puro, e por que compartilhado ──────────────────────────────────
 *
 * A tela precisa recusar antes de enviar; a rota precisa recusar mesmo se a
 * tela não recusar. Duas implementações da mesma regra divergem — este
 * repositório já pagou por isso em `score`/`score_ia`, `name`/`full_name` e no
 * recorte de status declarado nove vezes. Aqui a regra nasce em um lugar só.
 *
 * PURO: sem rede, sem banco, sem `process.env`.
 */

/** Só dígitos, 5 a 25 — a faixa dos ids numéricos da Graph. */
const SO_DIGITOS = /^\d{5,25}$/;

export type Recusa = { ok: false; codigo: string; mensagem: string };
export type Aceite = { ok: true; valor: string };
export type Veredito = Recusa | Aceite;

/**
 * Contas de anúncio conhecidas que NÃO podem ser usadas como Página.
 *
 * A lista existe porque o erro já aconteceu com um número específico e a
 * mensagem genérica ("id inválido") não ensinaria nada a quem o digitou de
 * novo. Um id aqui recebe a explicação exata do que ele é.
 */
export const CONTAS_DE_ANUNCIO_CONHECIDAS: Record<string, string> = {
  "2169318190556460": "Inside – Senna",
};

/**
 * Valida um ID de Página Meta.
 *
 * Recusa, em ordem: vazio, prefixo `act_`, formato não numérico, e por último
 * um id que sabidamente é conta de anúncios. A ordem importa: `act_2169…`
 * deve ouvir que prefixo `act_` é de conta, não que "o formato é inválido".
 */
export function validarPageId(bruto: unknown): Veredito {
  const valor = String(bruto ?? "").trim();

  if (!valor) {
    return {
      ok: false,
      codigo: "META_PAGE_AUSENTE",
      mensagem: "Informe o ID numérico da Página Meta — é ele que recebe os formulários de lead.",
    };
  }

  if (/^act_/i.test(valor)) {
    return {
      ok: false,
      codigo: "META_PAGE_E_CONTA_DE_ANUNCIO",
      mensagem:
        "Esse é o ID de uma CONTA DE ANÚNCIOS (o prefixo act_ denuncia), não de uma Página. " +
        "A Página é a identidade que publica o anúncio, e o ID dela não tem prefixo. " +
        "Usar um no lugar do outro faz a Meta responder erro de permissão — e o problema é o identificador.",
    };
  }

  if (!SO_DIGITOS.test(valor)) {
    return {
      ok: false,
      codigo: "META_PAGE_FORMATO",
      mensagem: "O ID da Página tem só dígitos. Cole o número, sem nome, sem URL e sem prefixo.",
    };
  }

  const conta = CONTAS_DE_ANUNCIO_CONHECIDAS[valor];
  if (conta) {
    return {
      ok: false,
      codigo: "META_PAGE_E_CONTA_DE_ANUNCIO",
      mensagem:
        `O número ${valor} é a CONTA DE ANÚNCIOS "${conta}", não uma Página. ` +
        "A Página é a identidade que aparece publicando o anúncio; a conta é onde a verba é debitada. " +
        "A Graph responde erro de permissão quando recebe um no lugar do outro, e o diagnóstico erra de camada.",
    };
  }

  return { ok: true, valor };
}

/**
 * Valida o ID do formulário. Ausente é LEGÍTIMO quando a origem aceita todos.
 *
 * `allForms` não é conveniência: uma Página com vários formulários ativos e uma
 * origem presa a um deles perde as leads dos outros em silêncio — a lead chega,
 * não casa a fonte, e vai para `meta_leads_sem_destino` esperar alguém notar.
 */
export function validarFormId(bruto: unknown, todosOsFormularios: boolean): Veredito {
  const valor = String(bruto ?? "").trim();

  if (todosOsFormularios) {
    // Com "todos", um formId preenchido seria contradição: a origem diria que
    // aceita tudo e o filtro prenderia a um. `null` é o valor honesto.
    return { ok: true, valor: "" };
  }

  if (!valor) {
    return {
      ok: false,
      codigo: "META_FORM_AUSENTE",
      mensagem:
        "Escolha um formulário, ou marque “todos os formulários desta Página”. " +
        "Sem uma das duas, a lead chega e não encontra origem — e fica esperando alguém perceber.",
    };
  }

  if (!SO_DIGITOS.test(valor)) {
    return { ok: false, codigo: "META_FORM_FORMATO", mensagem: "O ID do formulário tem só dígitos." };
  }

  return { ok: true, valor };
}

/**
 * A ORDEM DE RESOLUÇÃO do pageId, dita uma vez.
 *
 * 1. o que o pedido mandou — quem está na tela sabe qual Página quer;
 * 2. o que a fonte salvou — o Atlas vai operar várias Páginas, e a config da
 *    origem é a fonte principal, não a variável global;
 * 3. `META_PAGE_ID` — só compatibilidade, para não quebrar quem já dependia dela;
 * 4. recusa nomeada, quando nenhuma das três existe.
 *
 * Deixar a variável global vencer o pedido tornaria o seletor da tela
 * decorativo: a pessoa escolheria uma Página e o servidor consultaria outra.
 */
export function resolverPageId(fontes: {
  doPedido?: unknown;
  daFonteSalva?: unknown;
  doAmbiente?: unknown;
}): Veredito & { origem?: "pedido" | "fonte" | "ambiente" } {
  const candidatos: Array<{ origem: "pedido" | "fonte" | "ambiente"; bruto: unknown }> = [
    { origem: "pedido", bruto: fontes.doPedido },
    { origem: "fonte", bruto: fontes.daFonteSalva },
    { origem: "ambiente", bruto: fontes.doAmbiente },
  ];

  for (const { origem, bruto } of candidatos) {
    if (!String(bruto ?? "").trim()) continue;
    const veredito = validarPageId(bruto);
    // Um valor PRESENTE e inválido não é ignorado em favor do próximo: se a
    // pessoa colou a conta de anúncios, ela precisa ouvir isso — e não ver o
    // sistema consultar silenciosamente a Página do ambiente.
    return veredito.ok ? { ...veredito, origem } : veredito;
  }

  return {
    ok: false,
    codigo: "META_PAGE_AUSENTE",
    mensagem:
      "Nenhuma Página informada: nem no pedido, nem na origem salva, nem em META_PAGE_ID. " +
      "Escolha a Página na tela — ela é o que liga os formulários de lead ao CRM.",
  };
}
