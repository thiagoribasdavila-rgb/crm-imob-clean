export type CompatRow = Record<string, unknown>;

const text = (value: unknown) => typeof value === "string" ? value : "";
const first = (row: CompatRow, ...keys: string[]) => {
  for (const key of keys) if (row[key] !== null && row[key] !== undefined && row[key] !== "") return row[key];
  return null;
};

/**
 * O `first` das LISTAS: devolve a primeira coluna com CONTEÚDO, não a primeira
 * que existe.
 *
 * Existe separado de propósito, em vez de ensinar `first` a pular `[]`: `first`
 * também resolve temperatura, papel comercial e datas, e uma lista vazia é o
 * único caso em que "presente" e "respondido" divergem. Mudar a regra geral para
 * consertar um caso de array mexeria em dez decisões que já estão certas.
 */
const primeiraListaComConteudo = (row: CompatRow, ...keys: string[]): string[] => {
  for (const key of keys) {
    const lista = stringList(row[key]);
    if (lista.length > 0) return lista;
  }
  return [];
};

export const LIVE_LEAD_SELECT = [
  "id",
  "name",
  "phone",
  "email",
  "project",
  "source",
  "campaign",
  "status",
  "score_ia",
  "classificacao_ia",
  "temperature",
  "assigned_user_id",
  "created_at",
  "organization_id",
  "notes",
  "next_action",
  "next_contact",
  "legacy_broker",
  "import_batch_id",
  "source_row",
  "project_id",
  "campaign_id",
  "budget_min",
  "budget_max",
  // Valor APURADO da venda (o do contrato) — distinto do orçamento declarado
  // acima. Sem esta coluna no select, a tela lê `undefined`, a métrica de
  // ganho zera e o painel de venda não consegue mostrar o que já foi apurado.
  "sale_value_brl",
  "sale_value_recorded_at",
  "preferred_bedrooms",
  "preferred_min_area",
  "preferred_neighborhoods",
  "payment_method",
  "purchase_timeline",
  "monthly_income",
  "available_down_payment",
  "fgts_balance",
  "desired_monthly_payment",
  "financing_required",
  "financing_term_months",
  "financial_restrictions",
  "financial_notes",
].join(",");

/**
 * Colunas do SLA de primeiro contato (migration da fase 34).
 *
 * Ficam FORA do LIVE_LEAD_SELECT de propósito: o banco legado não as tem, e
 * incluí-las no select base derrubaria com 42703 toda rota que o usa. Quem
 * precisa da medição pede este select estendido e trata a ausência com
 * `isMissingColumn` — ver `selectComSlaOuBase`.
 *
 * `mapLegacyLead` já mapeia estes campos desde sempre; o que faltava era alguém
 * BUSCÁ-LOS. Sem isso o Kanban renderiza SLA eternamente nulo.
 */
export const FIRST_CONTACT_SLA_COLUMNS = [
  "first_contact_due_at",
  "first_contacted_at",
  "first_contact_sla_minutes",
  "first_response_minutes",
  "first_contact_sla_met",
] as const;

/**
 * Colunas V3 da PRÓXIMA AÇÃO. Mesma história do bloco acima, uma coluna adiante.
 *
 * `mapLegacyLead` faz `next_action_at: first(row, "next_action_at",
 * "next_contact")` desde sempre — mas `next_action_at` não estava em nenhum
 * select. A canônica nunca chegava na linha, o mapeador caía na legada, e a
 * legada está vazia em 217/217 nesta base.
 *
 * Efeito medido: a AGENDA mostrava zero follow-ups com 9 leads tendo próxima
 * ação marcada. O motor estava certo, a leitura é que não trazia o dado.
 *
 * Fica aqui, e não em LIVE_LEAD_SELECT, porque bases anteriores à migração V3
 * não a têm e incluí-la no select base derrubaria com 42703 toda rota que o
 * usa — a mesma razão que já valia para o SLA.
 *
 * ── CUIDADO AO ACRESCENTAR COLUNA AQUI ──────────────────────────────────────
 *
 * O fallback é TUDO OU NADA: uma coluna ausente devolve 42703 e a leitura cai
 * para `LIVE_LEAD_SELECT`, perdendo o grupo inteiro — inclusive o SLA, que não
 * tem nada a ver. Foi o que aconteceu na primeira tentativa desta correção: eu
 * incluí `next_action_label` junto, ela NÃO existe neste banco, e o resultado
 * foi a agenda continuar sem follow-up E o SLA parar de ser lido.
 *
 * Antes de somar uma coluna: confirme que ela existe no banco vivo.
 */
