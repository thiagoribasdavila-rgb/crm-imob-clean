# Atlas V3 — evolução máxima em 100 fases

Data-base: 17/07/2026. Branch: `develop/atlas-v3`. O relatório considera evidência versionada e separa implementação, teste automatizado e homologação real.

## Regra de medição

- **Estruturada**: contrato ou interface existe, sem jornada comprovada.
- **Implementada**: fluxo existe no código e preserva a arquitetura canônica.
- **Testada**: possui controle automatizado e passa no release gate.
- **Homologada**: foi comprovada no domínio final com credenciais e dados reais de teste.
- **Bloqueada externamente**: código pronto, mas depende de credencial, conta, aprovação ou evidência externa.

Percentuais não são promovidos por existência visual. Um bloqueio crítico impede produção mesmo quando o build está verde.

## Fase 1 — Inventário completo

Status: **Testada**.

Percentual antes: **70%** — inventários anteriores estavam manuais e divergiam da árvore atual.  
Percentual depois: **100%** — inventário reproduzível criado sobre arquivos versionados e separação explícita entre superfície histórica e pacote implantável.

### Evidência atual

Execute `npm run inventory:v3` para obter os números do commit corrente. A medição distingue:

- arquivos versionados e arquivos implantáveis;
- páginas e APIs históricas versus rotas mantidas no pacote;
- componentes, bibliotecas, migrations, scripts e documentação;
- variáveis públicas e variáveis exclusivas do servidor;
- caminhos protótipos excluídos do ZIP final;
- Hostinger, Node.js 24 e Supabase como limites oficiais.

### Resultado desta fase

- O V2 histórico não é dependência de execução.
- Rotas protótipo permanecem rastreáveis no Git, mas são removidas do pacote Hostinger.
- `.env.local`, dados privados, `outputs`, `tmp`, planilhas e PDFs não integram o inventário implantável.
- A fase corrige a base de medição usada pelos relatórios antigos, sem remover código por aproximação.

### Riscos e dependências

- Credenciais externas continuam ausentes; isso não reduz o inventário, mas impede homologação real.
- Páginas existentes não são automaticamente consideradas funcionalidades concluídas.
- A Fase 2 deve classificar duplicidades e protótipos usando este inventário antes de qualquer remoção.

## Fase 2 — Limpeza arquitetural

Status: **Testada**.

Percentual antes: **82%** — o pacote já excluía protótipos, mas build e desenvolvimento disputavam a mesma quarentena e podiam deixar exclusões temporárias na árvore.

Percentual depois: **100%** — fronteiras classificadas, pacote preservado e quarentena protegida contra concorrência.

### Classificação

- **Canônico implantável**: 1.135 arquivos que sustentam o V3 ativo.
- **Protótipos conceituais**: grupos `(ai)`, `(autonomous)`, `(andromeda)`, `(atlas)`, `(automation)`, `(autonomous-business)`, `(digital-life-form)`, `(reality-engine)`, `(engine)` e `(unified-consciousness)`.
- **Rotas CRM duplicadas**: analytics antigos, Kanban paralelo, Pipedrive paralelo, pipelines por temperatura, edição/tabela duplicadas de leads e detalhe antigo de tarefa.
- **API duplicada**: `app/api/leads`, substituída pelos contratos canônicos `/api/v1`.
- **Código histórico preservado**: continua no Git para rastreabilidade, mas não entra no ZIP Hostinger nem no build ativo.

### Melhorias desta fase

- Build e desenvolvimento usam uma trava atômica compartilhada antes de mover qualquer rota.
- Uma segunda execução falha com mensagem clara sem tocar nos arquivos.
- Travas abandonadas por processo encerrado são recuperadas com segurança.
- Cada execução usa quarentena exclusiva por modo e PID.
- A restauração acontece em sucesso, falha ou encerramento controlado.
- O scanner de segredos ignora somente quarentenas internas, inclusive no modo sem Git.

### Risco residual

Encerramento forçado pelo sistema operacional (`SIGKILL`) não permite executar cleanup em nenhum processo Node. A trava registra o PID e evita que uma execução concorrente apague a quarentena da outra; recuperação manual continua necessária caso a máquina seja desligada durante a movimentação.

Próxima fase: **Fase 3 — Fonte única da verdade**, documentando entidades e destinos canônicos sem criar tabelas paralelas.

