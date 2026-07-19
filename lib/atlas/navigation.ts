export type AtlasNavigationSurface = "canonical" | "contextual" | "internal" | "experimental" | "retired";

export type AtlasNavigationItem = {
  id: string;
  surface: "canonical";
  group: "Operação diária" | "Clientes e portfólio" | "Gestão" | "Administração";
  label: string;
  href: string;
  icon: string;
  roles: readonly string[];
  accessRoles?: readonly string[];
  keywords: string;
  businessOutcome: string;
  primaryAction: {
    label: string;
    href: string;
    outcome: string;
  };
  dataDomains: readonly string[];
  mobilePrimary?: boolean;
};

export type AtlasInternalNavigationItem = Omit<AtlasNavigationItem, "surface" | "group" | "mobilePrimary"> & {
  surface: "internal";
  group: "Interno";
};

export type AtlasNavigationIdentity = {
  role: string;
  accessRole: string;
};

type AtlasScopedItem = {
  roles: readonly string[];
  accessRoles?: readonly string[];
};

export type AtlasTaskAction = AtlasScopedItem & {
  contextHref: string;
  label: string;
  href: string;
  icon: string;
  keywords: string;
};

export function canAccessAtlasItem(
  item: AtlasScopedItem,
  identity: AtlasNavigationIdentity,
) {
  if (item.accessRoles?.length) {
    return item.accessRoles.includes(identity.accessRole);
  }
  return item.roles.includes(identity.role);
}

