export type AtlasNavigationItem = {
  group: "Operação diária" | "Clientes e portfólio" | "Gestão" | "Diretoria";
  label: string;
  href: string;
  icon: string;
  roles: readonly string[];
  accessRoles?: readonly string[];
  keywords: string;
  mobilePrimary?: boolean;
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
  { group: "Operação diária", label: "Command Center", href: "/dashboard", icon: "⌘", roles: ["director", "superintendent", "manager", "broker"], keywords: "dashboard início indicadores prioridades", mobilePrimary: true },
  { group: "Operação diária", label: "Leads", href: "/leads", icon: "◎", roles: ["director", "superintendent", "manager", "broker"], keywords: "clientes contatos oportunidades", mobilePrimary: true },
  { group: "Operação diária", label: "Pipeline", href: "/pipeline", icon: "⌁", roles: ["director", "superintendent", "manager", "broker"], keywords: "funil kanban vendas", mobilePrimary: true },
  { group: "Operação diária", label: "Tarefas", href: "/tasks", icon: "✓", roles: ["director", "superintendent", "manager", "broker"], keywords: "follow up pendências agenda", mobilePrimary: true },
  { group: "Operação diária", label: "Agenda", href: "/calendar", icon: "□", roles: ["director", "superintendent", "manager", "broker"], keywords: "visitas compromissos calendário" },
  { group: "Operação diária", label: "Atividades", href: "/activity", icon: "◷", roles: ["director", "superintendent", "manager", "broker"], keywords: "histórico eventos registros" },
  { group: "Clientes e portfólio", label: "Clientes 360", href: "/customers", icon: "◉", roles: ["director", "superintendent", "manager", "broker"], keywords: "customer intelligence compradores" },
  { group: "Clientes e portfólio", label: "Projetos", href: "/developments", icon: "▥", roles: ["director", "superintendent", "manager", "broker"], keywords: "incorporadoras lançamentos empreendimentos" },
  { group: "Clientes e portfólio", label: "Reativação", href: "/leads/import", icon: "↻", roles: ["director", "superintendent", "manager", "broker"], keywords: "base antiga oferta ativa recuperação" },
  { group: "Clientes e portfólio", label: "Copilot", href: "/ai-dashboard", icon: "✦", roles: ["director", "superintendent", "manager", "broker"], keywords: "inteligência assistente recomendação" },
  { group: "Gestão", label: "Corretores", href: "/brokers", icon: "◇", roles: ["director", "superintendent", "manager"], keywords: "equipe gerente corretor desempenho" },
  { group: "Gestão", label: "Distribuição", href: "/distribution", icon: "⇄", roles: ["director", "superintendent", "manager"], keywords: "fila transferência atribuição" },
  { group: "Gestão", label: "Vendas", href: "/sales", icon: "◌", roles: ["director", "superintendent", "manager"], keywords: "receita vgv forecast ganho" },
  { group: "Gestão", label: "Relatórios", href: "/reports", icon: "↗", roles: ["director", "superintendent", "manager"], keywords: "analytics métricas decisão" },
  { group: "Gestão", label: "Revenue Engine", href: "/revenue-engine", icon: "⚡", roles: ["director", "superintendent", "manager"], keywords: "meta conversão atendimento receita" },
  { group: "Diretoria", label: "Usuários e acessos", href: "/users", icon: "♙", roles: ["director"], accessRoles: ["admin"], keywords: "permissões rbac equipe" },
  { group: "Diretoria", label: "Vendas externas", href: "/external-sales", icon: "↙", roles: ["director"], accessRoles: ["admin", "director_decisor"], keywords: "comprou outro lugar aprendizado" },
  { group: "Diretoria", label: "Integrações", href: "/integrations", icon: "∞", roles: ["director"], accessRoles: ["admin", "director_decisor"], keywords: "api meta whatsapp google" },
  { group: "Diretoria", label: "Evolução V3", href: "/atlas-v3", icon: "◈", roles: ["director"], accessRoles: ["admin", "director_decisor"], keywords: "fases percentual homologação" },
  { group: "Diretoria", label: "Configurações", href: "/settings", icon: "⚙", roles: ["director", "superintendent", "manager"], accessRoles: ["admin"], keywords: "empresa preferências inteligência" },
] as const satisfies readonly AtlasNavigationItem[];

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
].sort((left, right) => right.href.length - left.href.length);

export function getAtlasNavigationContext(pathname: string) {
  const normalizedPath = pathname.split("?")[0]?.split("#")[0] || "/";

  return atlasNavigationContexts.find((item) =>
    normalizedPath === item.href || normalizedPath.startsWith(`${item.href}/`),
  ) ?? null;
}
