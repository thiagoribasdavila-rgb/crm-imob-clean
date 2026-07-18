export type EvolutionWave = {
  id: number;
  range: string;
  name: string;
  outcome: string;
  href: string;
  pillar: "experiência" | "operação" | "inteligência" | "plataforma" | "homologação";
};

export type Evolution500Phase = {
  id: number;
  waveId: number;
  title: string;
  outcome: string;
  href: string;
  pillar: EvolutionWave["pillar"];
  status: "planejada";
};

const checkpoints = [
  "Inventariar a jornada atual",
  "Definir o resultado comercial",
  "Medir a linha de base",
  "Eliminar duplicidade",
  "Compactar informação",
  "Clarificar hierarquia visual",
  "Reduzir passos da tarefa",
  "Padronizar ação principal",
  "Criar carregamento progressivo",
  "Criar estado vazio útil",
  "Criar recuperação de falha",
  "Otimizar desktop",
  "Otimizar tablet",
  "Otimizar celular",
  "Garantir acessibilidade",
  "Medir velocidade percebida",
  "Instrumentar uso real",
  "Validar com cada perfil",
  "Corrigir evidências encontradas",
  "Homologar a onda",
] as const;

const waveDefinitions: Array<Omit<EvolutionWave, "range">> = [
  { id: 1, name: "Fundação de produto vendável", outcome: "Cada tela responde a uma decisão comercial real.", href: "/dashboard", pillar: "experiência" },
  { id: 2, name: "Arquitetura de navegação", outcome: "Qualquer função importante fica a até três ações de distância.", href: "/dashboard", pillar: "experiência" },
  { id: 3, name: "Densidade e compactação", outcome: "Mais contexto útil com menos rolagem e repetição.", href: "/dashboard", pillar: "experiência" },
  { id: 4, name: "Design system premium", outcome: "Componentes previsíveis, limpos e consistentes.", href: "/atlas-v3", pillar: "experiência" },
  { id: 5, name: "Responsividade integral", outcome: "Operação completa em desktop, tablet e celular.", href: "/dashboard", pillar: "experiência" },
  { id: 6, name: "Sidebar e busca universal", outcome: "Navegação rápida por ação, módulo, lead e projeto.", href: "/search", pillar: "experiência" },
  { id: 7, name: "Command palette e atalhos", outcome: "Usuários experientes executam tarefas sem interromper o fluxo.", href: "/search", pillar: "experiência" },
  { id: 8, name: "Home por perfil", outcome: "Diretor, gestor e corretor veem somente o que precisam decidir.", href: "/dashboard", pillar: "operação" },
  { id: 9, name: "Leads Intelligence", outcome: "A carteira indica claramente quem atender e por quê.", href: "/leads", pillar: "operação" },
  { id: 10, name: "Pipeline de alta fluidez", outcome: "Movimentar, priorizar e recuperar oportunidades sem atrito.", href: "/pipeline", pillar: "operação" },
  { id: 11, name: "Rotina, tarefas e agenda", outcome: "A próxima ação fica sempre evidente e executável.", href: "/calendar", pillar: "operação" },
  { id: 12, name: "Cliente 360", outcome: "Todo contexto do comprador aparece em uma fonte única.", href: "/customers", pillar: "operação" },
  { id: 13, name: "Launch OS", outcome: "Projetos, estoque, VGV e velocidade de vendas operam juntos.", href: "/developments", pillar: "operação" },
  { id: 14, name: "Materiais e incorporadoras", outcome: "Book, tabela e espelho vigentes são encontrados em segundos.", href: "/developments/materials", pillar: "operação" },
  { id: 15, name: "Relatórios para decisão", outcome: "Dia, semana e mês viram recomendações simples e rastreáveis.", href: "/reports", pillar: "inteligência" },
  { id: 16, name: "Integrações operacionais", outcome: "Cada conexão mostra credencial, teste real e saúde separadamente.", href: "/integrations", pillar: "plataforma" },
  { id: 17, name: "Malha multi-IA e Kimi", outcome: "Cada tarefa usa o modelo mais eficiente por custo, contexto e qualidade.", href: "/settings/ai", pillar: "inteligência" },
  { id: 18, name: "Memória comercial governada", outcome: "Decisões e resultados melhoram a operação sem vazar dados pessoais.", href: "/settings/ai-context", pillar: "inteligência" },
  { id: 19, name: "IA embarcada no trabalho", outcome: "A IA sugere a próxima ação no ponto exato da jornada.", href: "/decision-center", pillar: "inteligência" },
  { id: 20, name: "Performance percebida", outcome: "Telas críticas respondem imediatamente e carregam por prioridade.", href: "/atlas-v3/audit", pillar: "plataforma" },
  { id: 21, name: "Acessibilidade e linguagem", outcome: "A plataforma é clara, inclusiva e compreensível sem treinamento técnico.", href: "/settings/profile", pillar: "experiência" },
  { id: 22, name: "Segurança sem atrito", outcome: "Proteções fortes preservam fluidez, tenant e hierarquia.", href: "/atlas-v3/governance", pillar: "plataforma" },
  { id: 23, name: "Observabilidade e recuperação", outcome: "Falhas são detectadas e recuperadas antes de virar bloqueio comercial.", href: "/integrations/health", pillar: "plataforma" },
  { id: 24, name: "Homologação por jornada", outcome: "Cada fluxo é comprovado com usuário, dado e integração reais.", href: "/atlas-v3/homologation", pillar: "homologação" },
  { id: 25, name: "Produção e escala SaaS", outcome: "Release, rollback, custo e crescimento ficam controlados.", href: "/atlas-v3/reliability", pillar: "homologação" },
];

export const evolution500Waves: EvolutionWave[] = waveDefinitions.map((wave) => ({
  ...wave,
  range: `${String((wave.id - 1) * 20 + 1).padStart(3, "0")}–${String(wave.id * 20).padStart(3, "0")}`,
}));

export const evolution500Phases: Evolution500Phase[] = evolution500Waves.flatMap((wave) =>
  checkpoints.map((checkpoint, index) => ({
    id: (wave.id - 1) * checkpoints.length + index + 1,
    waveId: wave.id,
    title: `${wave.name} · ${checkpoint}`,
    outcome: wave.outcome,
    href: wave.href,
    pillar: wave.pillar,
    status: "planejada" as const,
  })),
);

export const evolution500Summary = {
  totalPhases: evolution500Phases.length,
  totalWaves: evolution500Waves.length,
  phasesPerWave: checkpoints.length,
  executionRule: "Uma fase só avança com evidência, medição e validação do perfil afetado.",
};