export const atlasNavigation = [
  {
    id: "command-center", surface: "canonical", group: "Operação diária", label: "Command Center", href: "/dashboard", icon: "⌘",
    roles: ["director", "superintendent", "manager", "broker"], keywords: "dashboard início indicadores prioridades decisões hoje",
    businessOutcome: "Mostrar a prioridade comercial que exige decisão ou execução agora.",
    primaryAction: { label: "Abrir prioridade", href: "/pipeline?focus=priority", outcome: "Avançar a oportunidade mais relevante." },
    dataDomains: ["leads", "tasks", "opportunities"], mobilePrimary: true,
  },
  {
    id: "leads", surface: "canonical", group: "Operação diária", label: "Leads", href: "/leads", icon: "◎",
    roles: ["director", "superintendent", "manager", "broker"], keywords: "clientes contatos oportunidades atender carteira",
    businessOutcome: "Encontrar e atender rapidamente o lead com maior necessidade de ação.",
    primaryAction: { label: "Novo lead", href: "/leads/new", outcome: "Registrar uma oportunidade sem duplicidade." },
    dataDomains: ["leads", "lead-activities", "assignments"], mobilePrimary: true,
  },
  {
    id: "pipeline", surface: "canonical", group: "Operação diária", label: "Pipeline", href: "/pipeline", icon: "⌁",
    roles: ["director", "superintendent", "manager", "broker"], keywords: "funil kanban vendas negociação etapas",
    businessOutcome: "Avançar oportunidades com segurança e tornar bloqueios comerciais visíveis.",
    primaryAction: { label: "Abrir melhor oportunidade", href: "/pipeline?focus=priority", outcome: "Executar a próxima ação do negócio prioritário." },
    dataDomains: ["opportunities", "leads", "tasks"], mobilePrimary: true,
  },
  {
    id: "tasks", surface: "canonical", group: "Operação diária", label: "Tarefas", href: "/tasks", icon: "✓",
    roles: ["director", "superintendent", "manager", "broker"], keywords: "follow up pendências agenda prazo próxima ação",
    businessOutcome: "Transformar oportunidades em próximas ações claras, com prazo e responsável.",
    primaryAction: { label: "Nova tarefa", href: "/tasks?create=1", outcome: "Agendar uma ação comercial rastreável." },
    dataDomains: ["tasks", "leads", "commercial-events"], mobilePrimary: true,
  },
  {
    id: "calendar", surface: "canonical", group: "Operação diária", label: "Agenda", href: "/calendar", icon: "□",
    roles: ["director", "superintendent", "manager", "broker"], keywords: "visitas compromissos calendário horários reuniões",
    businessOutcome: "Organizar compromissos e proteger os horários que movem oportunidades.",
    primaryAction: { label: "Novo compromisso", href: "/calendar?create=1", outcome: "Reservar uma ação com cliente ou equipe." },
    dataDomains: ["tasks", "visits", "commercial-events"],
  },
  {
    id: "activity", surface: "canonical", group: "Operação diária", label: "Atividades", href: "/activity", icon: "◷",
    roles: ["director", "superintendent", "manager", "broker"], keywords: "histórico eventos registros contatos auditoria",
    businessOutcome: "Explicar o que aconteceu com cada oportunidade e preservar continuidade.",
    primaryAction: { label: "Ver atividade recente", href: "/activity?period=today", outcome: "Revisar a movimentação comercial mais recente." },
    dataDomains: ["commercial-events", "lead-activities", "tasks"],
  },
  {
    id: "customers-360", surface: "canonical", group: "Clientes e portfólio", label: "Clientes 360", href: "/customers", icon: "◉",
    roles: ["director", "superintendent", "manager", "broker"], keywords: "customer intelligence compradores perfil histórico relacionamento",
    businessOutcome: "Reunir a história do comprador e indicar a melhor continuidade do relacionamento.",
    primaryAction: { label: "Abrir cliente prioritário", href: "/customers?focus=priority", outcome: "Continuar o atendimento com contexto completo." },
    dataDomains: ["customers", "leads", "commercial-events"],
  },
  {
    id: "developments", surface: "canonical", group: "Clientes e portfólio", label: "Projetos", href: "/developments", icon: "▥",
    roles: ["director", "superintendent", "manager", "broker"], keywords: "incorporadoras lançamentos empreendimentos estoque materiais",
    businessOutcome: "Encontrar o projeto, estoque e material adequados para cada comprador.",
    primaryAction: { label: "Buscar materiais", href: "/developments/materials", outcome: "Entregar conteúdo comercial vigente ao cliente." },
    dataDomains: ["developments", "inventory", "materials"],
  },
  {
    id: "reactivation", surface: "canonical", group: "Clientes e portfólio", label: "Reativação", href: "/leads/import", icon: "↻",
    roles: ["director", "superintendent", "manager", "broker"], keywords: "base antiga oferta ativa recuperação inativos higienização",
    businessOutcome: "Recuperar oportunidades antigas sem poluir a carteira operacional.",
    primaryAction: { label: "Abrir fila elegível", href: "/leads/import?view=eligible", outcome: "Priorizar contatos com dados válidos e consentimento." },
    dataDomains: ["reactivation-leads", "suppression-list", "lead-memory"],
  },
  {
    id: "copilot", surface: "canonical", group: "Clientes e portfólio", label: "Copilot", href: "/ai-dashboard", icon: "✦",
    roles: ["director", "superintendent", "manager", "broker"], keywords: "inteligência assistente recomendação briefing próxima ação",
    businessOutcome: "Traduzir dados comerciais em uma próxima ação explicável e supervisionada.",
    primaryAction: { label: "Preparar meu dia", href: "/ai-dashboard?briefing=daily", outcome: "Receber um plano comercial baseado no escopo do usuário." },
    dataDomains: ["leads", "tasks", "opportunities", "ai-memory"],
  },
  {
    id: "brokers", surface: "canonical", group: "Gestão", label: "Corretores", href: "/brokers", icon: "◇",
    roles: ["director", "superintendent", "manager"], keywords: "equipe gerente corretor desempenho carteira hierarquia",
    businessOutcome: "Mostrar capacidade, carteira e gargalos da estrutura comercial visível.",
    primaryAction: { label: "Ver desempenho", href: "/brokers?view=performance", outcome: "Direcionar apoio ao time que mais precisa." },
    dataDomains: ["profiles", "team-hierarchy", "lead-assignments"],
  },
  {
    id: "distribution", surface: "canonical", group: "Gestão", label: "Distribuição", href: "/distribution", icon: "⇄",
    roles: ["director", "superintendent", "manager"], keywords: "fila transferência atribuição carga online projeto",
    businessOutcome: "Colocar cada lead em um único responsável compatível com projeto e capacidade.",
    primaryAction: { label: "Abrir fila sem responsável", href: "/distribution?queue=unassigned", outcome: "Distribuir oportunidades sem atendimento." },
    dataDomains: ["leads", "profiles", "distribution-rules"],
  },
  {
    id: "sales", surface: "canonical", group: "Gestão", label: "Vendas", href: "/sales", icon: "◌",
    roles: ["director", "superintendent", "manager"], keywords: "receita vgv forecast ganho oportunidades comissão",
    businessOutcome: "Tornar valor, probabilidade, prazo e risco das negociações comparáveis.",
    primaryAction: { label: "Abrir forecast", href: "/sales?view=forecast", outcome: "Revisar negócios com impacto provável na receita." },
    dataDomains: ["opportunities", "sales", "commission-receivables"],
  },
  {
    id: "reports", surface: "canonical", group: "Gestão", label: "Relatórios", href: "/reports", icon: "↗",
    roles: ["director", "superintendent", "manager"], keywords: "analytics métricas decisão conversão campanha equipe",
    businessOutcome: "Explicar resultado comercial e apoiar decisões diárias, semanais e mensais.",
    primaryAction: { label: "Abrir ação recomendada", href: "/decision-center", outcome: "Converter um indicador em decisão rastreável." },
    dataDomains: ["analytics", "opportunities", "campaign-performance"],
  },
  {
    id: "revenue-engine", surface: "canonical", group: "Gestão", label: "Revenue Engine", href: "/revenue-engine", icon: "⚡",
    roles: ["director", "superintendent", "manager"], keywords: "meta conversão atendimento receita andromeda sinais",
    businessOutcome: "Conectar aquisição, atendimento e resultado para melhorar a qualidade do público.",
    primaryAction: { label: "Revisar conversões", href: "/revenue-engine?view=conversions", outcome: "Identificar campanhas que geram compradores reais." },
    dataDomains: ["campaigns", "conversion-events", "opportunities"],
  },
  {
    id: "users", surface: "canonical", group: "Administração", label: "Usuários e acessos", href: "/users", icon: "♙",
    roles: ["director"], accessRoles: ["admin"], keywords: "permissões rbac equipe usuários segurança",
    businessOutcome: "Governar acesso, papel, vínculo organizacional e continuidade do histórico.",
    primaryAction: { label: "Novo usuário", href: "/users?create=1", outcome: "Adicionar uma pessoa com acesso e escopo corretos." },
    dataDomains: ["profiles", "memberships", "roles"],
  },
  {
    id: "external-sales", surface: "canonical", group: "Administração", label: "Vendas externas", href: "/external-sales", icon: "↙",
    roles: ["director"], accessRoles: ["admin", "director_decisor"], keywords: "comprou outro lugar aprendizado perfil comprador perda",
    businessOutcome: "Preservar aprendizado de compradores externos sem distorcer receita própria.",
    primaryAction: { label: "Registrar compra externa", href: "/external-sales?create=1", outcome: "Classificar a perda comercial com contexto." },
    dataDomains: ["leads", "external-purchases", "commercial-memory"],
  },
  {
    id: "integrations", surface: "canonical", group: "Administração", label: "Integrações", href: "/integrations", icon: "∞",
    roles: ["director"], accessRoles: ["admin", "director_decisor"], keywords: "api meta whatsapp google conectores saúde credenciais",
    businessOutcome: "Mostrar quais conexões possuem credencial, teste real e operação comprovada.",
    primaryAction: { label: "Ver saúde", href: "/integrations/health", outcome: "Identificar e corrigir conexões sem evidência operacional." },
    dataDomains: ["integration-catalog", "integration-health", "delivery-events"],
  },
  {
    id: "settings", surface: "canonical", group: "Administração", label: "Configurações", href: "/settings", icon: "⚙",
    roles: ["director", "superintendent", "manager"], accessRoles: ["admin"], keywords: "empresa preferências inteligência modelos segurança",
    businessOutcome: "Centralizar configurações governadas da organização, IA e operação.",
    primaryAction: { label: "Revisar ambiente", href: "/settings?view=environment", outcome: "Confirmar que parâmetros críticos estão coerentes." },
    dataDomains: ["organization-settings", "ai-governance", "security-policy"],
  },
] as const satisfies readonly AtlasNavigationItem[];

