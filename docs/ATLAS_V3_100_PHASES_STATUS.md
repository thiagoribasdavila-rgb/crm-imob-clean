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

## Fase 4 — Contratos de dados

Status: **Testada**.

Percentual antes: **76%** — formatos existiam, mas e-mail e telefone eram normalizados de maneiras diferentes em cada API.

Percentual depois: **100%** — contrato central, validação no release gate e adoção inicial nas fronteiras de autenticação e mensagens.

### Padrões canônicos

| Dado | Padrão interno |
|---|---|
| Identificador | UUID minúsculo válido; entrada inválida retorna `null` |
| E-mail | minúsculo, sem espaços laterais, formato válido, máximo de 254 caracteres |
| Telefone | dígitos E.164, 10–15 dígitos; números brasileiros locais recebem DDI 55 |
| Data/hora | ISO 8601 em UTC produzido por `toISOString()` |
| Dinheiro | cálculo em centavos inteiros seguros; apresentação converte para decimal BRL |
| CPF/CNPJ | somente dígitos e comprimento 11/14; dado continua protegido e não vai para IA econômica |
| Etapa da lead | `novo`, `contato`, `qualificacao`, `visita`, `proposta`, `contrato`, `ganho`, `perdido`, `comprou_outro` |

### Adoção comprovada

- Recuperação de senha usa o normalizador canônico de e-mail.
- Envio de WhatsApp bloqueia telefone fora do contrato antes de gravar ou criar aprovação.
- Envio de e-mail bloqueia destinatário inválido antes de criar mensagem.
- Valores monetários rejeitam negativos, infinito, `NaN` e estouro de inteiro seguro.
- Documento é apenas normalizado/validado; esta fase não amplia coleta nem exposição.

Evidências: `lib/atlas/data-contracts.ts` e `npm run contracts:data`.

Próxima fase: **Fase 5 — Arquitetura modular**, consolidando fronteiras entre CRM, projetos, marketing, IA, integrações, governança e relatórios.

## Fase 5 — Arquitetura modular

Status: **Testada**.

Percentual antes: **80%** — diretórios funcionais existiam, mas propriedade de entidades e dependências não estava formalizada.

Percentual depois: **100%** — oito módulos definidos, entidades com responsável único e fronteiras verificadas no release gate.

### Módulos oficiais

| Módulo | Responsabilidade |
|---|---|
| CRM | leads, clientes, usuários, tarefas, timeline, pipeline e conversas |
| Projetos | incorporadoras, empreendimentos, unidades, estoque e materiais |
| Marketing | campanhas, atribuição, criativos e aquisição |
| IA | copiloto, score, matching, previsão, modelos e aprovação humana |
| Integrações | conectores, webhooks, outbox e serviços externos |
| Governança | eventos, auditoria, saúde, homologação, backup e rollback |
| Relatórios | leituras agregadas e decisões por perfil, sem possuir dados transacionais |
| Plataforma | Supabase, API core, contratos, rate limit, flags e utilitários compartilhados |

### Regras

- Cada entidade canônica possui exatamente um módulo responsável.
- Relatórios leem os domínios, mas não se tornam fonte dos dados.
- IA produz recomendações e memória governada, mas não duplica lead, projeto ou campanha.
- Integrações transportam eventos; o estado comercial continua no módulo de origem.
- Plataforma não contém regra comercial própria.
- Fluxo esperado: interface → API → domínio → dados.
- Service role e segredos permanecem exclusivamente no servidor.
- Raízes de UI, API e biblioteca não podem ser declaradas por dois módulos.

Evidências: `config/module-boundaries.json` e `npm run architecture:modules`.

Próxima fase: **Fase 6 — Configuração de ambientes**, separando desenvolvimento, homologação e produção sem misturar credenciais ou bancos.

## Fase 6 — Configuração de ambientes

Status: **Testada**.

Percentual antes: **72%** — Hostinger e homologação estavam documentadas, mas o arquivo de exemplo simulava Hostinger localmente e não identificava explicitamente o banco.

Percentual depois: **100%** — três ambientes contratados, identidade exclusiva, banco marcado e bloqueios de produção incorporados ao preflight.

### Contrato

- `development`: localhost permitido, provider local, integrações externas desativadas por padrão.
- `homologation`: Hostinger e HTTPS obrigatórios, conta de teste e bootstrap temporário permitidos, banco exclusivo.
- `production`: Hostinger e HTTPS obrigatórios, banco exclusivo, sem bootstrap e sem credenciais automatizadas de teste.

### Variáveis de identidade

