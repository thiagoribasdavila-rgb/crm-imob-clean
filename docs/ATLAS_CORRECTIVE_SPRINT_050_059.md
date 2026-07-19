# ATLAS AI OS — Sprint corretivo 50–59

## Decisão

O projeto entra em modo corretivo antes de retomar a evolução contínua. Funcionalidade nova não tem prioridade enquanto jornadas existentes consultarem tabelas, colunas ou funções que não estão no banco ativo.

## Diagnóstico comprovado

- o banco ativo contém 17.151 leads: 16.733 estão arquivados na memória histórica e 418 pertencem à operação corrente;
- a API principal de leads consultava campos V3 inexistentes antes de tentar um fallback;
- o fallback carregava até 5.000 linhas para filtrar e paginar na memória;
- as etapas reais misturam valores antigos e canônicos (`NOVO`, `CONTATO`, `QUALIFICADO`, `novo`, `qualificacao`);
- as funções `create_lead_atomic`, `move_pipeline_lead` e `touch_commercial_presence` não existem no banco ativo;
- `atlas_events`, `pipeline_stage_settings`, `pipeline_stage_moves` e outras estruturas esperadas pelo código ainda não estão disponíveis;
- perfis usam `name`, tarefas usam `due_date` e `user_id`, e projetos estão divididos entre `projects` e `crm_projects`.

## Ordem das dez fases

1. Fase 50 — contrato real de leads e leitura do pipeline;
2. Fase 51 — escrita segura e histórico;
3. Fase 52 — tenant, hierarquia, perfis e presença;
4. Fase 53 — tarefas, agenda e próxima ação;
5. Fase 54 — projetos, incorporadoras, materiais, estoque e VGV;
6. Fase 55 — movimentação protegida e auditável;
7. Fase 56 — arquitetura de informação do Kanban;
8. Fase 57 — interação premium do Kanban;
9. Fase 58 — desempenho do Kanban em escala;
10. Fase 59 — homologação corretiva ponta a ponta.

## Critérios do Kanban de última geração

- nenhuma lead some por diferença de nomenclatura de etapa;
- a primeira tela mostra o que exige ação, não um excesso de métricas;
- cartões compactos exibem responsável, projeto, temperatura, SLA e próxima ação;
- movimentação tem confirmação persistida, conflito detectável, histórico e desfazer;
- desktop, celular, toque e teclado têm fluxos equivalentes;
- busca, filtros, contagens e colunas não exigem carregar a base inteira;
- erro de uma coluna não derruba todo o quadro;
- IA recomenda e explica, mas não move uma lead sem regra e autorização.

## Regra de release

Não há build diário, ZIP intermediário ou implantação automática. A regressão completa e o único build local continuam reservados ao fechamento de release, após os gates de operação real.

## Resultado entregue

### Fase 50 — contrato real de leads

- leitura usa somente colunas existentes no banco ativo;
- 16.733 registros arquivados permanecem fora do Kanban operacional;
- aliases antigos de etapa são traduzidos para o funil canônico;
- paginação e ordenação permanecem no banco, não na memória do navegador.

### Fase 51 — escrita segura

- cadastro e atualização escrevem em `leads` sem RPC ausente;
- duplicidade de telefone e e-mail é verificada dentro da organização;
- eventos comerciais são registrados em `lead_events`;
- Lead 360 não depende de `opportunities`.

### Fase 52 — tenant e hierarquia

- perfis usam `name`, `role`, `team` e `availability_status` reais;
- papéis antigos são normalizados para diretor, superintendente, gerente e corretor;
- a hierarquia ausente é derivada de forma determinística sem ampliar o tenant;
- painéis de diretor, superintendente, gerente e corretor usam o contrato ativo.

### Fase 53 — tarefas e agenda

- `due_date` é traduzido para `due_at` somente na camada de compatibilidade;
- `user_id` é traduzido para `assigned_to` sem alterar o banco;
- agenda reúne tarefas e `next_contact` das leads;
- assistentes diário e semanal deixaram de consultar visitas e atividades ausentes.

### Fase 54 — projetos e materiais

- portfólio lê `crm_projects`, `inventory_units`, `knowledge_documents` e `marketing_campaigns`;
- VGV e estoque são calculados somente com unidades reais;
- oportunidades do projeto são derivadas das leads atuais;
- reserva e inteligência aparecem como não configuradas, sem inventar números.

### Fase 55 — movimentação protegida

- toda mudança valida a etapa anterior para detectar conflito entre sessões;
- `pipeline_history` é obrigatório;
- falha no histórico desfaz a mudança para preservar consistência;
- desfazer valida o movimento original e registra nova auditoria.

### Fase 56 — Kanban de decisão

- cartões compactos mostram projeto, origem, score, temperatura e valor potencial;
- próxima melhor ação ganhou destaque visual;
- detalhes secundários ficam recolhidos;
- ações de Lead 360, WhatsApp e Copilot ficam no mesmo contexto.

### Fase 57 — interação premium

- arrastar e soltar tem estado visual e confirmação persistida;
- seletor e botões anterior/próxima atendem toque e acessibilidade;
- `Alt + seta` permite movimentação por teclado;
- a última mudança pode ser desfeita sem ocultar conflito.

### Fase 58 — escala operacional

- o endpoint informa total operacional e quantidade carregada;
- a memória arquivada fica isolada do quadro;
- o limite atual cobre as 418 leads operacionais sem carregar as 16.733 históricas;
- caso a operação ultrapasse o limite carregado, o Kanban informa a cobertura e direciona para a busca completa;
- atualizações em tempo real continuam seletivas para leads e tarefas.

### Fase 59 — homologação corretiva

- TypeScript completo aprovado sem erro;
- contratos de gerente, corretor, SLA, produtividade e conversas foram ligados à base real;
- mensagens técnicas conhecidas deixaram de chegar às telas principais;
- build e ZIP continuam corretamente bloqueados até o gate de release.

## Limites honestos da base atual

- presença comercial é inferida de `availability_status`; não existe telemetria de `last_seen_at`;
- a base ainda não mede duração real de primeiro contato, portanto compliance de SLA permanece nulo;
- visitas, reservas e mensageria oficial não são apresentadas como ativas sem tabelas ou APIs homologadas;
- a hierarquia derivada deve ser persistida em uma futura migration revisada antes de múltiplas equipes paralelas entrarem em produção.