export const atlasInternalNavigation = [
  {
    id: "atlas-evolution", surface: "internal", group: "Interno", label: "Evolução V3", href: "/atlas-v3", icon: "◈",
    roles: ["director"], accessRoles: ["admin", "director_decisor"], keywords: "fases percentual homologação evidência técnica",
    businessOutcome: "Acompanhar evidências técnicas e gates de evolução fora da rotina comercial.",
    primaryAction: { label: "Abrir homologação", href: "/atlas-v3/homologation", outcome: "Revisar gates e evidências da próxima entrega." },
    dataDomains: ["evolution-evidence", "homologation-gates"],
  },
] as const satisfies readonly AtlasInternalNavigationItem[];

export const atlasContextCommands = [
  { label: "Novo lead", href: "/leads/new", group: "Ações", keywords: "cadastrar criar lead contato", roles: ["director", "superintendent", "manager", "broker"] },
  { label: "Imóveis", href: "/properties", group: "Launch OS", keywords: "estoque produtos unidades", roles: ["director", "superintendent", "manager", "broker"] },
  { label: "Marketing AI", href: "/marketing", group: "Growth", keywords: "meta criativos campanhas roi", roles: ["director", "superintendent", "manager"] },
  { label: "Conversas", href: "/conversations", group: "Growth", keywords: "whatsapp instagram atendimento", roles: ["director", "superintendent", "manager", "broker"] },
  { label: "Centro de Decisão", href: "/decision-center", group: "Intelligence", keywords: "decisões alertas aprovações", roles: ["director", "superintendent", "manager"] },
  { label: "Atlas 2030", href: "/atlas-2030", group: "Platform", keywords: "knowledge graph simulações plataforma", roles: ["director"], accessRoles: ["admin", "director_decisor"] },
] as const;

