// RBAC Enterprise (modelo híbrido) — catálogo base de permissões, versionado em
// código. Esta é a fonte de verdade em runtime na v1: não depende das tabelas de
// banco (roles/permissions/role_permissions/user_roles), que são criadas para
// permitir permissões configuráveis por organização no futuro (overrides).
//
// Chave de permissão = `${modulo}.${acao}`. A checagem é sempre no backend.

export const PERMISSION_CATALOG = [
  // CRM / Leads
  { key: "leads.view", module: "leads", action: "view", description: "Ver as próprias leads" },
  { key: "leads.view_team", module: "leads", action: "view_team", description: "Ver leads da equipe" },
  { key: "leads.create", module: "leads", action: "create", description: "Criar leads" },
  { key: "leads.edit", module: "leads", action: "edit", description: "Editar leads" },
  { key: "leads.assign", module: "leads", action: "assign", description: "Distribuir leads" },
  { key: "leads.transfer", module: "leads", action: "transfer", description: "Transferir leads" },
  { key: "leads.import", module: "leads", action: "import", description: "Importar leads" },
  { key: "leads.export", module: "leads", action: "export", description: "Exportar leads" },
  // Clientes
  { key: "clients.view", module: "clients", action: "view", description: "Consultar clientes" },
  { key: "clients.edit", module: "clients", action: "edit", description: "Editar clientes" },
  { key: "clients.history", module: "clients", action: "history", description: "Ver histórico do cliente" },
  { key: "clients.documents", module: "clients", action: "documents", description: "Acessar documentos do cliente" },
  // Usuários
  { key: "users.view", module: "users", action: "view", description: "Ver usuários" },
  { key: "users.create", module: "users", action: "create", description: "Criar/convidar usuários" },
  { key: "users.edit", module: "users", action: "edit", description: "Editar usuários" },
  { key: "users.delete", module: "users", action: "delete", description: "Desativar/remover usuários" },
  // Projetos / Empreendimentos
  { key: "projects.view", module: "projects", action: "view", description: "Ver projetos" },
  { key: "projects.create", module: "projects", action: "create", description: "Cadastrar projetos" },
  { key: "projects.edit", module: "projects", action: "edit", description: "Editar projetos" },
  { key: "projects.publish", module: "projects", action: "publish", description: "Publicar projetos" },
  // Campanhas / Marketing
  { key: "campaigns.view", module: "campaigns", action: "view", description: "Ver campanhas" },
  { key: "campaigns.create", module: "campaigns", action: "create", description: "Criar campanhas" },
  { key: "campaigns.manage", module: "campaigns", action: "manage", description: "Gerenciar campanhas" },
  { key: "campaigns.pause", module: "campaigns", action: "pause", description: "Pausar campanhas" },
  // Relatórios
  { key: "reports.view", module: "reports", action: "view", description: "Ver relatórios" },
  { key: "reports.create", module: "reports", action: "create", description: "Criar relatórios" },
  { key: "reports.export", module: "reports", action: "export", description: "Exportar relatórios" },
  // Financeiro
  { key: "financial.view", module: "financial", action: "view", description: "Ver financeiro" },
  { key: "financial.edit", module: "financial", action: "edit", description: "Editar financeiro" },
  { key: "financial.approve", module: "financial", action: "approve", description: "Aprovar financeiro" },
  // IA
  { key: "ai.use", module: "ai", action: "use", description: "Usar a IA (copilot)" },
  { key: "ai.configure", module: "ai", action: "configure", description: "Configurar a IA" },
  { key: "ai.train", module: "ai", action: "train", description: "Treinar/calibrar a IA" },
  { key: "ai.manage", module: "ai", action: "manage", description: "Administrar a IA" },
  // Integrações
  { key: "integrations.view", module: "integrations", action: "view", description: "Ver integrações" },
  { key: "integrations.manage", module: "integrations", action: "manage", description: "Gerenciar integrações" },
  // Configurações globais + auditoria
  { key: "settings.view", module: "settings", action: "view", description: "Ver configurações" },
  { key: "settings.manage", module: "settings", action: "manage", description: "Alterar configurações globais" },
  { key: "audit.view", module: "audit", action: "view", description: "Ver logs de auditoria" },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];
