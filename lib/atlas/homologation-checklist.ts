export type HomologationRole = "director" | "superintendent" | "manager" | "broker";

export type HomologationCheck = {
  key: string;
  role: HomologationRole;
  title: string;
  procedure: string;
  expected: string;
  href: string;
};

export const homologationChecklist: HomologationCheck[] = [
  { key: "director-full-visibility", role: "director", title: "Visão integral da operação", procedure: "Abrir leads, cockpit e pipeline e comparar os totais com a operação conhecida.", expected: "Visualiza todos os níveis abaixo, sem registros de outra empresa.", href: "/ai-dashboard" },
  { key: "director-product-learning", role: "director", title: "Inteligência de produto", procedure: "Conferir apresentações, interesses e rejeições no cockpit.", expected: "Indicadores refletem somente equipes da própria organização.", href: "/ai-dashboard" },
  { key: "director-commission-sla", role: "director", title: "SLA de comissão", procedure: "Abrir vendas ganhas de incorporadoras com prazos diferentes e conferir vencimento, baixa parcial e atraso.", expected: "Cada venda herda o SLA correto, mantém histórico e não aparece como recebida sem baixa.", href: "/sales" },
  { key: "director-integrations-governance", role: "director", title: "Governança omnichannel", procedure: "Abrir integrações, conferir estados e tentar salvar uma configuração contendo segredo.", expected: "Conectores não configurados não aparecem como conectados e segredos são rejeitados pela API.", href: "/integrations" },
  { key: "director-password-recovery", role: "director", title: "Recuperação de acesso", procedure: "Solicitar recuperação no domínio de homologação, usar o e-mail mais recente e entrar com a nova senha.", expected: "Callback retorna ao domínio público correto, não entra em loop e links usados ou expirados são recusados.", href: "/forgot-password" },
  { key: "superintendent-managers", role: "superintendent", title: "Escopo dos gerentes", procedure: "Alternar entre carteiras dos gerentes subordinados.", expected: "Vê gerentes e equipes abaixo, sem acessar estruturas paralelas.", href: "/leads" },
  { key: "superintendent-transfer", role: "superintendent", title: "Redistribuição entre equipes", procedure: "Transferir um conjunto de leads para gerente permitido.", expected: "Transferência em massa concluída e auditada.", href: "/leads/actions" },
  { key: "manager-team-visibility", role: "manager", title: "Visão exclusiva do time", procedure: "Conferir leads de todos os corretores subordinados.", expected: "Não visualiza leads de outro gerente.", href: "/leads" },
  { key: "manager-bulk-transfer", role: "manager", title: "Transferência para corretor", procedure: "Mover leads em massa entre corretores do próprio time.", expected: "Somente corretores subordinados aparecem como destino.", href: "/leads/actions" },
  { key: "broker-own-leads", role: "broker", title: "Carteira individual", procedure: "Abrir lista, busca e Lead 360.", expected: "Visualiza apenas leads atribuídos ao próprio usuário.", href: "/leads" },
  { key: "broker-first-contact-sla", role: "broker", title: "SLA do primeiro contato", procedure: "Abrir um lead novo de campanha e registrar o primeiro acompanhamento.", expected: "Prazo aparece antes do contato e é encerrado automaticamente após a primeira interação.", href: "/pipeline" },
  { key: "broker-matching", role: "broker", title: "Matching e apresentação", procedure: "Selecionar até três imóveis, gerar mensagem e abrir no WhatsApp.", expected: "Indisponíveis são bloqueados e nada é enviado automaticamente.", href: "/properties/mtching" },
  { key: "broker-feedback", role: "broker", title: "Retorno do cliente", procedure: "Registrar apresentação e marcar Gostou ou Não aderiu.", expected: "Timeline e ranking são recalibrados com o retorno.", href: "/properties/mtching" },
  { key: "broker-materials", role: "broker", title: "Materiais vigentes", procedure: "Buscar projeto e abrir book, tabela e espelho.", expected: "Materiais estão separados por incorporadora e versões vencidas são sinalizadas.", href: "/developments/materials" },
];
