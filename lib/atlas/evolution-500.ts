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
  status: "planejada" | "bloqueada" | "concluída";
  evidence?: string[];
  completedAt?: string;
};

const phaseEvidence: Record<number, Pick<Evolution500Phase, "status" | "evidence" | "completedAt">> = {
  1: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: [
      "141 páginas CRM inventariadas",
      "20 destinos da sidebar classificados em 4 grupos",
      "17 comandos globais e 4 atalhos móveis registrados",
      "4 jornadas por perfil e 6 jornadas críticas documentadas",
      "Lacunas de navegação preservadas para correção nas fases seguintes",
    ],
  },
  2: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Resultado comercial e critérios de sucesso registrados", "Decisão e ação priorizadas acima de volume visual", "Métricas sem telemetria real explicitamente bloqueadas"],
  },
  3: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Linha de base estrutural medida", "Três catálogos independentes identificados", "Métricas comportamentais mantidas pendentes até instrumentação real"],
  },
  4: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Catálogo canônico criado", "Sidebar, busca e dock conectados à mesma fonte", "Comando V2 removido da navegação ativa sem excluir a rota"],
  },
  5: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Banner de página atual redundante removido", "Contadores sem valor comercial removidos", "Busca, favoritos e indicador ativo preservados"],
  },
  6: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Grupos ganharam tipografia secundária consistente", "Tela ativa possui quatro sinais visuais complementares", "Hierarquia melhorada sem alterar rotas ou permissões"],
  },
  7: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Novo lead disponível como ação persistente", "Decisões de navegação reduzidas de duas para uma", "Rota e formulário existentes foram reutilizados"],
  },
  8: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Ação persistente aderiu ao padrão primário oficial", "Ação mantém nome acessível", "Nenhuma lógica comercial foi duplicada"],
  },
  9: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Fallback ordenado por prioridade de informação", "Status de carregamento anunciado de forma acessível", "Skeletons decorativos removidos da árvore assistiva"],
  },
  10: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Agenda vazia ganhou próximo passo", "Projetos distinguem portfólio vazio de filtro sem resultado", "Vendas preserva recuperação contextual sem dados fictícios"],
  },
  11: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Componente recuperável único criado", "Agenda e Projetos conectados ao padrão", "Retentativa segura sem exposição de stack técnico"],
  },
  12: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Canvas desktop ampliado para 1728 px", "Barra superior alinhada ao conteúdo", "Margens responsivas preservam densidade e leitura"],
  },
  13: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Workspace específico para 768–1023 px", "Dock centralizado e limitado a 560 px", "Barra superior compactada sem remover ações essenciais"],
  },
  14: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Shell touch-first abaixo de 768 px", "Campos com 16 px evitam zoom involuntário no iOS", "Topbar compacta e dock preservam ações comerciais essenciais"],
  },
  15: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Menu móvel contém e restaura o foco", "Seções e controles expõem relações ARIA", "Foco, contraste elevado e cores forçadas possuem suporte sistêmico"],
  },
  16: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Seis rotas comerciais críticas são pré-carregadas em tempo ocioso", "Navegação interna recebe feedback imediato e acessível", "Transição curta respeita movimento reduzido e possui recuperação automática"],
  },
  17: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: ["Visualizações e navegações concluídas geram eventos reais autenticados", "Rotas removem parâmetros e identificadores antes do envio", "Telemetria respeita Do Not Track e nunca bloqueia a operação"],
  },
  18: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: [
      "Seis personas cobrem os quatro acessos oficiais e a hierarquia comercial completa",
      "Sidebar, busca global e dock móvel compartilham a mesma política canônica",
      "Cache local não eleva permissões antes da confirmação do perfil protegido",
      "Perfis legados são normalizados para o papel comercial canônico",
      "Validação não criou usuários nem alterou dados operacionais",
      "Auditoria real foi bloqueada pelo contrato legado de profiles e permanece explícita para a homologação",
    ],
  },
  19: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: [
      "Auditoria de schema passou a listar todas as tabelas e colunas ausentes",
      "Auditoria de hierarquia consulta somente campos seguros de autorização",
      "Contrato legado real foi medido sem imprimir dados pessoais",
      "Hierarquia ausente não é presumida nem aprovada",
      "Cadeia histórica não reproduzível foi registrada como bloqueio de produção",
      "Nenhuma migração ou alteração de usuário foi executada",
    ],
  },
  20: {
    status: "bloqueada",
    evidence: [
      "Qualidade local aprovada por typecheck, lint, build e scanner de segredos",
      "Banco runtime auditado somente em leitura, sem alterar usuários ou dados comerciais",
      "Ambiente Supabase de homologação separado ainda não foi comprovado",
      "Cadeia histórica de migrations precisa ser reconciliada antes de qualquer aplicação remota",
      "Homologação por perfil e liberação de produção permanecem bloqueadas até staging reproduzível",
    ],
  },
  21: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: [
      "141 rotas CRM classificadas sem consultar dados comerciais",
      "26 destinos canônicos resolvem para páginas existentes",
      "29 rotas dinâmicas foram preservadas como contexto de jornada",
      "71 rotas profundas permanecem como superfícies de apoio",
      "14 superfícies de topo fora do catálogo foram classificadas antes de qualquer consolidação",
      "Nenhuma rota foi excluída ou redirecionada e o gate da Fase 020 permanece bloqueado",
    ],
  },
  22: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: [
      "Os 26 destinos canônicos receberam pergunta, ação e evidência comercial",
      "Vinte destinos principais e seis comandos contextuais mantêm papéis distintos",
      "Seis jornadas críticas possuem objetivo de até três ações sem inventar uso real",
      "Sete grupos ambíguos receberam conceito principal e compatibilidade preservada",
      "Rotas dinâmicas continuam no contexto e páginas profundas permanecem como apoio",
      "Nenhuma decisão automática sobre pessoas, remoção ou redirecionamento foi autorizado",
    ],
  },
  23: {
    status: "concluída",
    completedAt: "2026-07-18",
    evidence: [
      "Linha de base estrutural reproduzível cobre 183 arquivos e 141 rotas CRM",
      "Os 26 destinos canônicos permanecem presentes no catálogo governado",
      "Profundidade máxima de quatro segmentos e 26 rotas profundas foram medidas",
      "Seis jornadas críticas possuem endpoints existentes e uma lacuna contextual foi identificada",
      "Duas âncoras internas e dez destinos dependentes apenas do catálogo foram registrados para evolução",
      "Cliques, tempo, conclusão e abandono continuam sem valor até telemetria real",
      "Nenhum dado, segredo, rota ou decisão sobre pessoas foi alterado",
    ],
  },
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
  { id: 26, name: "Onboarding guiado", outcome: "Cada perfil aprende o Atlas executando sua primeira jornada real.", href: "/settings/profile", pillar: "experiência" },
  { id: 27, name: "Central de atenção", outcome: "Alertas são priorizados, agrupados e convertidos em ação.", href: "/notifications", pillar: "experiência" },
  { id: 28, name: "Colaboração e handoffs", outcome: "Trocas entre IA, corretor e liderança preservam todo o contexto.", href: "/activity", pillar: "operação" },
  { id: 29, name: "Comunicação omnichannel", outcome: "WhatsApp, e-mail, ligação e agenda compartilham uma timeline.", href: "/conversations", pillar: "operação" },
  { id: 30, name: "Reativação inteligente", outcome: "Bases antigas voltam à operação com consentimento e prioridade.", href: "/leads/reactivation-governance", pillar: "inteligência" },
  { id: 31, name: "Meta e Andromeda", outcome: "Sinais de qualidade e conversão retornam às campanhas corretamente.", href: "/integrations/meta/andromeda", pillar: "inteligência" },
  { id: 32, name: "Atribuição de receita", outcome: "Cada venda preserva campanha, origem, custo e contribuição real.", href: "/reports/marketing", pillar: "inteligência" },
  { id: 33, name: "Ranking de campanhas", outcome: "A gestão compara eficiência por lead, visita, proposta e venda.", href: "/marketing/campaign-intelligence", pillar: "inteligência" },
  { id: 34, name: "Command Center executivo", outcome: "A diretoria decide por exceção, impacto e tendência comprovada.", href: "/dashboard", pillar: "inteligência" },
  { id: 35, name: "Workspace do corretor", outcome: "Atender, registrar e avançar uma lead exige o mínimo de esforço.", href: "/leads", pillar: "experiência" },
  { id: 36, name: "Workspace do gerente", outcome: "O gerente enxerga gargalos, pessoas e ações do próprio time.", href: "/brokers", pillar: "operação" },
  { id: 37, name: "Workspace da diretoria", outcome: "A liderança acompanha toda a hierarquia sem microgerenciar.", href: "/reports", pillar: "operação" },
  { id: 38, name: "Governança administrativa", outcome: "Usuários, acessos, custos e integrações ficam auditáveis.", href: "/users", pillar: "plataforma" },
  { id: 39, name: "Pesquisa imobiliária", outcome: "Projetos e regiões recebem conhecimento verificável e atualizado.", href: "/developments/registry", pillar: "inteligência" },
  { id: 40, name: "Estoque e precificação", outcome: "Disponibilidade, tabela e velocidade de venda orientam a oferta.", href: "/developments", pillar: "operação" },
  { id: 41, name: "Vendas e comissões", outcome: "Fechamento, recebimento e SLA da incorporadora seguem rastreáveis.", href: "/sales", pillar: "operação" },
  { id: 42, name: "Forecast explicável", outcome: "Previsões mostram evidência, incerteza e ação recomendada.", href: "/atlas-v3/forecast", pillar: "inteligência" },
  { id: 43, name: "Qualidade e deduplicação", outcome: "A fonte única permanece limpa sem perder histórico comercial.", href: "/leads/data-quality", pillar: "plataforma" },
  { id: 44, name: "Agentes e automações", outcome: "Trabalho repetitivo é automatizado com aprovação e rastreabilidade.", href: "/atlas-v3/agents", pillar: "inteligência" },
  { id: 45, name: "Voz e operação móvel", outcome: "Reuniões, ligações e deslocamentos viram registros e próximas ações.", href: "/calendar", pillar: "experiência" },
  { id: 46, name: "Personalização adaptativa", outcome: "Atalhos e densidade evoluem conforme perfil e uso comprovado.", href: "/settings", pillar: "experiência" },
  { id: 47, name: "Privacidade e LGPD", outcome: "Consentimento, finalidade, retenção e exclusão ficam controlados.", href: "/atlas-v3/governance", pillar: "plataforma" },
  { id: 48, name: "Planos e monetização SaaS", outcome: "Start, Pro e Enterprise possuem valor, limites e custos claros.", href: "/atlas-v3/investor", pillar: "plataforma" },
  { id: 49, name: "Customer Success", outcome: "Adoção, saúde da conta e valor percebido são medidos continuamente.", href: "/atlas-v3/acceptance", pillar: "homologação" },
  { id: 50, name: "Otimização contínua", outcome: "Telemetria e feedback alimentam o próximo ciclo sem inflar o produto.", href: "/atlas-v3/model-monitoring", pillar: "homologação" },
];