export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_CATALOG.map((p) => p.key);

export const ROLE_KEYS = [
  "admin_master",
  "diretor",
  "gerente",
  "corretor",
  "marketing",
  "incorporadora",
  "ia_agent",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  admin_master: "Administrador Master",
  diretor: "Diretor",
  gerente: "Gerente Comercial",
  corretor: "Corretor",
  marketing: "Marketing",
  incorporadora: "Incorporadora / Parceiro",
  ia_agent: "IA System Agent",
};

// Níveis de autonomia do IA System Agent — reservado para a próxima fase de
// governança de IA configurável (hoje aplicado via flags de aprovação humana).
export const AI_AGENT_LEVELS = ["read_only", "assistant", "operational", "supervised_autonomous"] as const;
export type AiAgentLevel = (typeof AI_AGENT_LEVELS)[number];

// Matriz padrão módulo × ação por papel. "*" = todas as permissões.
export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[] | "*"> = {
  admin_master: "*",
  diretor: [
    "leads.view", "leads.view_team", "leads.export",
    "clients.view", "clients.history",
    "users.view",
    "projects.view",
    "campaigns.view",
    "reports.view", "reports.create", "reports.export",
    "financial.view", "financial.edit", "financial.approve",
    "ai.use",
    "integrations.view",
    "settings.view",
    "audit.view",
  ],
  gerente: [
    "leads.view", "leads.view_team", "leads.assign", "leads.transfer", "leads.export",
    "clients.view", "clients.history",
    "users.view",
    "projects.view",
    "campaigns.view",
    "reports.view", "reports.export",
    "financial.view",
    "ai.use",
  ],
  corretor: [
    "leads.view", "leads.create", "leads.edit",
    "clients.view", "clients.history",
    "projects.view",
    "reports.view",
    "ai.use",
  ],
  marketing: [
    "campaigns.view", "campaigns.create", "campaigns.manage", "campaigns.pause",
    "integrations.view", "integrations.manage",
    "reports.view", "reports.export",
    "ai.use",
  ],
  incorporadora: [
    "projects.view", "projects.create", "projects.edit", "projects.publish",
    "reports.view",
  ],
  ia_agent: [
    "ai.use",
    "leads.view", "leads.view_team",
    "clients.view",
    "projects.view",
    "reports.view",
  ],
};

// Ponte de compatibilidade: resolve os papéis legados de `profiles`
// (accessRole/commercialRole) para os RoleKeys do RBAC novo, sem migrar usuários.
export type LegacyProfileRoles = {
  accessRole?: string | null;
  commercialRole?: string | null;
  role?: string | null;
};

export function resolveRoleKeys(profile: LegacyProfileRoles): RoleKey[] {
  const keys = new Set<RoleKey>();
  if (profile.accessRole === "admin") keys.add("admin_master");
  const commercial = profile.commercialRole ?? (profile.role === "admin" ? "director" : profile.role);
  if (commercial === "director" || commercial === "superintendent" || profile.accessRole === "director" || profile.accessRole === "director_decisor") keys.add("diretor");
  if (commercial === "manager") keys.add("gerente");
  if (commercial === "broker") keys.add("corretor");
  // Papéis marketing/incorporadora/ia_agent vêm de user_roles explícito (futuro).
  if (keys.size === 0) keys.add("corretor"); // fallback mínimo seguro
  return [...keys];
}

export function permissionsForRoleKeys(roleKeys: RoleKey[]): Set<PermissionKey> {
  const set = new Set<PermissionKey>();
  for (const roleKey of roleKeys) {
    const grant = ROLE_PERMISSIONS[roleKey];
    if (grant === "*") { ALL_PERMISSIONS.forEach((p) => set.add(p)); return set; }
    grant.forEach((p) => set.add(p));
  }
  return set;
}

export function hasPermission(profile: LegacyProfileRoles, permission: PermissionKey): boolean {
  return permissionsForRoleKeys(resolveRoleKeys(profile)).has(permission);
}

export function effectivePermissions(profile: LegacyProfileRoles): PermissionKey[] {
  return [...permissionsForRoleKeys(resolveRoleKeys(profile))].sort();
}
