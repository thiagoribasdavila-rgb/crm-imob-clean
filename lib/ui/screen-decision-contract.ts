export type DecisionRole = "director" | "superintendent" | "manager" | "broker";

export type ScreenDecisionContract = {
  route: string;
  role: DecisionRole;
  decision: string;
  owner: string;
  deadline: string;
  expectedResult: string;
  evidence: string;
};

type DecisionDefinition = Omit<ScreenDecisionContract, "route" | "role">;

const DAILY_OPERATION: Record<DecisionRole, DecisionDefinition> = {
  director: {
    decision: "Definir qual risco de receita exige intervenção executiva.",
    owner: "Diretor",
    deadline: "Na revisão executiva de hoje",
    expectedResult: "Decisão aprovada, delegada ou mantida em observação.",
    evidence: "Decisão, responsável e prazo registrados.",
  },
  superintendent: {
    decision: "Definir qual gerente precisa de apoio para remover o maior gargalo.",
    owner: "Superintendente",
    deadline: "Antes do próximo ciclo de distribuição",
    expectedResult: "Gerente apoiado com ação e prazo combinados.",
    evidence: "Intervenção registrada no acompanhamento da estrutura direta.",
  },
  manager: {
    decision: "Definir onde intervir para recuperar SLA, carga ou próxima ação.",
    owner: "Gerente",
    deadline: "Ainda hoje",
    expectedResult: "Gargalo atribuído e corretor orientado sem perder a titularidade da lead.",
    evidence: "Responsável, prazo e próxima ação confirmados.",
  },
  broker: {
    decision: "Executar a próxima ação comercial de maior prioridade.",
    owner: "Corretor responsável",
    deadline: "No prazo exibido para a lead",
    expectedResult: "Atendimento avançado ou próxima ação agendada.",
    evidence: "Interação e resultado registrados no histórico da lead.",
  },
};