export const NEXT_ACTION_COLUMNS = [
  "next_action_at",
  // `development_id` é a coluna canônica do empreendimento — 174/217 nesta
  // base, contra 0/217 da legada `project_id`, que está no select desde sempre.
  // Sem ela, Clientes 360 marcava TODOS os 217 clientes como "sem projeto",
  // inclusive os 174 que têm.
  "development_id",
  // `purpose` (finalidade da compra) — mesma história: 174/217 preenchidos e
  // nunca buscados. Somadas, as duas produziam 434 lacunas falsas num painel
  // cuja função é dizer o que falta preencher. Painel de qualidade que manda
  // preencher o que já está preenchido é pior que painel nenhum: ensina a
  // operação a ignorá-lo.
  "purpose",
] as const;

export const LIVE_LEAD_SELECT_WITH_SLA = [
  LIVE_LEAD_SELECT,
  ...FIRST_CONTACT_SLA_COLUMNS,
  ...NEXT_ACTION_COLUMNS,
].join(",");

/**
 * Colunas de perfil lidas por 15 arquivos — toda tela que mostra o nome de uma
 * pessoa: Clientes 360, atividade, tarefas, leads, time, distribuição,
 * conversão da equipe, SLA do time e os painéis diários.
 *
 * `full_name` entrou porque faltava. `mapLegacyProfile` faz
 * `full_name: first(row, "full_name", "name")` desde sempre, tentando a
 * canônica primeiro — mas ela não estava no select, então o mapeador caía em
 * `name`.
 *
 * Medido nesta base: `full_name` preenchido em 8/8 perfis, `name` em 3/8.
 * Cinco das oito pessoas apareciam sem nome (ou como "Usuário Atlas") em TODAS
 * essas telas — inclusive os três corretores, que são justamente quem a
 * distribuição precisa nomear para decidir a quem mandar a próxima lead.
 *
 * É a mesma doença do select de leads, uma tabela adiante: o select base ficou
 * no vocabulário antigo enquanto o banco andou, e o mapeador mascarava a
 * diferença caindo na coluna legada em silêncio.
 */
// `last_seen_at` foi adicionado em 20260727030000 e CONFERIDO no banco vivo
// antes de entrar aqui. O recuo deste select é tudo-ou-nada: uma coluna
// inexistente derruba o grupo inteiro com 42703, e a página perde também
// `availability_status` e `max_active_leads` sem erro visível.
export const LIVE_PROFILE_SELECT = "id,name,full_name,email,role,active,organization_id,team,max_active_leads,availability_status,last_seen_at";

const statusAliases: Record<string, string> = {
  new: "novo",
  novo: "novo",
  novo_lead: "novo",
  contact: "contato",
  contato: "contato",
  contato_realizado: "contato",
  em_atendimento: "contato",
  qualified: "qualificacao",
  qualificado: "qualificacao",
  qualificacao: "qualificacao",
  qualificação: "qualificacao",
  meeting: "visita",
  visita: "visita",
  visita_agendada: "visita",
  negociacao: "proposta",
  negociação: "proposta",
  proposal: "proposta",
  proposta: "proposta",
  proposta_enviada: "proposta",
  contract: "contrato",
  contrato: "contrato",
  contrato_assinado: "contrato",
  won: "ganho",
  ganho: "ganho",
  venda: "ganho",
  vendido: "ganho",
  lost: "perdido",
  perdido: "perdido",
  buyer_elsewhere: "comprou_outro",
  comprou_outro: "comprou_outro",
  archived: "arquivado",
  arquivado: "arquivado",
};

