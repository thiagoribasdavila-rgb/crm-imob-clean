# Atlas AI CRM — Roadmap V1 a V3

Branch de desenvolvimento: `develop/atlas-v3`

## Regras de execução

- A branch `main` permanece estável e conectada à produção.
- Toda construção entra primeiro em `develop/atlas-v3`.
- Cada fase deve fechar com build, lint, revisão de segurança e teste das rotas principais.
- Migrações de banco devem ser versionadas e reversíveis.
- Recursos autônomos exigem logs, limites de ação e aprovação humana configurável.

## Fases

### 1. Fundação e saneamento
- Auditoria de rotas, componentes, dependências e conflitos.
- Padronização de TypeScript, Tailwind, aliases e variáveis de ambiente.
- Eliminação de clientes Supabase duplicados e arquivos com conflitos de merge.
- Pipeline de validação: lint, typecheck e build.

### 2. Design system e shell
- Layout responsivo.
- Sidebar, topbar, navegação móvel e estados de carregamento.
- Componentes reutilizáveis e acessíveis.

### 3. Autenticação e multiempresa
- Login, logout, recuperação e sessão.
- Organizações, usuários, corretores, funções e permissões.
- RLS no Supabase e isolamento por organização.

### 4. CRM operacional
- Leads, clientes, histórico, tarefas, agenda e atividades.
- CRUD completo, filtros, busca, importação e exportação.
- Funil configurável e Kanban.

### 5. Imóveis e estoque
- Empreendimentos, unidades, disponibilidade, preços e condições.
- Fotos, documentos, plantas e origem dos dados.
- Matching entre cliente e imóvel.

### 6. Atendimento e automação
- Follow-up, regras, gatilhos e filas.
- Integrações preparadas para WhatsApp, e-mail e calendário.
- Aprovação humana e handoff para corretor.

### 7. Marketing e Andromeda
- Campanhas, conjuntos, anúncios, criativos e públicos.
- Captação de leads, atribuição e orçamento.
- Conectores Meta com modo simulação antes de produção.

### 8. Analytics e gestão
- Dashboard executivo, comercial e marketing.
- CPL, CAC, conversão, VGV, ROI, velocidade do funil e forecast.
- Relatórios e exportações.

### 9. IA aplicada
- Lead score explicável.
- Resumos, recomendações, matching e próximas melhores ações.
- Memória de cliente e contexto organizacional com auditoria.

### 10. Portais
- Portal do gestor.
- Portal do corretor.
- Portal da incorporadora.
- Portal do cliente.

### 11. V2 — operação inteligente
- Copilotos especializados.
- Otimização de campanhas e distribuição de leads.
- Automação com políticas, limites e aprovação configurável.

### 12. V3 — Atlas Operating System
- Orquestração de agentes e workflows.
- Centro de decisões, simulações e recomendações executivas.
- Observabilidade, governança de IA, segurança e evolução modular.

## Status inicial

- [x] Repositório acessível com permissão administrativa.
- [x] Branch segura `develop/atlas-v3` criada a partir de `main`.
- [x] Vercel conectado à branch `main` e deploy de produção ativo.
- [ ] Auditoria automatizada consolidada.
- [ ] Banco de dados definitivo versionado.
- [ ] Fase 1 concluída.

## Critério de produção

Nenhuma fase será enviada para `main` sem:

1. build concluído;
2. lint e typecheck aprovados;
3. revisão das migrações;
4. validação das variáveis de ambiente;
5. confirmação de que não há segredos versionados;
6. plano de rollback.
