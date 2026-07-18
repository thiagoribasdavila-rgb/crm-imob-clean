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
  { label: "Novo lead", href: "/leads/new", group: "Ações", keywords: "cadastrar criar lead contato" },
  { label: "Imóveis", href: "/properties", group: "Launch OS", keywords: "estoque produtos unidades" },
  { label: "Marketing AI", href: "/marketing", group: "Growth", keywords: "meta criativos campanhas roi" },
  { label: "Conversas", href: "/conversations", group: "Growth", keywords: "whatsapp instagram atendimento" },
  { label: "Centro de Decisão", href: "/decision-center", group: "Intelligence", keywords: "decisões alertas aprovações" },
  { label: "Atlas 2030", href: "/atlas-2030", group: "Platform", keywords: "knowledge graph simulações plataforma" },
] as const;

export const atlasMobileNavigation = atlasNavigation.filter((item) => "mobilePrimary" in item && item.mobilePrimary);