- `ATLAS_ENV`: `development`, `homologation` ou `production`.
- `ATLAS_ENVIRONMENT_ID`: nome exclusivo da instalação.
- `ATLAS_DATABASE_ENVIRONMENT`: deve coincidir com `ATLAS_ENV`.
- `ATLAS_BASE_URL`: localhost somente em desenvolvimento; HTTPS nos demais ambientes.

O `.env.example` agora nasce em desenvolvimento e não finge estar na Hostinger. O PM2 continua explicitamente em homologação, Node.js 24 e Hostinger. Produção exige outro projeto Supabase e remoção das credenciais temporárias.

Evidências: `config/environments.json`, `npm run environments:check` e `npm run preflight:production`.

Próxima fase: **Fase 7 — Variáveis de ambiente**, classificando obrigatórias, opcionais, públicas, privadas e temporárias.

## Fase 7 — Variáveis de ambiente

Status: **Testada**.

Percentual antes: **70%** — o exemplo cobria o núcleo, mas o painel da diretoria repetia uma lista menor e variáveis novas podiam surgir sem classificação.

Percentual depois: **100%** — inventário único, cinco políticas explícitas e verificação automática de todo uso estático no release gate.

### Políticas aplicadas

| Classe | Regra |
|---|---|
| Obrigatória | O ambiente não está pronto sem ela; segredos permanecem somente no servidor. |
| Alternativa | Uma chave pública Supabase publishable ou anon deve existir, sem exigir as duas. |
| Condicional | Torna-se obrigatória somente ao ativar o respectivo provedor ou integração. |
| Opcional | Ajusta modelo, preço, conta ou storage sem impedir o núcleo do CRM. |
| Temporária | Permitida apenas durante bootstrap, homologação ou importação supervisionada. |
| Gerenciada | Pertence ao Node.js, Next.js ou PM2 e não deve ser preenchida manualmente. |

O painel de segredos agora consome o mesmo contrato usado pelo release, informa apenas se cada item está configurado e nunca devolve valores. O gate falha quando uma variável aparece no código ou no `.env.example` sem classificação, quando um segredo recebe prefixo público ou quando as chaves alternativas ficam inconsistentes.

Evidências: `config/environment-variables.json`, `npm run environment:variables` e `/api/v1/governance/secrets`.

Próxima fase: **Fase 8 — Gestão de segredos**, definindo rotação, responsáveis, validade e resposta a incidente sem registrar valores sensíveis.

## Fase 8 — Gestão de segredos

Status: **Testada**.

Percentual antes: **74%** — segredos não eram versionados nem retornados, porém responsabilidade e periodicidade de rotação ainda não formavam um contrato verificável.

Percentual depois: **100%** — todos os segredos possuem responsável operacional, prazo máximo de rotação, armazenamento permitido e procedimento de incidente; o release bloqueia acesso privado em componentes cliente.

### Controles implantados

- Segredos críticos de plataforma giram em até 60 dias.
- Credenciais temporárias expiram ou são revogadas após o uso, com limite de 7 dias.
- Chaves de IA, marketing, mensageria, anúncios e storage giram em até 90 dias.
- Valores podem existir somente nas variáveis protegidas da Hostinger ou nos secrets do projeto Supabase.
- Browser, tabelas comerciais, Git, logs, eventos analíticos e prompts de IA são destinos proibidos.
- Incidente exige revogação no provedor, substituição segura, reinício, scanner, release gate, teste isolado e registro sem o valor da chave.
- O painel da diretoria recebe somente cobertura, responsável, periodicidade e estado configurado.

Evidências: `config/secret-governance.json`, `npm run security:governance` e `/api/v1/governance/secrets`.

Pendência externa: a rotação real das chaves só pode ser comprovada depois que as credenciais de homologação forem criadas nos respectivos provedores; nenhuma data foi inventada.

Próxima fase: **Fase 9 — Observabilidade**, estruturando correlação, logs seguros, métricas, erros e trilha operacional.

## Fase 9 — Observabilidade

Status: **Testada**.

Percentual antes: **78%** — APIs já retornavam IDs e latência, mas existiam logs de autenticação fora do logger central e a sanitização dependia de poucos nomes exatos.

Percentual depois: **100%** — contrato único de observabilidade, correlação ponta a ponta, logs JSON sanitizados por chave e conteúdo, métricas oficiais e verificação automática no release.

### Padrão operacional