export const atlasTaskActions = [
  { contextHref: "/leads/new", label: "Ver leads", href: "/leads", icon: "◎", keywords: "voltar carteira leads", roles: ["director", "superintendent", "manager", "broker"] },
  { contextHref: "/tasks", label: "Abrir agenda", href: "/calendar", icon: "□", keywords: "agenda compromissos visitas", roles: ["director", "superintendent", "manager", "broker"] },
  { contextHref: "/calendar", label: "Ver tarefas", href: "/tasks", icon: "✓", keywords: "tarefas follow up pendências", roles: ["director", "superintendent", "manager", "broker"] },
  { contextHref: "/customers", label: "Abrir leads", href: "/leads", icon: "◎", keywords: "leads carteira atendimento", roles: ["director", "superintendent", "manager", "broker"] },
  { contextHref: "/developments", label: "Buscar materiais", href: "/developments/materials", icon: "⌕", keywords: "book tabela espelho materiais", roles: ["director", "superintendent", "manager", "broker"] },
  { contextHref: "/leads/import", label: "Revisar duplicidades", href: "/leads/deduplication", icon: "◇", keywords: "duplicados limpeza base", roles: ["director", "superintendent", "manager", "broker"] },
  { contextHref: "/brokers", label: "Distribuir leads", href: "/distribution", icon: "⇄", keywords: "fila atribuição corretores", roles: ["director", "superintendent", "manager"] },
  { contextHref: "/sales", label: "Abrir relatórios", href: "/reports", icon: "↗", keywords: "resultado decisão forecast", roles: ["director", "superintendent", "manager"] },
  { contextHref: "/reports", label: "Centro de decisão", href: "/decision-center", icon: "◈", keywords: "decisão aprovação evidência", roles: ["director", "superintendent", "manager"] },
  { contextHref: "/revenue-engine", label: "Marketing AI", href: "/marketing", icon: "⚡", keywords: "campanhas meta receita", roles: ["director", "superintendent", "manager"] },
  { contextHref: "/users", label: "Configurar equipe", href: "/settings/team", icon: "♙", keywords: "equipe acesso organização", roles: ["director"], accessRoles: ["admin"] },
  { contextHref: "/external-sales", label: "Abrir relatórios", href: "/reports", icon: "↗", keywords: "aprendizado comprador externo", roles: ["director"], accessRoles: ["admin", "director_decisor"] },
  { contextHref: "/integrations", label: "Ver saúde", href: "/integrations/health", icon: "⌁", keywords: "status teste conexão", roles: ["director"], accessRoles: ["admin", "director_decisor"] },
  { contextHref: "/atlas-v3", label: "Abrir homologação", href: "/atlas-v3/homologation", icon: "◈", keywords: "gate evidência homologação", roles: ["director"], accessRoles: ["admin", "director_decisor"] },
  { contextHref: "/settings", label: "Saúde da IA", href: "/settings/ai", icon: "✦", keywords: "modelos agentes custo saúde", roles: ["director", "superintendent", "manager"], accessRoles: ["admin"] },
] as const satisfies readonly AtlasTaskAction[];