const SCREEN_DECISIONS: Record<string, Partial<Record<DecisionRole, DecisionDefinition>>> = {
  "/dashboard": DAILY_OPERATION,
  "/leads": {
    director: { decision: "Identificar perdas de cobertura na carteira.", owner: "Diretor", deadline: "Na revisão diária", expectedResult: "Exceção encaminhada à liderança responsável.", evidence: "Encaminhamento registrado." },
    superintendent: { decision: "Priorizar carteiras que exigem apoio gerencial.", owner: "Superintendente", deadline: "Hoje", expectedResult: "Gerente responsável acionado.", evidence: "Ação de apoio registrada." },
    manager: { decision: "Definir qual lead ou corretor precisa de intervenção.", owner: "Gerente", deadline: "Antes do SLA vencer", expectedResult: "Lead com responsável e próxima ação.", evidence: "Atribuição e prazo registrados." },
    broker: { decision: "Escolher a próxima lead a atender.", owner: "Corretor responsável", deadline: "Conforme SLA", expectedResult: "Contato realizado ou próximo passo agendado.", evidence: "Resultado registrado no histórico." },
  },
  "/pipeline": {
    director: { decision: "Identificar receita em risco por etapa.", owner: "Diretor", deadline: "Na revisão executiva", expectedResult: "Risco delegado à liderança correta.", evidence: "Decisão e responsável registrados." },
    superintendent: { decision: "Identificar a equipe com maior gargalo no funil.", owner: "Superintendente", deadline: "Nesta semana", expectedResult: "Plano de recuperação alinhado com o gerente.", evidence: "Prazo e resultado esperado registrados." },
    manager: { decision: "Destravar oportunidades paradas do time.", owner: "Gerente", deadline: "Hoje", expectedResult: "Cada exceção com corretor e próxima ação.", evidence: "Intervenção registrada sem mover a lead automaticamente." },
    broker: { decision: "Avançar ou requalificar a oportunidade atual.", owner: "Corretor responsável", deadline: "No prazo da próxima ação", expectedResult: "Etapa coerente com a conversa real.", evidence: "Movimentação e motivo registrados." },
  },
  "/tasks": {
    manager: { decision: "Recuperar compromissos vencidos do time.", owner: "Gerente", deadline: "Hoje", expectedResult: "Pendências redistribuídas ou reagendadas com critério.", evidence: "Novo prazo e responsável registrados." },
    broker: { decision: "Concluir ou reagendar a tarefa prioritária.", owner: "Corretor responsável", deadline: "No horário da tarefa", expectedResult: "Compromisso concluído com resultado ou novo prazo.", evidence: "Status e resultado registrados." },
  },
  "/agenda": {
    manager: { decision: "Resolver conflitos e lacunas da agenda do time.", owner: "Gerente", deadline: "Antes do início do expediente seguinte", expectedResult: "Cobertura comercial preservada.", evidence: "Compromissos e responsáveis confirmados." },
    broker: { decision: "Preparar e executar o próximo compromisso.", owner: "Corretor responsável", deadline: "No horário agendado", expectedResult: "Compromisso realizado ou reagendado com cliente informado.", evidence: "Resultado registrado na agenda e na lead." },
  },
  "/developments": {
    director: { decision: "Definir quais projetos exigem atenção comercial.", owner: "Diretor", deadline: "Na revisão semanal", expectedResult: "Prioridade de portfólio confirmada.", evidence: "Decisão vinculada ao projeto." },
    manager: { decision: "Definir o projeto prioritário para o time.", owner: "Gerente", deadline: "Antes da distribuição ou campanha", expectedResult: "Equipe e materiais alinhados ao projeto.", evidence: "Orientação registrada." },
    broker: { decision: "Selecionar o projeto compatível com a necessidade da lead.", owner: "Corretor responsável", deadline: "Antes da próxima abordagem", expectedResult: "Projeto apresentado com aderência comprovável.", evidence: "Interesse e material enviado registrados." },
  },
  "/distribution": {
    director: { decision: "Validar equilíbrio, capacidade e regras de distribuição.", owner: "Diretor", deadline: "Antes de ampliar campanhas", expectedResult: "Política mantida ou ajuste autorizado.", evidence: "Decisão auditável registrada." },
    superintendent: { decision: "Equilibrar capacidade entre gerências diretas.", owner: "Superintendente", deadline: "Antes do próximo lote", expectedResult: "Carga compatível com a capacidade das equipes.", evidence: "Ajuste e justificativa registrados." },
    manager: { decision: "Selecionar corretores elegíveis por projeto.", owner: "Gerente", deadline: "Antes da entrada das próximas leads", expectedResult: "Fila ativa, explicável e com capacidade disponível.", evidence: "Participantes e critérios registrados." },
  },
  "/marketing/campaigns": {
    director: { decision: "Decidir manter, revisar ou interromper investimento.", owner: "Diretor", deadline: "Na revisão semanal de campanhas", expectedResult: "Orçamento preservado ou alteração aprovada por humano.", evidence: "Decisão baseada em amostra, vendas e receita atribuída." },
    manager: { decision: "Alinhar atendimento à promessa da campanha.", owner: "Gerente", deadline: "Antes do próximo ciclo de leads", expectedResult: "Equipe orientada para o público e projeto corretos.", evidence: "Briefing e orientação registrados." },
  },
  "/reports": {
    director: { decision: "Escolher a ação executiva sustentada pelo período.", owner: "Diretor", deadline: "Ao fechar a revisão", expectedResult: "Uma decisão clara, delegada e mensurável.", evidence: "Responsável, prazo e indicador de resultado registrados." },
    superintendent: { decision: "Escolher a intervenção de maior impacto entre gerências.", owner: "Superintendente", deadline: "Na revisão semanal", expectedResult: "Uma prioridade pactuada com a gerência.", evidence: "Meta de recuperação registrada." },
    manager: { decision: "Escolher o coaching ou correção operacional do time.", owner: "Gerente", deadline: "Na revisão semanal", expectedResult: "Ação aplicada e efeito acompanhado.", evidence: "Ação, prazo e indicador registrados." },
    broker: { decision: "Revisar o próprio desempenho e ajustar a rotina.", owner: "Corretor", deadline: "Na revisão semanal", expectedResult: "Uma melhoria prática aplicada à carteira.", evidence: "Compromisso pessoal registrado." },
  },
};

function normalizeRoute(route: string) {
  const pathname = route.split("?")[0]?.replace(/\/$/, "") || "/dashboard";
  if (pathname.startsWith("/leads/")) return "/leads";
  if (pathname.startsWith("/developments/")) return "/developments";
  return pathname;
}

export function normalizeDecisionRole(value: unknown): DecisionRole {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "admin" || role === "director_decisor") return "director";
  if (role === "director" || role === "superintendent" || role === "manager" || role === "broker") return role;
  return "broker";
}

export function getScreenDecisionContract(route: string, roleValue: unknown): ScreenDecisionContract {
  const role = normalizeDecisionRole(roleValue);
  const normalizedRoute = normalizeRoute(route);
  const definitions = SCREEN_DECISIONS[normalizedRoute];
  const definition = definitions?.[role] ?? definitions?.broker ?? DAILY_OPERATION[role];
  return { route: normalizedRoute, role, ...definition };
}

export const SCREEN_DECISION_MATRIX = SCREEN_DECISIONS;