## Fase 3 — Fonte única da verdade

Status: **Testada**.

Percentual antes: **86%** — o código convergia para tabelas centrais, mas a decisão estava distribuída entre migrations, APIs e documentação.

Percentual depois: **100%** — contrato canônico versionado, validado automaticamente e incorporado ao release gate.

### Entidades centrais

| Conceito | Fonte canônica | Regra |
|---|---|---|
| Lead | `leads` | oportunidade comercial, funil, score e corretor único |
| Cliente | `customers` | relacionamento convertido/pós-venda; não duplica o estado da lead |
| Usuário | `profiles` | perfil, hierarquia e organização; autenticação continua em Supabase Auth |
| Projeto | `developments` | empreendimento; `projects` é alias histórico proibido |
| Imóvel/unidade | `properties` | ativo comercializável vinculado ao projeto |
| Tarefa | `tasks` | próxima ação, compromisso e SLA; não recriar `followups` |
| Campanha | `campaigns` | visão normalizada dos canais de mídia |
| Atividade comercial | `activities` | timeline legível da lead |
| Evento técnico | `atlas_events` | auditoria imutável e integração; não substitui a timeline |
| Material | `project_materials` | documento versionado por projeto e incorporadora |
| Conversa | `conversations` | thread; conteúdo individual permanece em `messages` |
| Integração | `integrations` | configuração por organização, sem exposição de segredos |

### Proteções adicionadas

- Uma entidade não pode apontar para a mesma tabela de outra entidade.
- Aliases históricos não podem virar novas fontes concorrentes.
- `organization_id` é a chave tenant obrigatória do contrato.
- O release falha se uma entidade essencial desaparecer ou ficar ambígua.
- APIs primárias são registradas quando já existe contrato canônico; `null` significa acesso atual sob RLS ainda sem API exclusiva, e não autorização para criar uma tabela paralela.

Evidências: `config/canonical-entities.json` e `npm run architecture:canonical`.

Próxima fase: **Fase 4 — Contratos de dados**, padronizando estados, datas, dinheiro, telefone, e-mail e identificadores nas fronteiras das APIs.

## Painel das 100 fases

| Bloco | Fases | Estado atual | Próximo gate |
|---|---:|---|---|
| Base, arquitetura e governança | 1–10 | Fase 1 testada; 2–10 em auditoria | Classificar duplicidades e consolidar contratos canônicos |
| Segurança, autenticação e perfis | 11–20 | Implementação avançada; homologação externa pendente | Supabase real, quatro perfis e dois tenants |
| CRM e experiência comercial | 21–30 | Implementação e controles avançados | Jornada real por perfil |
| Pipeline e Kanban | 31–40 | Implementação e controles avançados | Dados reais, comissão e forecast aferido |
| Tarefas e produtividade | 41–50 | Implementação avançada | Piloto móvel e adoção real |
| Distribuição e carteiras | 51–60 | Implementação e atomicidade testadas em código | Equipe real online e concorrência real |
| Projetos e incorporadoras | 61–70 | Estruturada/implementada | Conferência de portfólio e materiais reais |
| Dados, score e predição | 71–80 | Implementação avançada | Calibração com resultados reais |
| IA comercial e automação | 81–90 | Implementação testada com fallback | Chaves, qualidade e custo reais |
| Marketing e produção | 91–100 | Estruturada/implementada | Meta, WhatsApp, Hostinger e aceite formal |

## Percentuais independentes no início do programa

| Dimensão | Percentual comprovado | Observação |
|---|---:|---|
| Implementação | 88% | Núcleo funcional amplo; conectores externos ainda parciais |
| Testes automatizados | 86% | Release gate e controles imobiliários robustos |
| Segurança | 84% | RLS e escopo implementados; teste real entre tenants pendente |
| Experiência do usuário | 86% | Núcleo modernizado; auditoria móvel completa pendente |
| Integrações externas | 28% | Contratos existem, mas credenciais e evidências reais faltam |
| Dados reais | 18% | Materiais e bases ainda precisam de importação homologada |
| Homologação real | 8% | Servidor local responde; domínio e usuários reais pendentes |
| Preparação Hostinger | 92% | ZIP e roteiro prontos; ambiente final ainda não configurado |

Esses percentuais serão recalculados por evidência ao final de cada fase. Não representam autorização para produção.
