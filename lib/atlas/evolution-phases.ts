export type EvolutionPhase = {
  id: number;
  name: string;
  shortName: string;
  progress: number;
  weight: number;
  status: "concluída" | "avançada" | "parcial" | "bloqueada";
  evidence: string[];
  next: string;
  href: string;
};

export const evolutionPhases: EvolutionPhase[] = [
  {
    id: 1,
    name: "Auditoria técnica",
    shortName: "Auditoria",
    progress: 95,
    weight: 10,
    status: "avançada",
    evidence: ["Node 24 validado", "Doctor aprovado", "Build, lint e typecheck aprovados", "Smoke 7/7"],
    next: "Executar a bateria real com credenciais de homologação.",
    href: "/atlas-v3/audit",
  },
  {
    id: 2,
    name: "Segurança, banco e multi-tenant",
    shortName: "Segurança",
    progress: 78,
    weight: 15,
    status: "avançada",
    evidence: ["Guard autenticado", "RLS versionada", "Contexto organizacional", "Auditoria e rate limit"],
    next: "Comprovar isolamento usando duas organizações reais.",
    href: "/atlas-v3/governance",
  },
  {
    id: 3,
    name: "Paridade CRM com V2",
    shortName: "CRM",
    progress: 88,
    weight: 15,
    status: "avançada",
    evidence: ["Command Center real", "Leads Intelligence paginado", "Lead 360", "Pipeline persistente", "Tarefas e agenda"],
    next: "Uniformizar Tarefas, Agenda e Corretores no design system oficial.",
    href: "/leads",
  },
  {
    id: 4,
    name: "Projetos e dados reais",
    shortName: "Projetos",
    progress: 52,
    weight: 12,
    status: "parcial",
    evidence: ["Launch OS", "Empreendimentos e inventário", "Filtros por projeto", "Indicadores por lançamento"],
    next: "Validar ARVO, INSIDE PERDIZES e SPIN MOOD sem leads órfãos.",
    href: "/developments",
  },
  {
    id: 5,
    name: "Operação comercial",
    shortName: "Operação",
    progress: 48,
    weight: 10,
    status: "parcial",
    evidence: ["Pipeline com histórico", "Fila de tarefas", "SLA visível", "Corretores cadastráveis"],
    next: "Homologar capacidade, distribuição e redistribuição antes de automatizar.",
    href: "/pipeline",
  },
  {
    id: 6,
    name: "IA funcional",
    shortName: "IA",
    progress: 75,
    weight: 10,
    status: "avançada",
    evidence: ["Copilot tenant-safe", "Contexto do dashboard", "Insights persistidos", "Decision Center"],
    next: "Validar Gateway real, explicabilidade do score e fallback operacional.",
    href: "/decision-center",
  },
  {
    id: 7,
    name: "UX e responsividade",
    shortName: "UX",
    progress: 90,
    weight: 10,
    status: "avançada",
    evidence: ["App Shell oficial", "Sidebar responsiva", "Command Center premium", "Estados resilientes"],
    next: "Finalizar revisão visual de Leads, Tarefas, Agenda e Corretores.",
    href: "/dashboard",
  },
  {
    id: 8,
    name: "Homologação técnica isolada",
    shortName: "Homologação técnica",
    progress: 35,
    weight: 8,
    status: "parcial",
    evidence: ["Release check aprovado", "Smoke automatizado", "Plano de homologação", "Rollback preservado"],
    next: "Criar release/v3-homolog e publicar preview isolado com variáveis reais.",
    href: "/atlas-v3/audit",
  },
  {
    id: 9,
    name: "Homologação operacional",
    shortName: "Homologação operacional",
    progress: 0,
    weight: 5,
    status: "bloqueada",
    evidence: ["Roteiro funcional documentado"],
    next: "Executar piloto de 5 a 10 dias com admin, gestor e corretor.",
    href: "/users",
  },
  {
    id: 10,
    name: "Substituição controlada",
    shortName: "Produção",
    progress: 8,
    weight: 5,
    status: "bloqueada",
    evidence: ["V2 preservado", "Estratégia de rollback documentada"],
    next: "Testar backup, sincronização, troca de domínio e rollback após homologação.",
    href: "/settings",
  },
];

export const overallEvolution = Math.round(
  evolutionPhases.reduce((total, phase) => total + phase.progress * phase.weight, 0) /
    evolutionPhases.reduce((total, phase) => total + phase.weight, 0),
);

export const technicalEvolution = Math.round(
  evolutionPhases
    .slice(0, 8)
    .reduce((total, phase) => total + phase.progress * phase.weight, 0) /
    evolutionPhases.slice(0, 8).reduce((total, phase) => total + phase.weight, 0),
);