const atlasDefaultTaskAction = {
  contextHref: "*",
  label: "Novo lead",
  href: "/leads/new",
  icon: "＋",
  keywords: "cadastrar criar lead contato",
  roles: ["director", "superintendent", "manager", "broker"],
} as const satisfies AtlasTaskAction;

export const atlasMobileNavigation = atlasNavigation.filter((item) => "mobilePrimary" in item && item.mobilePrimary);

export function getAtlasNavigationForIdentity(identity: AtlasNavigationIdentity) {
  return atlasNavigation.filter((item) => canAccessAtlasItem(item, identity));
}

export function getAtlasContextCommandsForIdentity(identity: AtlasNavigationIdentity) {
  return atlasContextCommands.filter((item) => canAccessAtlasItem(item, identity));
}

export function getAtlasMobileNavigationForIdentity(identity: AtlasNavigationIdentity) {
  return atlasMobileNavigation.filter((item) => canAccessAtlasItem(item, identity));
}

export function getAtlasTaskActionForPathname(
  pathname: string,
  identity: AtlasNavigationIdentity,
): AtlasTaskAction | null {
  const normalizedPath = pathname.split("?")[0]?.split("#")[0] || "/";
  const contextualAction = atlasTaskActions.find((item) => item.contextHref === normalizedPath);

  if (contextualAction && canAccessAtlasItem(contextualAction, identity)) {
    return contextualAction;
  }

  return canAccessAtlasItem(atlasDefaultTaskAction, identity)
    ? atlasDefaultTaskAction
    : null;
}

const atlasNavigationContexts = [
  ...atlasNavigation.map((item) => ({
    group: item.group,
    label: item.label,
    href: item.href,
    source: "primary" as const,
  })),
  ...atlasContextCommands.map((item) => ({
    group: item.group,
    label: item.label,
    href: item.href,
    source: "contextual" as const,
  })),
  ...atlasInternalNavigation.map((item) => ({
    group: item.group,
    label: item.label,
    href: item.href,
    source: "internal" as const,
  })),
].sort((left, right) => right.href.length - left.href.length);

export function getAtlasNavigationContext(pathname: string) {
  const normalizedPath = pathname.split("?")[0]?.split("#")[0] || "/";

  return atlasNavigationContexts.find((item) =>
    normalizedPath === item.href || normalizedPath.startsWith(`${item.href}/`),
  ) ?? null;
}
