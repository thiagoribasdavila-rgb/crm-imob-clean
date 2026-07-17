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
  { key: "director-tenant-isolation", role: "director", title: "Isolamento entre empresas", procedure: "Comparar acessos de duas organizações.", expected: "Nenhum dado cruza organizações.", href: "/atlas-v3/governance" },
  { key: "director-backup", role: "director", title: "Backup de homologação", procedure: "Registrar snapshot anterior à publicação.", expected: "Restauração possui evidência e responsável.", href: "/atlas-v3/audit" },
  { key: "director-rollback", role: "director", title: "Rollback para V2", procedure: "Simular retorno sem apagar o V3.", expected: "Plano executável dentro do tempo acordado.", href: "/atlas-v3/audit" },
  { key: "director-hostinger-health", role: "director", title: "Saúde da Hostinger", procedure: "Validar aplicação, PM2, logs e reinício.", expected: "Serviço retorna após reinício controlado.", href: "/integrations/hostinger" },
  { key: "director-domain-ssl", role: "director", title: "Domínio e SSL", procedure: "Abrir subdomínio de homologação e testar HTTPS.", expected: "Certificado válido e sem conteúdo misto.", href: "/atlas-v3/audit" },
  { key: "director-environment-secrets", role: "director", title: "Segredos do ambiente", procedure: "Revisar variáveis sem revelar valores.", expected: "Nenhum segredo está no navegador ou repositório.", href: "/atlas-v3/governance" },
  { key: "director-api-health", role: "director", title: "APIs de saúde", procedure: "Executar health e ready no ambiente publicado.", expected: "Dependências essenciais são diagnosticadas.", href: "/atlas-v3/developer/health" },
  { key: "director-openai", role: "director", title: "OpenAI real", procedure: "Executar copiloto com credencial de homologação.", expected: "Resposta é rastreável, segura e mensurada.", href: "/settings/ai" },
  { key: "director-perplexity", role: "director", title: "Pesquisa Perplexity", procedure: "Pesquisar mercado sem dados pessoais.", expected: "Fontes aparecem e PII é bloqueada.", href: "/settings/ai" },
  { key: "director-meta-webhook", role: "director", title: "Webhook Meta", procedure: "Enviar evento oficial de teste assinado.", expected: "Lead é criado uma vez e preserva atribuição.", href: "/integrations/meta" },
  { key: "director-meta-capi", role: "director", title: "Conversions API", procedure: "Enviar eventos no código de teste.", expected: "Eventos aparecem no dataset sem produção ativada.", href: "/integrations/meta" },
  { key: "director-meta-insights", role: "director", title: "Meta Insights", procedure: "Comparar gasto e resultados com Ads Manager.", expected: "Dia, semana e mês conferem.", href: "/integrations/meta" },
  { key: "director-whatsapp-health", role: "director", title: "Saúde do WhatsApp", procedure: "Consultar número, qualidade e limite.", expected: "Graph API confirma a conta configurada.", href: "/integrations/whatsapp" },
  { key: "director-whatsapp-template", role: "director", title: "Template WhatsApp", procedure: "Enviar template aprovado para número de teste.", expected: "Envio, entrega e leitura são registrados.", href: "/integrations/whatsapp" },
  { key: "director-nightly-journey", role: "director", title: "Jornada após 20h", procedure: "Executar worker após 20h com lead consentido.", expected: "Abordagem entra em aprovação uma única vez.", href: "/approvals" },
  { key: "director-payment-rule", role: "director", title: "Fluxo de pagamento", procedure: "Cadastrar duas versões para uma incorporadora.", expected: "Somente a última fica ativa e o histórico permanece.", href: "/developments" },
  { key: "director-storage", role: "director", title: "Storage de materiais", procedure: "Subir e abrir book, tabela e espelho.", expected: "Links protegidos expiram e arquivos ficam isolados.", href: "/developments/materials" },
  { key: "director-daily-report", role: "director", title: "Relatório diário", procedure: "Executar cron das 08h duas vezes.", expected: "Gera um único relatório por dia.", href: "/integrations/meta" },
  { key: "director-cost-routing", role: "director", title: "Custo da IA", procedure: "Executar tarefas rápidas, comerciais e complexas.", expected: "Cada tarefa usa a rota prevista e registra consumo.", href: "/settings/ai" },
  { key: "superintendent-dashboard", role: "superintendent", title: "Painel da superintendência", procedure: "Comparar números dos gerentes subordinados.", expected: "Totais conferem sem dados da diretoria inteira.", href: "/dashboard" },
  { key: "superintendent-queue", role: "superintendent", title: "Fila de gerentes", procedure: "Conferir gestores e corretores online.", expected: "Disponibilidade atualiza a distribuição.", href: "/distribution" },
  { key: "superintendent-reactivation", role: "superintendent", title: "Reativação governada", procedure: "Importar base consentida e solicitar aprovação.", expected: "Duplicados e opt-outs são bloqueados.", href: "/leads/import" },
  { key: "superintendent-campaign-ranking", role: "superintendent", title: "Ranking de campanhas", procedure: "Comparar qualidade e conversão por campanha.", expected: "Amostra insuficiente não recomenda escala.", href: "/integrations/meta" },
  { key: "manager-distribution", role: "manager", title: "Distribuição equilibrada", procedure: "Distribuir leads do mesmo projeto entre corretores online.", expected: "Carga e fila permanecem equilibradas.", href: "/distribution" },
  { key: "manager-project-balance", role: "manager", title: "Equilíbrio por projeto", procedure: "Distribuir leads de dois empreendimentos.", expected: "Elegibilidade respeita projeto e disponibilidade.", href: "/distribution" },
  { key: "manager-sla", role: "manager", title: "SLA do time", procedure: "Identificar leads atrasados e sem contato.", expected: "Alertas levam ao corretor responsável.", href: "/dashboard" },
  { key: "manager-experience", role: "manager", title: "Experiência do cliente", procedure: "Analisar sinal de atrito no WhatsApp.", expected: "Troca de corretor depende de decisão humana.", href: "/leads/import" },
  { key: "manager-approval", role: "manager", title: "Aprovação de abordagem", procedure: "Aprovar e rejeitar mensagens de teste.", expected: "Somente aprovadas entram na outbox.", href: "/approvals" },
  { key: "manager-external-sale", role: "manager", title: "Venda fora da plataforma", procedure: "Tentar registrar compra externa.", expected: "Não infla receita e decisão financeira fica com diretoria.", href: "/external-sales" },
  { key: "broker-qualification", role: "broker", title: "Qualificação rápida", procedure: "Responder finalidade, prazo e pagamento.", expected: "Score e próximas perguntas são recalibrados.", href: "/leads" },
  { key: "broker-exclusive-copilot", role: "broker", title: "Copiloto exclusivo", procedure: "Abrir a mesma lead em dois contextos.", expected: "Memória permanece vinculada ao corretor e lead.", href: "/leads" },
  { key: "broker-simulation", role: "broker", title: "Simulação", procedure: "Preparar cenário financeiro com regra vigente.", expected: "Valores são identificados como simulação, não promessa.", href: "/pipeline" },
  { key: "broker-proposal", role: "broker", title: "Proposta", procedure: "Gerar proposta a partir de unidade disponível.", expected: "Preço, estoque e pagamento exigem revisão.", href: "/pipeline" },
  { key: "broker-optout", role: "broker", title: "Opt-out", procedure: "Responder SAIR no número de teste.", expected: "Novos envios são bloqueados imediatamente.", href: "/integrations/whatsapp" },
  { key: "broker-night-response", role: "broker", title: "Resposta da jornada noturna", procedure: "Responder à abordagem e conferir timeline.", expected: "Resposta chega ao corretor único e atualiza jornada.", href: "/conversations" },
  { key: "broker-won-sale", role: "broker", title: "Venda ganha", procedure: "Avançar oportunidade até ganho.", expected: "Conversão, comissão e atribuição são registradas.", href: "/sales" },
];