export const evolution500Waves: EvolutionWave[] = waveDefinitions.map((wave) => ({
  ...wave,
  range: `${String((wave.id - 1) * 20 + 1).padStart(3, "0")}–${String(wave.id * 20).padStart(3, "0")}`,
}));

export const evolution500Phases: Evolution500Phase[] = evolution500Waves.flatMap((wave) =>
  checkpoints.map((checkpoint, index) => {
    const id = (wave.id - 1) * checkpoints.length + index + 1;
    return ({
    id,
    waveId: wave.id,
    title: `${wave.name} · ${checkpoint}`,
    outcome: wave.outcome,
    href: wave.href,
    pillar: wave.pillar,
    ...(phaseEvidence[id] ?? { status: "planejada" as const }),
  });}),
);

export const evolution500Summary = {
  totalPhases: evolution500Phases.length,
  totalWaves: evolution500Waves.length,
  phasesPerWave: checkpoints.length,
  executionRule: "Uma fase só avança com evidência, medição e validação do perfil afetado.",
  completedPhases: evolution500Phases.filter((phase) => phase.status === "concluída").length,
  blockedPhases: evolution500Phases.filter((phase) => phase.status === "bloqueada").length,
};

export const evolution1000Waves = evolution500Waves;
export const evolution1000Phases = evolution500Phases;
export const evolution1000Summary = evolution500Summary;