const statusStorageAliases: Record<string, string[]> = {
  novo: ["novo", "NOVO", "novo_lead", "NOVO_LEAD"],
  contato: ["contato", "CONTATO", "contato_realizado", "CONTATO_REALIZADO", "em_atendimento", "EM_ATENDIMENTO"],
  qualificacao: ["qualificacao", "QUALIFICACAO", "qualificação", "QUALIFICAÇÃO", "qualificado", "QUALIFICADO"],
  visita: ["visita", "VISITA", "visita_agendada", "VISITA_AGENDADA"],
  proposta: ["proposta", "PROPOSTA", "proposta_enviada", "PROPOSTA_ENVIADA", "negociacao", "NEGOCIACAO"],
  contrato: ["contrato", "CONTRATO", "contrato_assinado", "CONTRATO_ASSINADO"],
  ganho: ["ganho", "GANHO", "venda", "VENDA", "vendido", "VENDIDO"],
  perdido: ["perdido", "PERDIDO"],
  comprou_outro: ["comprou_outro", "COMPROU_OUTRO"],
  arquivado: ["arquivado", "ARQUIVADO", "archived", "ARCHIVED"],
};

export function canonicalLeadStatus(value: unknown) {
  const normalized = text(value).trim().toLocaleLowerCase("pt-BR");
  return statusAliases[normalized] || normalized || "novo";
}

export function compatibleLeadStatuses(value: unknown) {
  const canonical = canonicalLeadStatus(value);
  return statusStorageAliases[canonical] || [text(value).trim()].filter(Boolean);
}

/**
 * O status pedido pertence ao vocabulário do produto?
 *
 * ── O defeito que isto fecha ────────────────────────────────────────────────
 *
 * `compatibleLeadStatuses` tem um caminho de escape: status desconhecido volta
 * como `[o-que-veio]`, e a consulta faz `.in("status", ["xpto"])` — que devolve
 * ZERO linhas, com HTTP 200, sem erro nenhum.
 *
 * Medido em 2026-07-31 contra a rota real: `/api/v1/crm/leads?status=xpto`
 * respondeu 200 com total 0, sobre uma base de 482 leads.
 *
 * Lista vazia se lê como "não há trabalho". Numa operação com 472 leads sem
 * primeiro contato, essa é a pior mensagem que o sistema pode emitir — e ela
 * sai de um link com erro de digitação.
 *
 * A guarda JÁ EXISTIA, do lado do cliente: `app/(crm)/leads/page.tsx` valida o
 * status da URL contra a lista do seletor, e o comentário de lá diz exatamente
 * isto. Mas o cliente é a única porta que ele controla. Quem chama a API direto,
 * ou por um link antigo, passava reto. Guarda em um lado só é guarda que o
 * outro lado não tem.
 *
 * Devolve `true` para vazio: ausência de filtro não é filtro inválido.
 */
export function ehStatusConhecido(value: unknown): boolean {
  const bruto = text(value).trim();
  if (!bruto) return true;
  const normalizado = bruto.toLocaleLowerCase("pt-BR");
  if (statusAliases[normalizado]) return true;
  return Object.prototype.hasOwnProperty.call(statusStorageAliases, normalizado);
}

/** O vocabulário canônico, para a mensagem de erro poder listar o que vale. */
export function statusConhecidos(): string[] {
  return Object.keys(statusStorageAliases);
}

export function liveLeadSortColumn(value: unknown) {
  if (value === "score") return "score_ia";
  if (value === "updated_at") return "created_at";
  return value === "name" ? "name" : "created_at";
}

export function canonicalCommercialRole(value: unknown) {
  const normalized = text(value).trim().toLocaleLowerCase("pt-BR");
  const aliases: Record<string, string> = {
    administrador: "admin",
    admin: "admin",
    owner: "admin",
    diretor: "director",
    diretor_decisor: "director",
    diretor_comercial: "director",
    superintendent: "superintendent",
    superintendente: "superintendent",
    gerente: "manager",
    manager: "manager",
    corretor: "broker",
    broker: "broker",
    viewer: "viewer",
  };
  return aliases[normalized] || normalized || "broker";
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => text(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function purposeFromNotes(value: unknown) {
  const match = text(value).match(/Objetivo declarado:\s*(moradia|investimento|loca[cç][aã]o)\.?/i);
  if (!match) return null;
  const normalized = match[1].toLocaleLowerCase("pt-BR");
  return normalized.startsWith("loca") ? "locacao" : normalized;
}

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || /could not find the table|relation .* does not exist/i.test(error.message || "")));
}

export function isMissingColumn(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && (error.code === "42703" || /column .* does not exist|could not find.*column/i.test(error.message || "")));
}

