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
    progress: 98,
    weight: 10,
    status: "avançada",
    evidence: ["Node 24 validado", "Doctor aprovado", "Build, lint e typecheck aprovados", "103 controles de IA, CRM e Meta e 12 cenários calibrados"],
    next: "Executar a bateria real com credenciais de homologação.",
    href: "/atlas-v3/audit",
  },
  {
    id: 2,
    name: "Segurança, banco e multi-tenant",
    shortName: "Segurança",
    progress: 84,
    weight: 15,
    status: "avançada",
    evidence: ["Guard autenticado", "RLS versionada", "Hierarquia diretor → corretor", "Auditoria, rate limit e escopo por organização"],
    next: "Comprovar isolamento usando duas organizações reais.",
    href: "/atlas-v3/governance",
  },
  {
    id: 3,
    name: "Paridade CRM com V2",
    shortName: "CRM",
    progress: 97,
    weight: 15,
    status: "avançada",
    evidence: ["Leads Intelligence paginado", "Lead 360", "Pipeline persistente", "Visibilidade hierárquica", "Transferência em massa", "Origem Meta e aprendizado visíveis na carteira"],
    next: "Executar roteiro real por perfil: diretor, superintendente, gerente e corretor.",
    href: "/leads",
  },
  {
    id: 4,
    name: "Projetos e dados reais",
    shortName: "Projetos",
    progress: 80,
    weight: 12,
    status: "parcial",
    evidence: ["Launch OS", "Empreendimentos e inventário", "Hub de materiais", "Book, tabela e espelho por incorporadora", "Matching com estoque"],
    next: "Validar ARVO e demais projetos com materiais e disponibilidade reais atualizados.",
    href: "/developments",
  },
  {
    id: 5,
    name: "Operação comercial",
    shortName: "Operação",
    progress: 72,
    weight: 10,
    status: "parcial",
    evidence: ["Pipeline com histórico", "SLA visível", "Redistribuição em massa", "Apresentação via WhatsApp", "Feedback do cliente auditável"],
    next: "Executar piloto comercial e medir tempo de resposta, aceite e conversão por equipe.",
    href: "/pipeline",
  },
  {
    id: 6,
    name: "IA funcional",
    shortName: "IA",
    progress: 96,
    weight: 10,
    status: "avançada",
    evidence: ["Copilot tenant-safe", "103 controles calibrados", "Score e matching explicáveis", "Fallback local", "Aprendizado com feedback", "OpenAI + Perplexity", "Aprovação humana"],
    next: "Validar Gateway com credencial de homologação e medir qualidade em conversas reais.",
    href: "/settings/ai",
  },
  {
    id: 7,
    name: "UX e responsividade",
    shortName: "UX",
    progress: 96,
    weight: 10,
    status: "avançada",
    evidence: ["App Shell oficial", "Sidebar responsiva", "Command Center premium", "Lead 360", "Matching Studio", "Cockpit gerencial", "Contexto Meta na carteira e Lead 360"],
    next: "Executar revisão responsiva com usuários reais nos fluxos de corretor e gestão.",
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
    href: "/atlas-v3/homologation",
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