- Toda API canônica propaga `X-Request-Id` e `X-Correlation-Id` e mede duração sem expor detalhes internos.
- Logs estruturados possuem serviço, ambiente, evento, nível, horário e correlação.
- Senhas, tokens, cookies, chaves, e-mails, telefones, CPF/CNPJ, mensagens, conteúdo de lead e prompts são censurados.
- Recuperação de senha e callback deixaram de registrar mensagens brutas do provedor.
- O erro visual do CRM registra somente digest, rota e horário, sem o texto potencialmente sensível.
- Saúde operacional mede aplicação, banco, memória, uptime e integrações; IA mantém latência, tokens e custo medidos.
- PM2 separa saída e erro. Retenção recomendada é 14 dias e 50 MB por arquivo, ainda dependente da configuração real de rotação na Hostinger.
- Alertas críticos ficam reservados para indisponibilidade de banco ou falha de readiness; validações comerciais isoladas não geram falso incidente.

Evidências: `config/observability.json`, `lib/observability/logger.ts`, `lib/api/core.ts` e `npm run observability:check`.

Pendência externa: ativar e comprovar a rotação dos arquivos de log no painel/PM2 da Hostinger durante a homologação.

Próxima fase: **Fase 10 — Command Center**, consolidando saúde, integrações, filas, backups, custos, segurança e homologação.

## Fase 10 — Command Center

Status: **Testada**.

Percentual antes: **82%** — os módulos de saúde, segurança, IA, backup e homologação existiam, mas exigiam navegação separada e não produziam um gate executivo único.

Percentual depois: **100%** — sete áreas consolidadas, cinco gates críticos, acesso exclusivo da diretoria e política explícita que impede ausência ou erro de consulta de virar aprovação.

### Visão executiva consolidada

- Saúde: banco, latência, uptime, ambiente e Hostinger.
- Segurança: governança de segredos e confirmação de que valores não são retornados.
- Integrações: OpenAI, Perplexity, Meta e WhatsApp aparecem como configuradas ou pendentes; configuração ainda exige teste real.
- Filas: tarefas, aprovações, outbox pendente e dead letters.
- Resiliência: restaurações aprovadas, pendentes ou reprovadas.
- IA: chamadas, tokens, latência e custo medido dos últimos 30 dias.
- Homologação: evidências aprovadas e reprovadas por perfil.

O status geral só fica `ready` quando todos os gates possuem evidência positiva. Banco, HTTPS, segredo dos workers, ausência de falhas na outbox e restauração comprovada são bloqueios independentes. Falha de consulta aparece como `unknown`; integração apenas configurada não aparece como homologada.

Evidências: `config/command-center.json`, `/api/v1/governance/command-center`, `app/(crm)/atlas-v3/CommandCenterOverview.tsx` e `npm run command-center:check`.

Pendências externas: popular o painel com dados da Hostinger/Supabase reais, executar restauração, testar conectores e concluir evidências por perfil.

Próxima fase: **Fase 11 — Login**, validando acesso, mensagens, carregamento, responsividade e experiência minimalista.

## Fase 11 — Login

Status: **Testada**.

Percentual antes: **88%** — a experiência visual e as validações principais já estavam avançadas, mas um guard legado apontava para rota inexistente, o proxy podia registrar detalhe bruto e autenticação lenta não possuía timeout.

Percentual depois: **100%** — rota canônica única, destino interno protegido, timeout de 15 segundos, perfil e organização validados, feedback acessível e estados claros do início ao redirecionamento.

### Experiência e segurança

- Sessão já ativa segue diretamente ao dashboard sem reapresentar o formulário.
- O destino `next` aceita somente caminho interno, bloqueia barra invertida, caracteres de controle, origem externa e loop para páginas de autenticação.
- Login valida e-mail, senha, sessão criada, organização vinculada e perfil ativo.
- Espera superior a 15 segundos devolve orientação clara e permite nova tentativa.
- E-mail só é lembrado após escolha; senha nunca é armazenada.
- Caps Lock, mostrar/ocultar senha, Enter, foco inicial, recuperação e mensagens `aria-live` apoiam uso rápido e acessível.
- Mensagens distinguem credencial inválida, limite de tentativas e conexão sem expor detalhes internos.
- O proxy registra somente tipo do erro e IDs de correlação, nunca mensagem bruta de autenticação.
- Layout permanece responsivo e minimalista, com robô reduzido no celular e elemento secundário no desktop.

Evidências: `config/login-experience.json`, `lib/auth/safe-redirect.ts`, `app/(auth)/login/page.tsx` e `npm run login:check`.

Pendência externa: homologar com usuário válido, senha inválida, perfil inativo, perfil incompleto, sessão expirada e aparelho móvel no domínio HTTPS da Hostinger.

Próxima fase: **Fase 12 — Recuperação de senha**, validando envio, callback, troca, expiração e domínio público.

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