export function mapLegacyLead(row: CompatRow): CompatRow {
  const rawTemperature = first(row, "temperature", "classificacao_ia");
  return {
    ...row,
    status: canonicalLeadStatus(first(row, "status")),
    score: Number(first(row, "score", "score_ia") ?? 0),
    temperature: text(rawTemperature).trim().toLocaleLowerCase("pt-BR") || null,
    assigned_to: first(row, "assigned_to", "assigned_user_id"),
    development_id: first(row, "development_id", "project_id"),
    // V2 uses `next_action` as free text. Only date-shaped fields may feed
    // calendars and SLA calculations.
    next_action_at: first(row, "next_action_at", "next_contact"),
    next_action_label: first(row, "next_action_label", "next_action"),
    last_interaction_at: first(row, "last_interaction_at", "updated_at", "created_at"),
    updated_at: first(row, "updated_at", "created_at"),
    /**
     * ── LISTA VAZIA NÃO É RESPOSTA, E `first` NÃO SABIA DISSO ─────────────────
     *
     * `first` pula `null`, `undefined` e `""` — mas `[]` passa no teste de
     * "presente" e vence a disputa. Medido em 2026-07-30 na organização real:
     *
     *   preferred_regions ......... 0 NULL · 482 array VAZIO
     *   preferred_neighborhoods ... 7 com bairro de verdade
     *
     * Ou seja: a coluna vazia ganhava sempre, e as 7 pessoas que declararam
     * bairro apareciam como se não tivessem declarado nada. A ficha mandava o
     * corretor perguntar de novo o que o cliente já tinha dito, enquanto o painel
     * de compatibilidade — que lê a coluna certa — dizia o contrário na mesma tela.
     *
     * `bedrooms` NÃO tem o defeito: a coluna é NULL nas 482, então o `first` cai
     * corretamente para `preferred_bedrooms`. Consertar os dois "por simetria"
     * teria mexido no que já estava certo.
     */
    preferred_regions: primeiraListaComConteudo(
      row,
      "preferred_regions",
      "preferred_neighborhoods",
      "region",
      "neighborhood",
    ),
    bedrooms: first(row, "bedrooms", "preferred_bedrooms"),
    purpose: first(row, "purpose") || purposeFromNotes(row.notes),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    first_contact_due_at: first(row, "first_contact_due_at"),
    first_contacted_at: first(row, "first_contacted_at"),
    first_contact_sla_minutes: first(row, "first_contact_sla_minutes"),
    first_response_minutes: first(row, "first_response_minutes"),
    first_contact_sla_met: first(row, "first_contact_sla_met"),
  };
}

export function leadAsOpportunity(row: CompatRow): CompatRow {
  const lead = mapLegacyLead(row);
  return {
    id: lead.id,
    lead_id: lead.id,
    name: first(lead, "name") || "Lead sem nome",
    stage: first(lead, "status") || "novo",
    value: first(lead, "value", "budget_max", "budget_min") ?? 0,
    probability: 0,
    assigned_to: lead.assigned_to,
    development_id: lead.development_id,
    created_at: lead.created_at,
    updated_at: first(lead, "updated_at", "created_at"),
    compatibility_source: "legacy_lead",
  };
}

export function mapLegacyTask(row: CompatRow): CompatRow {
  return {
    ...row,
    due_at: first(row, "due_at", "due_date", "created_at"),
    assigned_to: first(row, "assigned_to", "user_id"),
    recurrence_id: first(row, "recurrence_id"),
  };
}

export function mapLegacyProject(row: CompatRow): CompatRow {
  return {
    ...row,
    developer_name: first(row, "developer_name", "developer", "company"),
    development_name: first(row, "development_name", "name"),
    status: text(first(row, "status") || "ativo"),
    neighborhood: first(row, "neighborhood", "bairro"),
    city: first(row, "city", "cidade"),
    state: first(row, "state", "uf"),
    delivery_date: first(row, "delivery_date", "previsao_entrega"),
  };
}

export function mapLegacyProfile(row: CompatRow): CompatRow {
  const resolvedRole = canonicalCommercialRole(first(row, "commercial_role", "role"));
  return {
    ...row,
    full_name: first(row, "full_name", "name"),
    access_role: first(row, "access_role") || (resolvedRole === "admin" ? "admin" : resolvedRole === "broker" ? "broker" : "director"),
    commercial_role: resolvedRole === "admin" ? "director" : resolvedRole,
    reports_to: first(row, "reports_to"),
  };
}
