import { atlasNavigation } from "../navigation";
import { defineAtlasPageContract, type AtlasPageAction, type AtlasPageContract } from "./page-contract";

/**
 * O TERCEIRO CATÁLOGO — e por que ele deixou de ter opinião própria sobre a
 * ação primária.
 *
 * ── O DEFEITO, MEDIDO EM 2026-07-29 ──────────────────────────────────────────
 *
 * Este arquivo declarava `primaryAction` por página; `lib/atlas/navigation.ts`
 * declara `primaryAction` por destino. Mesmo campo, mesmo nome, dois donos — e
 * eles JÁ tinham divergido em seis pontos:
 *
 *   command-center → aqui "/pipeline", lá "/pipeline?focus=priority"
 *                    (a promessa "avançar a oportunidade mais relevante" caía
 *                     na lista inteira: o parâmetro se perdeu de um lado só)
 *   leads, tasks-and-agenda, developments, integrations, settings
 *                  → mesmo destino, texto de `outcome` diferente
 *
 * Duas verdades não divergem por descuido de alguém: divergem sozinhas, com o
 * tempo, porque só uma delas é editada quando o produto muda. É a classe de
 * defeito mais cara deste repositório (`RPC vs fallback`, `readCompatible*`),
 * e o remédio é sempre o mesmo — um dono só.
 *
 * ── A DIVISÃO DE TRABALHO QUE FICOU ──────────────────────────────────────────
 *
 * `navigation.ts` responde O QUE FAZER NESTE DESTINO (rótulo, href, resultado).
 * Este registro responde O QUE A PÁGINA GARANTE: métricas de decisão, escopo
 * por papel, dependências com tenant, autonomia do copiloto, ilhas interativas.
 * São perguntas diferentes; só a ação primária era resposta repetida.
 *
 * Os cinco contratos que NÃO derivam (customers-360, activity, reactivation,
 * copilot, revenue-engine) são destinos que não existem em `navigation.ts` —
 * saíram do menu ou nunca estiveram nele. Cada um explica o próprio caso no
 * comentário logo acima da sua ação.
 */
type IdDeDestinoNavegavel = (typeof atlasNavigation)[number]["id"];

function acaoPrimariaDoDestino(
  destino: IdDeDestinoNavegavel,
  idDaAcao: string,
): AtlasPageAction {
  const item = atlasNavigation.find((entrada) => entrada.id === destino);
  if (!item) {
    // Falhar alto, no carregamento do módulo, e não devolver uma ação vazia:
    // destino renomeado no catálogo de navegação não pode virar botão sem
    // href — que é exatamente como as nove promessas decorativas passaram
    // despercebidas. O tipo já barra isso em compilação; isto guarda o runtime.
    throw new Error(`Destino de navegação inexistente: ${destino}`);
  }
  // `id` continua sendo desta casa: ele nomeia a ação DENTRO do contrato de
  // página (evidência, telemetria), não o destino. O resto vem inteiro de lá.
  return { id: idDaAcao, ...item.primaryAction };
}

const allRoles = {
  director: "organization",
  superintendent: "management-tree",
  manager: "team",
  broker: "own-portfolio",
} as const;

const commercialAccess = ["admin", "director_decisor", "director", "broker"] as const;

const managementRoles = {
  director: "organization",
  superintendent: "management-tree",
  manager: "team",
  broker: "hidden",
} as const;

const administrationRoles = {
  director: "organization",
  superintendent: "hidden",
  manager: "hidden",
  broker: "hidden",
} as const;

type SupportingPageContractInput = {
  id: string;
  route: `/${string}`;
  businessOutcome: string;
  primaryAction: AtlasPageContract["primaryAction"];
  metric: AtlasPageContract["decisionMetrics"][number];
  queueTitle: string;
  queueOrdering: readonly string[];
  roleScopes?: AtlasPageContract["roleScopes"];
  allowedAccessRoles?: AtlasPageContract["allowedAccessRoles"];
  dataDomains: readonly string[];
  copilotContext: string;
  copilotCapabilities: readonly string[];
  interactiveIslands: readonly string[];
};

function defineSupportingPageContract(input: SupportingPageContractInput) {
  return defineAtlasPageContract({
    id: input.id,
    route: input.route,
    businessOutcome: input.businessOutcome,
    primaryAction: input.primaryAction,
    decisionMetrics: [input.metric],
    depths: ["glance", "workspace", "context"],
    priorityQueue: { title: input.queueTitle, ordering: input.queueOrdering },
    roleScopes: input.roleScopes ?? allRoles,
    allowedAccessRoles: input.allowedAccessRoles ?? commercialAccess,
    dataDependencies: input.dataDomains.map((domain) => ({
      domain,
      query: `${input.id}-${domain}-workspace`,
      tenantScoped: true as const,
      fallback: "partial-state" as const,
    })),
    copilot: {
      contextId: input.copilotContext,
      capabilities: input.copilotCapabilities,
      maximumAutonomy: 2,
    },
    rendering: { strategy: "server-first", interactiveIslands: input.interactiveIslands },
  });
}

export const atlasCoreV2PageRegistry = [
  defineAtlasPageContract({
    id: "command-center",
    route: "/dashboard",
    businessOutcome: "Mostrar a prioridade comercial que exige decisão ou execução agora.",
    // A rota permanece "/dashboard" (compatibilidade de deep link — a página
    // redireciona para /command-center), mas a AÇÃO é a do destino vivo.
    primaryAction: acaoPrimariaDoDestino("command-center", "open-priority"),
    decisionMetrics: [
      { id: "new-leads", label: "Novos leads", decisionQuestion: "A entrada está sendo atendida?" },
      { id: "overdue-actions", label: "Ações vencidas", decisionQuestion: "Onde existe risco de perda?" },
      { id: "hot-opportunities", label: "Oportunidades quentes", decisionQuestion: "Quais negócios exigem contato?" },
      { id: "pipeline-value", label: "Pipeline", decisionQuestion: "Quanto valor está em movimento?" },
      { id: "conversion", label: "Conversão", decisionQuestion: "A operação está melhorando?" },
    ],
    depths: ["glance", "workspace", "context"],
    priorityQueue: { title: "O que precisa acontecer agora", ordering: ["sla-risk", "buying-intent", "commercial-value", "last-interaction"] },
    roleScopes: allRoles,
    allowedAccessRoles: commercialAccess,
    dataDependencies: [
      { domain: "leads", query: "command-center-lead-health", tenantScoped: true, fallback: "partial-state" },
      { domain: "tasks", query: "command-center-action-health", tenantScoped: true, fallback: "partial-state" },
      { domain: "opportunities", query: "command-center-pipeline-health", tenantScoped: true, fallback: "partial-state" },
    ],
    copilot: { contextId: "command-center-decision", capabilities: ["explain-priority", "prepare-daily-briefing"], maximumAutonomy: 2 },
    rendering: { strategy: "server-first", interactiveIslands: ["period-filter", "priority-queue", "copilot-drawer"] },
  }),
  defineAtlasPageContract({
    id: "leads",
    route: "/leads",
    businessOutcome: "Encontrar e atender rapidamente o lead com maior necessidade de ação.",
    primaryAction: acaoPrimariaDoDestino("leads", "create-lead"),
    decisionMetrics: [
      { id: "visible-leads", label: "Leads visíveis", decisionQuestion: "Qual é o tamanho da carteira acessível?" },
      { id: "hot-leads", label: "Quentes", decisionQuestion: "Quem deve receber contato primeiro?" },
      { id: "unassigned", label: "Sem responsável", decisionQuestion: "O que ainda precisa de distribuição?" },
      { id: "without-next-action", label: "Sem próxima ação", decisionQuestion: "Quem corre risco de esquecimento?" },
    ],
    depths: ["glance", "workspace", "context"],
    priorityQueue: { title: "Minha rotina", ordering: ["overdue-next-action", "temperature", "score", "created-at"] },
    roleScopes: allRoles,
    allowedAccessRoles: commercialAccess,
    dataDependencies: [{ domain: "leads", query: "search-commercial-leads", tenantScoped: true, fallback: "empty-state" }],
    copilot: { contextId: "lead-prioritization", capabilities: ["explain-score", "suggest-next-action", "prepare-message"], maximumAutonomy: 2 },
    rendering: { strategy: "server-first", interactiveIslands: ["lead-search", "lead-filters", "bulk-selection", "lead-drawer"] },
  }),
  defineAtlasPageContract({
    id: "pipeline",
    route: "/pipeline",
    businessOutcome: "Avançar oportunidades com segurança e tornar todo bloqueio comercial visível.",
    primaryAction: acaoPrimariaDoDestino("pipeline", "open-top-opportunity"),
    decisionMetrics: [
      { id: "open-opportunities", label: "Em aberto", decisionQuestion: "Quantos negócios exigem trabalho?" },
      { id: "overdue-sla", label: "SLA vencido", decisionQuestion: "Quais negócios estão em risco?" },
      { id: "weighted-value", label: "Forecast", decisionQuestion: "Qual valor possui evidência de avanço?" },
      { id: "won", label: "Ganhos", decisionQuestion: "Quanto foi convertido no período?" },
    ],
    depths: ["glance", "workspace", "context"],
    priorityQueue: { title: "Fila inteligente", ordering: ["sla-risk", "stage-age", "next-action", "score"] },
    roleScopes: allRoles,
    allowedAccessRoles: commercialAccess,
    dataDependencies: [{ domain: "opportunities", query: "pipeline-board", tenantScoped: true, fallback: "empty-state" }],
    copilot: { contextId: "pipeline-coach", capabilities: ["explain-risk", "suggest-stage-action", "prepare-follow-up"], maximumAutonomy: 2 },
    rendering: { strategy: "server-first", interactiveIslands: ["kanban-board", "stage-movement", "opportunity-drawer"] },
  }),
  // A tela /customers foi aposentada em 2026-07-29 (mesma tabela `leads`, sem
  // piso de carteira — vazava a carteira dos colegas). O CONTRATO do módulo
  // "customers-360" continua válido: a capacidade não sumiu, mudou de lugar.
  // Rota e ação primária apontam para /leads, onde os segmentos por vínculo
  // (lib/crm/vinculo-do-cliente.ts) e o contato copiável agora vivem.
  defineAtlasPageContract({
    id: "customers-360",
    route: "/leads",
    businessOutcome: "Reunir a história do comprador e indicar a melhor continuidade do relacionamento.",
    // PROMESSA CUMPRIDA — conferida antes de tocar, e mantida por isso.
    // `vinculo` não está no vocabulário fechado de lib/atlas/intencao-da-url.ts
    // porque não é intenção de abertura: é FILTRO da lista, da mesma família de
    // `attention`, `status` e `nextAction`, que /leads lê pelo próprio porteiro
    // (app/(crm)/leads/page.tsx:542, validado contra VINCULOS). O recorte
    // existe de verdade — quatro vínculos, padrão "todos" — e o link muda o que
    // a tela mostra. Trocar a chave aqui quebraria um caminho que funciona.
    primaryAction: { id: "open-customer", label: "Abrir cliente prioritário", href: "/leads?vinculo=em_atendimento", outcome: "Continuar o relacionamento com contexto completo." },
    decisionMetrics: [
      { id: "visible-customers", label: "Clientes", decisionQuestion: "Quantos relacionamentos estão no escopo?" },
      { id: "contactable", label: "Com contato", decisionQuestion: "Quantos podem ser atendidos?" },
      { id: "qualified", label: "Qualificados", decisionQuestion: "Quem possui perfil conhecido?" },
      { id: "negotiating", label: "Em negociação", decisionQuestion: "Quem já está próximo de uma decisão?" },
    ],
    depths: ["glance", "workspace", "context"],
    priorityQueue: { title: "Relacionamentos prioritários", ordering: ["next-action", "intent", "recent-activity", "data-completeness"] },
    roleScopes: allRoles,
    allowedAccessRoles: commercialAccess,
    dataDependencies: [{ domain: "customers", query: "customer-360-list", tenantScoped: true, fallback: "empty-state" }],
    copilot: { contextId: "customer-relationship", capabilities: ["summarize-history", "identify-data-gap", "recommend-project"], maximumAutonomy: 2 },
    rendering: { strategy: "server-first", interactiveIslands: ["customer-search", "customer-list", "customer-context-panel"] },
  }),
  defineAtlasPageContract({
    id: "tasks-and-agenda",
    route: "/tasks",
    businessOutcome: "Transformar toda oportunidade em uma próxima ação clara, com prazo e responsável.",
    primaryAction: acaoPrimariaDoDestino("tasks", "create-task"),
    decisionMetrics: [
      { id: "today", label: "Hoje", decisionQuestion: "O que deve ser executado agora?" },
      { id: "overdue", label: "Atrasadas", decisionQuestion: "O que ameaça o SLA?" },
      { id: "visits", label: "Visitas", decisionQuestion: "Quais compromissos exigem preparação?" },
      { id: "completed", label: "Concluídas", decisionQuestion: "O plano diário está avançando?" },
    ],
    depths: ["glance", "workspace", "context"],
    priorityQueue: { title: "Próximas ações", ordering: ["overdue", "due-at", "lead-priority", "created-at"] },
    roleScopes: allRoles,
    allowedAccessRoles: commercialAccess,
    dataDependencies: [{ domain: "tasks", query: "commercial-action-queue", tenantScoped: true, fallback: "empty-state" }],
    copilot: { contextId: "daily-action-plan", capabilities: ["organize-day", "prepare-visit", "suggest-follow-up"], maximumAutonomy: 2 },
    rendering: { strategy: "server-first", interactiveIslands: ["task-filters", "task-completion", "task-editor"] },
  }),
  defineAtlasPageContract({
    id: "developments",
    route: "/developments",
    businessOutcome: "Encontrar rapidamente o projeto, estoque e material adequados para cada comprador.",
    primaryAction: acaoPrimariaDoDestino("developments", "search-materials"),
    decisionMetrics: [
      { id: "active-projects", label: "Projetos ativos", decisionQuestion: "Quantos produtos estão disponíveis?" },
      { id: "available-units", label: "Unidades", decisionQuestion: "Qual estoque pode ser ofertado?" },
      { id: "portfolio-vgv", label: "VGV", decisionQuestion: "Qual valor existe no portfólio?" },
      { id: "stale-materials", label: "Materiais vencidos", decisionQuestion: "O que precisa de atualização?" },
    ],
    depths: ["glance", "workspace", "context"],
    priorityQueue: { title: "Portfólio em ação", ordering: ["buyer-match", "inventory-availability", "material-freshness", "sales-velocity"] },
    roleScopes: allRoles,
    allowedAccessRoles: commercialAccess,
    dataDependencies: [
      { domain: "developments", query: "commercial-development-catalog", tenantScoped: true, fallback: "empty-state" },
      { domain: "materials", query: "current-project-materials", tenantScoped: true, fallback: "partial-state" },
    ],
    copilot: { contextId: "project-match", capabilities: ["recommend-project", "explain-payment-flow", "find-current-material"], maximumAutonomy: 2 },
    rendering: { strategy: "server-first", interactiveIslands: ["project-search", "portfolio-filters", "project-drawer"] },
  }),
  defineSupportingPageContract({
    id: "calendar",
    route: "/calendar",
    businessOutcome: "Organizar compromissos e proteger os horários que movem oportunidades.",
    primaryAction: acaoPrimariaDoDestino("calendar", "create-appointment"),
    metric: { id: "today-appointments", label: "Hoje", decisionQuestion: "Quais compromissos exigem preparação?" },
    queueTitle: "Agenda comercial",
    queueOrdering: ["start-at", "commercial-priority", "travel-time"],
    dataDomains: ["tasks", "visits", "commercial-events"],
    copilotContext: "calendar-preparation",
    copilotCapabilities: ["organize-day", "prepare-meeting", "detect-conflict"],
    interactiveIslands: ["calendar-view", "appointment-editor", "period-selector"],
  }),
  defineSupportingPageContract({
    id: "activity",
    route: "/activity",
    businessOutcome: "Explicar o que aconteceu com cada oportunidade e preservar continuidade.",
    // Era `?period=today`: chave fora do vocabulário fechado, e a tela não lia
    // parâmetro nenhum. O RECORTE existe de verdade (Period = today | week |
    // month | all, padrão "7 dias"), então há o que selecionar — é um "abrir
    // numa visão específica", que o módulo já nomeia `view`. A chave virou
    // `view` e app/(crm)/activity/page.tsx passou a cumpri-la pelo módulo.
    primaryAction: { id: "open-recent-activity", label: "Ver atividade recente", href: "/activity?view=today", outcome: "Revisar a movimentação comercial mais recente." },
    metric: { id: "recent-events", label: "Eventos recentes", decisionQuestion: "O histórico comercial está atualizado?" },
    queueTitle: "Linha do tempo",
    queueOrdering: ["occurred-at", "commercial-impact", "actor"],
    dataDomains: ["commercial-events", "lead-activities"],
    copilotContext: "activity-explanation",
    copilotCapabilities: ["summarize-timeline", "identify-missing-update"],
    interactiveIslands: ["activity-filters", "timeline-details"],
  }),
  defineSupportingPageContract({
    id: "reactivation",
    route: "/leads/import",
    businessOutcome: "Recuperar oportunidades antigas sem poluir a carteira operacional.",
    // Era `?view=eligible`. A chave cabe no vocabulário, mas NÃO HÁ SEGUNDA
    // VISÃO para selecionar: a fila que a tela mostra já é a elegível, e isso é
    // decidido no servidor — app/api/v1/crm/reactivation/route.ts filtra
    // `status in ("imported","replied")` antes de responder. Não existe recorte
    // "não elegível" do qual o parâmetro pudesse tirar a pessoa. Cumprir a
    // promessa exigiria INVENTAR um filtro; o parâmetro saiu. A página cumpre o
    // rótulo sozinha, abrindo na fila elegível.
    primaryAction: { id: "open-eligible-queue", label: "Abrir fila elegível", href: "/leads/import", outcome: "Priorizar contatos válidos e autorizados." },
    metric: { id: "eligible-leads", label: "Elegíveis", decisionQuestion: "Quantos contatos podem receber uma abordagem segura?" },
    queueTitle: "Fila de reativação",
    queueOrdering: ["eligibility", "buyer-signal", "data-quality", "last-contact"],
    dataDomains: ["reactivation-leads", "suppression-list", "lead-memory"],
    copilotContext: "reactivation-supervision",
    copilotCapabilities: ["explain-eligibility", "prepare-reactivation-message"],
    interactiveIslands: ["reactivation-filters", "eligibility-review", "bulk-selection"],
  }),
  defineSupportingPageContract({
    id: "copilot",
    route: "/ai-dashboard",
    businessOutcome: "Traduzir dados comerciais em uma próxima ação explicável e supervisionada.",
    // Era `?briefing=daily`: chave inventada, e nada para escolher — a tela
    // busca `/api/ai/briefing` na montagem, sempre, sem outra modalidade
    // (app/(crm)/ai-dashboard/page.tsx:33). O parâmetro pedia o que a página já
    // faz por padrão. Fora isso, /ai-dashboard saiu do menu: o copiloto vive no
    // dock global. Parâmetro removido em vez de virar comportamento decorativo.
    primaryAction: { id: "prepare-daily-briefing", label: "Preparar meu dia", href: "/ai-dashboard", outcome: "Receber um plano baseado no escopo do usuário." },
    metric: { id: "actionable-signals", label: "Sinais acionáveis", decisionQuestion: "Quais recomendações possuem evidência suficiente?" },
    queueTitle: "Sugestões supervisionadas",
    queueOrdering: ["evidence", "urgency", "commercial-impact", "confidence"],
    dataDomains: ["leads", "tasks", "opportunities", "ai-memory"],
    copilotContext: "commercial-copilot",
    copilotCapabilities: ["prepare-daily-briefing", "suggest-next-action", "explain-evidence"],
    interactiveIslands: ["copilot-thread", "suggestion-review", "context-selector"],
  }),
  defineSupportingPageContract({
    id: "brokers",
    route: "/brokers",
    businessOutcome: "Mostrar capacidade, carteira e gargalos da estrutura comercial visível.",
    primaryAction: acaoPrimariaDoDestino("brokers", "open-team-performance"),
    metric: { id: "visible-team", label: "Pessoas visíveis", decisionQuestion: "Quem está disponível e dentro do meu escopo?" },
    queueTitle: "Equipe que exige atenção",
    queueOrdering: ["overdue-actions", "portfolio-load", "response-time", "conversion"],
    roleScopes: managementRoles,
    dataDomains: ["profiles", "team-hierarchy", "lead-assignments"],
    copilotContext: "team-coaching",
    copilotCapabilities: ["identify-bottleneck", "prepare-coaching-brief"],
    interactiveIslands: ["team-filters", "broker-context-panel"],
  }),
  defineSupportingPageContract({
    id: "distribution",
    route: "/distribution",
    businessOutcome: "Colocar cada lead em um único responsável compatível com projeto e capacidade.",
    primaryAction: acaoPrimariaDoDestino("distribution", "open-unassigned-queue"),
    metric: { id: "unassigned-leads", label: "Sem responsável", decisionQuestion: "Quantos leads ainda aguardam distribuição?" },
    queueTitle: "Fila de distribuição",
    queueOrdering: ["waiting-time", "project-affinity", "broker-capacity", "availability"],
    roleScopes: managementRoles,
    dataDomains: ["leads", "profiles", "distribution-rules"],
    copilotContext: "distribution-assistance",
    copilotCapabilities: ["explain-recommendation", "detect-overload"],
    interactiveIslands: ["distribution-queue", "broker-availability", "bulk-transfer"],
  }),
  defineSupportingPageContract({
    id: "sales",
    route: "/sales",
    businessOutcome: "Tornar valor, probabilidade, prazo e risco das negociações comparáveis.",
    primaryAction: acaoPrimariaDoDestino("sales", "open-forecast"),
    metric: { id: "weighted-forecast", label: "Forecast ponderado", decisionQuestion: "Qual receita possui evidência de fechamento?" },
    queueTitle: "Negócios que exigem atenção",
    queueOrdering: ["closing-risk", "expected-close", "commercial-value", "probability"],
    roleScopes: managementRoles,
    dataDomains: ["opportunities", "sales", "commission-receivables"],
    copilotContext: "sales-forecast",
    copilotCapabilities: ["explain-forecast", "identify-closing-risk"],
    interactiveIslands: ["forecast-filters", "opportunity-table", "sales-drawer"],
  }),
  defineSupportingPageContract({
    id: "reports",
    route: "/reports",
    businessOutcome: "Explicar resultado comercial e apoiar decisões diárias, semanais e mensais.",
    primaryAction: acaoPrimariaDoDestino("reports", "open-recommended-action"),
    metric: { id: "conversion", label: "Conversão", decisionQuestion: "Onde o funil melhora ou perde eficiência?" },
    queueTitle: "Decisões do período",
    queueOrdering: ["business-impact", "evidence-strength", "trend", "urgency"],
    roleScopes: managementRoles,
    dataDomains: ["analytics", "opportunities", "campaign-performance"],
    copilotContext: "executive-reporting",
    copilotCapabilities: ["explain-trend", "compare-period", "recommend-decision"],
    interactiveIslands: ["period-selector", "report-filters", "decision-drilldown"],
  }),
  defineSupportingPageContract({
    id: "revenue-engine",
    route: "/revenue-engine",
    businessOutcome: "Conectar aquisição, atendimento e resultado para melhorar a qualidade do público.",
    // Era `?view=conversions`. A tela não tem visão nenhuma para trocar: é uma
    // página única de leitura corrida (34 linhas, sem estado de aba) e as
    // conversões aparecem no funil que ela já desenha. Além disso o destino
    // saiu do menu — quem decide sobre receita vai para /decision-center.
    // Parâmetro removido: promessa sem tela que a cumpra é pior que promessa
    // nenhuma, porque ensina que o caminho não funciona.
    primaryAction: { id: "review-conversions", label: "Revisar conversões", href: "/revenue-engine", outcome: "Identificar campanhas que geram compradores reais." },
    metric: { id: "qualified-conversions", label: "Conversões qualificadas", decisionQuestion: "Quais origens geram avanço comercial real?" },
    queueTitle: "Otimizações de receita",
    queueOrdering: ["revenue-impact", "signal-quality", "campaign-cost", "learning-value"],
    roleScopes: managementRoles,
    dataDomains: ["campaigns", "conversion-events", "opportunities"],
    copilotContext: "revenue-optimization",
    copilotCapabilities: ["explain-campaign-quality", "recommend-signal-improvement"],
    interactiveIslands: ["campaign-filters", "conversion-funnel", "optimization-review"],
  }),
  defineSupportingPageContract({
    id: "users",
    route: "/users",
    businessOutcome: "Governar acesso, papel, vínculo organizacional e continuidade do histórico.",
    primaryAction: acaoPrimariaDoDestino("users", "create-user"),
    metric: { id: "active-users", label: "Usuários ativos", decisionQuestion: "Quem possui acesso vigente à organização?" },
    queueTitle: "Acessos que exigem revisão",
    queueOrdering: ["missing-membership", "inactive-account", "role-risk", "last-access"],
    roleScopes: administrationRoles,
    allowedAccessRoles: ["admin"],
    dataDomains: ["profiles", "memberships", "roles"],
    copilotContext: "access-governance",
    copilotCapabilities: ["explain-role-scope", "identify-access-risk"],
    interactiveIslands: ["user-table", "user-editor", "role-review"],
  }),
  defineSupportingPageContract({
    id: "external-sales",
    route: "/external-sales",
    businessOutcome: "Preservar aprendizado de compradores externos sem distorcer receita própria.",
    primaryAction: acaoPrimariaDoDestino("external-sales", "register-external-purchase"),
    metric: { id: "external-purchases", label: "Compras externas", decisionQuestion: "Quais padrões explicam negócios perdidos?" },
    queueTitle: "Aprendizados externos",
    queueOrdering: ["learning-value", "commercial-reason", "buyer-profile", "registered-at"],
    roleScopes: administrationRoles,
    allowedAccessRoles: ["admin", "director_decisor"],
    dataDomains: ["leads", "external-purchases", "commercial-memory"],
    copilotContext: "external-buyer-learning",
    copilotCapabilities: ["summarize-loss-reason", "identify-buyer-pattern"],
    interactiveIslands: ["external-sale-form", "learning-table"],
  }),
  defineSupportingPageContract({
    id: "integrations",
    route: "/integrations",
    businessOutcome: "Mostrar quais conexões possuem credencial, teste real e operação comprovada.",
    primaryAction: acaoPrimariaDoDestino("integrations", "open-integration-health"),
    metric: { id: "operational-integrations", label: "Operacionais", decisionQuestion: "Quais integrações passaram por teste real?" },
    queueTitle: "Conexões que exigem atenção",
    queueOrdering: ["failed-test", "missing-credential", "delivery-error", "last-verified"],
    roleScopes: administrationRoles,
    allowedAccessRoles: ["admin", "director_decisor"],
    dataDomains: ["integration-catalog", "integration-health", "delivery-events"],
    copilotContext: "integration-health",
    copilotCapabilities: ["explain-status", "recommend-safe-next-step"],
    interactiveIslands: ["integration-catalog", "health-details", "test-connection"],
  }),
  defineSupportingPageContract({
    id: "settings",
    route: "/settings",
    businessOutcome: "Centralizar configurações governadas da organização, IA e operação.",
    primaryAction: acaoPrimariaDoDestino("settings", "review-environment"),
    metric: { id: "configuration-health", label: "Saúde da configuração", decisionQuestion: "Existe algum parâmetro crítico incompleto?" },
    queueTitle: "Configurações pendentes",
    queueOrdering: ["security-impact", "operational-impact", "missing-value", "last-updated"],
    roleScopes: administrationRoles,
    allowedAccessRoles: ["admin"],
    dataDomains: ["organization-settings", "ai-governance", "security-policy"],
    copilotContext: "configuration-governance",
    copilotCapabilities: ["explain-setting", "identify-configuration-risk"],
    interactiveIslands: ["settings-navigation", "configuration-editor"],
  }),
] as const satisfies readonly AtlasPageContract[];

export function getAtlasCoreV2PageContract(route: string) {
  return atlasCoreV2PageRegistry.find((contract) => contract.route === route) ?? null;
}

export type AtlasCoreV2PageId = (typeof atlasCoreV2PageRegistry)[number]["id"];

/**
 * A ação primária de um MÓDULO, pelo id.
 *
 * Existe porque `getAtlasCoreV2PageContract` busca por ROTA, e rota não é chave
 * única aqui: "leads" e "customers-360" declaram os dois `/leads` (a segunda
 * herdou a rota quando /customers morreu), então a busca por rota devolve
 * sempre a primeira e o outro contrato fica inalcançável. Quem precisa de um
 * contrato específico — a prontidão de escrita, por exemplo — pergunta pelo id,
 * que é único e verificado em compilação.
 */
export function acaoPrimariaDoModulo(id: AtlasCoreV2PageId): AtlasPageAction {
  const contrato = atlasCoreV2PageRegistry.find((entrada) => entrada.id === id);
  if (!contrato) throw new Error(`Módulo inexistente no registro de páginas: ${id}`);
  return contrato.primaryAction;
}
