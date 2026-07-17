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

## Fase 12 — Recuperação de senha

Status: **Testada**.

Percentual antes: **84%** — envio e callback existiam, mas a tela de troca aceitava qualquer sessão autenticada e atualizava a senha diretamente no navegador.

Percentual depois: **100%** — intenção de recuperação `HttpOnly` com 15 minutos, validação de usuário no servidor, senha forte, uso único e revogação global das sessões após sucesso.

### Fluxo protegido

- A solicitação sempre responde de forma neutra e não revela se o e-mail está cadastrado.
- Há limite de cinco solicitações e cinco tentativas de troca por janela de 15 minutos.
- O domínio canônico prioriza `ATLAS_BASE_URL`; produção exige HTTPS.
- Callback aceita PKCE ou OTP suportado, recusa token inválido e cria uma intenção `HttpOnly`, `SameSite=Strict`, segura em produção e válida por 15 minutos.
- A tela apenas consulta e envia para a API do servidor; uma sessão comum não autoriza redefinição.
- A senha exige 12 a 128 caracteres e ao menos três categorias entre maiúsculas, minúsculas, números e símbolos.
- O indicador de força é acessível e a confirmação precisa coincidir.
- Após sucesso, a intenção é apagada e todas as sessões do usuário são revogadas, exigindo novo login.
- Link expirado, usado ou incompleto retorna à solicitação de um novo e-mail.

Evidências: `config/password-recovery.json`, `/api/auth/password-reset`, `/auth/callback`, `app/(auth)/reset-password/page.tsx` e `npm run password-recovery:check`.

Pendência externa: comprovar entrega real, link mais recente, expiração, reuso, domínio Hostinger e revogação em outro dispositivo usando uma conta exclusiva de homologação.

Próxima fase: **Fase 13 — Sessões**, testando renovação, logout, expiração, múltiplos dispositivos e revogação.

## Fase 13 — Sessões

Status: **Testada**.

Percentual antes: **80%** — cookies eram renovados pelo middleware e a interface reagia ao logout, mas “Sair” usava escopo implícito e não existia gestão clara de outros dispositivos.

Percentual depois: **100%** — renovação e validação contratadas, três escopos explícitos de revogação, painel no perfil, limite de ações e política sem exposição de tokens ou fingerprint de aparelho.

### Controles de sessão

- Middleware valida claims e renova cookies do Supabase durante a navegação.
- Guard da interface reage à expiração e retorna ao login.
- “Sair” no topo encerra somente o dispositivo atual (`local`).
- O perfil oferece “encerrar outros dispositivos” (`others`) mantendo o atual.
- “Encerrar todos” usa revogação global e exige novo login também no aparelho atual.
- Ações destrutivas exigem confirmação e têm limite de dez por 15 minutos.
- A API valida o usuário no servidor e informa expiração aproximada sem devolver access token ou refresh token.
- O Atlas não cria fingerprint, localização ou nomes fictícios de aparelhos.
- Como o provedor não entrega uma lista confiável neste fluxo, a interface declara a limitação em vez de inventar quantidade de dispositivos.

Evidências: `config/session-management.json`, `/api/auth/sessions`, `app/(crm)/settings/profile/SessionSecurityPanel.tsx` e `npm run sessions:check`.

Pendência externa: comprovar renovação, expiração natural e os três escopos usando dois navegadores/dispositivos reais na Hostinger.

### Fase 14 — Primeiro administrador

Percentual anterior: **72%**. Percentual após implementação e testes locais: **100%**. Estado: **Testada**.

- A ativação existe somente em desenvolvimento e homologação; produção responde como recurso indisponível mesmo que um segredo seja deixado por engano.
- O segredo temporário exige no mínimo 32 caracteres e usa comparação em tempo constante.
- O bootstrap trava quando encontra o primeiro perfil e rejeita uma segunda ativação ou uma execução concorrente no mesmo processo.
- A execução por terminal exige confirmação explícita `CREATE_FIRST_ADMIN` e política forte de senha.
- Se a criação do perfil falhar, o usuário recém-criado no Supabase Auth é removido para evitar conta órfã.
- O diagnóstico passou a ser estritamente somente leitura: não cria nem remove usuários ou perfis.
- Respostas não podem ser armazenadas em cache e logs de sucesso preservam apenas domínio do e-mail e identificadores auditáveis.
- O encerramento exige validar o primeiro login, remover `ATLAS_BOOTSTRAP_SECRET`, reiniciar a aplicação e comprovar que a rota ficou indisponível.

Evidências: `config/admin-bootstrap.json`, `/api/bootstrap/admin`, `scripts/bootstrap-admin.mjs`, `scripts/diagnose-bootstrap.mjs` e `npm run admin-bootstrap:check`.

Pendência externa: executar uma única ativação no Supabase exclusivo de homologação, validar o login e registrar a remoção do segredo na Hostinger. Nenhum usuário real foi criado pelos testes locais.

Próxima fase: **Fase 15 — Perfis e hierarquia**, validando diretor, superintendente, gerente e corretor de ponta a ponta.

### Fase 15 — Perfis e hierarquia

Percentual anterior: **76%**. Percentual após implementação e testes locais: **100%**. Estado: **Testada**.

- A gestão de equipe deixou de ser uma tela vazia e passou a mostrar a estrutura real visível ao usuário.
- O diretor enxerga a organização; o superintendente, seus descendentes; o gerente, seus corretores diretos; e o corretor permanece restrito a si e às próprias leads.
- Convites são enviados pelo Supabase Auth no servidor, exigem confirmação de e-mail e nunca expõem a credencial administrativa no navegador.
- A cadeia obrigatória é diretor → superintendente → gerente → corretor.
- O banco rejeita superior inativo, vínculo com outra empresa, autorreferência e combinação inválida de funções.
- Campos de autorização (`organization_id`, função, superior e estado) não podem ser alterados pelo próprio usuário; dados profissionais continuam editáveis.
- Alterações passam por função exclusiva da `service_role` e geram histórico de auditoria protegido por RLS.
- A interface explica o escopo, mostra totais por nível, permite convite governado e ativação/desativação conforme autoridade.
- Papéis não são autorizados por `user_metadata`, que é editável pelo usuário; a fonte canônica permanece a tabela `profiles` sob RLS.

Evidências: `config/commercial-hierarchy.json`, `/api/v1/team`, `/settings/team`, migration `secure_commercial_profile_hierarchy` e `npm run commercial-hierarchy:check`.

Pendência externa: aplicar a migration no Supabase de homologação e testar com quatro contas reais e uma segunda organização, comprovando visibilidade, convite, desativação e bloqueio lateral. Nenhum convite foi enviado pelos testes locais.

Próxima fase: **Fase 16 — Hierarquia**, aplicando os quatro níveis em todas as camadas.

### Fase 16 — Hierarquia

Percentual anterior: **81%**. Percentual após implementação e testes locais: **100%**. Estado: **Testada**.

- O papel efetivo passou a ser resolvido centralmente: `commercial_role` prevalece e o papel legado serve apenas como compatibilidade controlada.
- Autorizações declarativas das APIs agora comparam o papel comercial efetivo, evitando que superintendente e gerente sejam confundidos pelo legado `manager`.
- Frontend mantém menus distintos para diretor, superintendente, gerente e corretor; ocultar um item nunca substitui a autorização da API e do banco.
- Banco preserva isolamento por organização, descendência comercial, carteira e campos de autorização protegidos.
- A exportação de leads deixou de ser uma tela fictícia e passou a gerar CSV real sob a mesma RLS do CRM.
- Diretor exporta a organização; superintendente, estruturas subordinadas; gerente, o time; corretor, somente a própria carteira.
- CSV exclui telefone, e-mail e documentos, neutraliza fórmulas, limita dez mil linhas, não usa cache e registra escopo e volume em log seguro.
- Relatórios financeiros continuam exclusivos da diretoria e as decisões de campanha permanecem humanas e exclusivas do diretor.
- Reprocessamento de integrações e publicação de produtos de dados deixaram de aceitar o papel legado genérico de gerente.
- O motor de decisões bloqueia explicitamente otimização de campanha para superintendente e gerente.

Evidências: `config/hierarchy-enforcement.json`, `lib/api/security.ts`, `/api/v1/crm/leads/export`, `/leads/export` e `npm run hierarchy-enforcement:check`.

Pendência externa: após aplicar as migrations em homologação, executar a matriz com quatro contas e duas organizações nas seis camadas, comparar contagens e tentar acessos laterais manuais. Nenhum dado foi exportado pelos testes locais.

## Fase 17 — RLS

**Estado:** 100% implementada e aprovada localmente; aplicação e teste multiusuário no Supabase de homologação pendentes.

**Evolução desta fase:** antes, tarefas, campanhas e insights de IA ainda herdavam políticas genéricas por organização e filas internas mantinham privilégios desnecessários. Agora, as sete superfícies críticas declaram RLS explicitamente; tarefas seguem a lead ou o responsável dentro da cadeia comercial; campanhas têm leitura organizacional e escrita de liderança; insights são somente leitura no cliente; e quatro tabelas internas ficaram restritas ao backend.

**Proteções adicionadas:** contrato automático em `config/rls-audit.json`, gate `npm run rls:check`, helper privilegiado mínimo em schema privado, revogação de acesso direto às filas e índices para organização, hierarquia, carteira e lead vinculada. A matriz e o roteiro de homologação estão em `docs/RLS_AUDIT_PHASE_17.md`.

**Validação local:** o gate verifica RLS nas superfícies críticas, evidência de política por dimensão, revogações de tabelas internas e ausência de `auth.role()` obsoleto. A migration foi criada pelo CLI oficial do Supabase e não foi aplicada remotamente nesta fase.

Pendência externa: aplicar a migration em homologação e testar diretor, superintendente, gerente, corretores de equipes distintas e usuário de outra organização; em seguida executar os advisors de segurança e desempenho.

## Fase 18 — APIs protegidas

**Estado:** 100% implementada e aprovada localmente; testes negativos no ambiente de homologação pendentes.

**Evolução desta fase:** as 77 rotas foram classificadas em APIs autenticadas, públicas mínimas, fluxos de autenticação, webhooks assinados e workers protegidos por segredo. A rota legada `/api/leads`, que mantinha uma lista em memória e aceitava acesso anônimo, foi eliminada como implementação paralela e passou a reutilizar o endpoint canônico protegido.

**Proteções adicionadas:** o autenticador legado agora valida token, perfil ativo, organização ativa e escopo RLS; concessões e bloqueios geram auditoria estruturada sem credenciais; o status operacional V1/V2 deixou de revelar prontidão sem segredo; mutações declaram validação de entrada ou ausência intencional de corpo; webhooks comprovam assinatura e limite; workers comprovam `ATLAS_CRON_SECRET`.

**Validação local:** `npm run api-security:check` inventaria todas as rotas e bloqueia uma nova API sem classe ou proteção. O contrato auditável está em `config/api-security-contract.json` e o roteiro completo em `docs/API_SECURITY_PHASE_18.md`.

Pendência externa: em homologação, comprovar 401 sem sessão, 403 fora da função/carteira, 400 para entrada inválida, 429 após limite e isolamento entre duas organizações; conferir os registros por correlação sem tokens ou dados pessoais.

## Fase 19 — Proteção contra abuso

**Estado:** 100% implementada e aprovada localmente; aplicação da migration e ensaio concorrente em homologação pendentes.

**Evolução desta fase:** os controles críticos deixaram de depender somente da memória de um processo Node. Meta, WhatsApp e envio externo agora compartilham cotas atômicas no Postgres, mantendo a proteção após reinício e entre múltiplas instâncias da Hostinger. O contador falha de forma segura com 503 quando a proteção persistente não pode ser confirmada.

**Idempotência e deduplicação:** envio externo exige `Idempotency-Key`, associa a chave ao hash da requisição e reproduz a resposta anterior sem executar novamente; chaves simultâneas ou reutilizadas com outro conteúdo são bloqueadas. Mensagens recebidas pelo WhatsApp ganham unicidade por organização, canal e identificador externo, enquanto o Meta mantém a deduplicação de `leadgen_id`. Ambos validam HMAC sobre o corpo bruto.

**Governança:** tabela de cotas sem acesso de `anon`/`authenticated`, funções privilegiadas com `search_path` vazio e execução exclusiva do `service_role`, expiração de chaves e limpeza incremental de buckets. O contrato está em `config/abuse-protection.json`, o gate em `npm run abuse-protection:check` e o roteiro em `docs/ABUSE_PROTECTION_PHASE_19.md`.

Pendência externa: verificar duplicidades antigas de IDs do WhatsApp, aplicar a migration em homologação e testar duas instâncias concorrentes, replay, conflito de chave, assinatura inválida e tempestade controlada de eventos.

## Fase 20 — Auditoria de segurança

**Estado:** 100% auditada e aprovada no ambiente local; pentest controlado, advisors do Supabase e testes multiempresa permanecem como gates externos de homologação.

**Resultado:** segredos, dependências, permissões, uploads, logs e dados pessoais foram consolidados em um único contrato. O inventário de produção encontrou zero vulnerabilidades conhecidas; o upload valida tamanho, MIME, assinatura binária, nome, caminho aleatório e remoção de órfão; os logs mantêm correlação e redação de credenciais/PII; e toda autorização continua baseada em `profiles`/RLS.

**Correções:** `role` e `organization_id` foram removidos de `user_metadata` no bootstrap; falhas internas do armazenamento deixaram de ser expostas ao navegador; Content Security Policy foi adicionada; clientes Supabase foram fixados em versões exatas; e `npm audit --omit=dev --audit-level=high` passou a bloquear a validação quando houver vulnerabilidade alta ou crítica.

**Gate final do bloco:** `npm run security:audit` verifica 6 áreas, 9 gates, 6 cabeçalhos e 6 controles de upload. O relatório está em `docs/SECURITY_AUDIT_PHASE_20.md`. O ZIP não deve ser produzido se qualquer gate das fases 11–20 falhar.

Pendência externa: aplicar migrations 17–19 em homologação, executar Supabase Security/Performance Advisors, testar diretor/superintendente/gerente/corretores em duas organizações, validar uploads maliciosos e executar carga/replay controlados.

## Fase 21 — Dashboard do corretor

**Estado:** 100% implementada e aprovada localmente; validação com carteiras reais de dois corretores pendente em homologação.

**Evolução:** o corretor agora recebe uma visão diária exclusiva, curta e explicável, separada das visões gerenciais. O resumo apresenta carteira ativa, leads quentes, primeiro contato vencido, follow-ups, tarefas e agenda dos próximos sete dias. A fila “Comece por aqui” informa por que cada lead subiu e qual é a próxima melhor ação.

**Inteligência aplicada:** a prioridade combina score, SLA inicial, follow-up, tarefa atrasada, temperatura e ausência de próxima ação. O ranking não cria urgência inventada, não executa contato e não altera o CRM: a decisão final permanece com o corretor.

**Escopo:** endpoint exclusivo de `broker`, cliente autenticado com RLS, filtro explícito pelo `assigned_to` do próprio perfil, sem `service_role`, limite por rota e resposta sem cache compartilhado. O contrato está em `config/broker-dashboard.json`, o gate em `npm run broker-dashboard:check` e o roteiro em `docs/BROKER_DASHBOARD_PHASE_21.md`.

Pendência externa: testar dois corretores de equipes diferentes, confirmar isolamento, validar a ordenação com casos reais de SLA/follow-up/tarefa e medir se o corretor encontra sua primeira ação em menos de um minuto.

## Fase 22 — Dashboard do gerente

**Estado:** 100% implementada e aprovada localmente; validação com dois times paralelos e presença real pendente em homologação.

**Evolução:** o gerente agora recebe um cockpit específico do time direto com corretores online/disponíveis, carteiras ativas e quentes, SLA inicial, follow-ups, ausência de próxima ação, conversão, entradas nas últimas 24 horas e equilíbrio da distribuição. A fila do gerente transforma exceções em intervenções claras de coaching.

**Decisão responsável:** conversão só é exibida como comparável após vinte leads; antes disso aparece “Amostra baixa”. Carga desigual gera recomendação, não transferência automática, e o painel nunca rompe um atendimento ativo.

**Escopo:** endpoint exclusivo de `manager`, organização obrigatória, corretores limitados por `reports_to = managerId`, equipes paralelas excluídas e nenhuma mutação de dados. O contrato está em `config/manager-dashboard.json`, o gate em `npm run manager-dashboard:check` e o roteiro em `docs/MANAGER_DASHBOARD_PHASE_22.md`.

Pendência externa: testar dois gerentes com estruturas paralelas, validar presença online, totais, SLA e distribuição, e medir se as três principais intervenções são identificadas em menos de dois minutos.

## Fase 23 — Dashboard do superintendente

**Estado:** 100% implementada e aprovada localmente; validação com duas superintendências e dados reais pendente em homologação.

**Evolução:** o painel simples já existente foi transformado em cockpit diário da superintendência. Agora consolida gerentes diretos, presença das equipes, leads ativos e quentes, SLA inicial, follow-ups, ausência de próxima ação, entradas recentes, carga média por corretor e uma fila de apoio aos gerentes.

**Comparação responsável:** conversão só entra na comparação após trinta leads por equipe; abaixo disso aparece “Amostra baixa”. Desequilíbrio de carga e falhas de SLA geram recomendações de intervenção, nunca transferência, penalização ou mudança automática.

**Escopo:** endpoint exclusivo de `superintendent`, organização obrigatória, gerentes limitados por `reports_to = superintendentId`, corretores diretos de cada gerente, estruturas paralelas e leads sem responsável excluídos. O contrato está em `config/superintendent-dashboard.json`, o gate em `npm run superintendent-dashboard:check` e o roteiro em `docs/SUPERINTENDENT_DASHBOARD_PHASE_23.md`.

Pendência externa: testar duas superintendências paralelas, reconciliar totais, presença, SLA e carga com dados conhecidos, e medir se as três prioridades principais são identificadas em menos de dois minutos.

## Fase 24 — Dashboard do diretor

**Estado:** 100% implementada e aprovada localmente; reconciliação financeira e teste com dois tenants permanecem para homologação.

**Evolução:** o diretor recebeu um Command Center consolidando operação comercial, pipeline, forecast, vendas, comissões, campanhas, incorporadoras, estrutura de liderança, custo da IA e riscos prioritários. A tela separa acompanhamento, evidência e decisão.

**Verdade executiva:** forecast é explicitamente ponderado pela probabilidade registrada no CRM e não declara movimento sem snapshot anterior. Campanhas precisam de trinta leads e superintendências de cinquenta leads para comparação; abaixo disso aparece “Amostra baixa”. Telemetria de IA só aparece como medida quando a consulta real está disponível.

**Governança:** endpoint exclusivo de diretor/admin, todas as fontes filtradas por organização e nenhuma mutação. Orçamento, pessoas, campanhas e transferências nunca são alterados pelo painel. O contrato está em `config/director-dashboard.json`, o gate em `npm run director-dashboard:check` e o roteiro em `docs/DIRECTOR_DASHBOARD_PHASE_24.md`.

Pendência externa: reconciliar pipeline, receita e comissões com fonte financeira; validar custos de campanha; testar isolamento entre duas organizações e comprovar que as principais decisões são identificadas em menos de dois minutos.

## Fase 25 — Cadastro de lead

**Estado:** 100% implementada e aprovada localmente; concorrência real e aplicação da migration permanecem para homologação.

**Evolução:** o cadastro foi reduzido ao essencial: nome, telefone ou e-mail, origem e projeto. A qualificação adicional virou um bloco opcional, mantendo orçamento, objetivo, dormitórios, regiões e contexto disponíveis sem tornar a entrada lenta. A experiência ganhou erros por campo, limites visíveis e botão adequado para toque.

**Integridade:** telefone e e-mail são normalizados; telefone com histórico inválido é recusado; e a deduplicação agora acontece dentro de uma transação com trava por contato. Requisições simultâneas não devem gerar duas leads. Duplicidade lateral não revela carteira, responsável ou identificação da lead.

**Escopo:** a função atômica exige usuário autenticado, organização atual e atribuição ao próprio criador. O contrato está em `config/lead-registration.json`, o gate em `npm run lead-registration:check` e o roteiro em `docs/LEAD_REGISTRATION_PHASE_25.md`.

Pendência externa: aplicar a migration em homologação, testar contatos simultâneos, telefone suprimido, duplicidade visível/lateral e conclusão do cadastro em celular em menos de um minuto.

## Fase 26 — Lead 360

**Estado:** 100% implementada e aprovada localmente; conferência com conversas e carteiras reais permanece para homologação.

**Evolução:** a tela já avançada de inteligência ganhou um mapa 360 explícito, reunindo identidade, origem, campanha, memória histórica, responsável, projeto, incorporadora, score, prontidão, atividades, comunicações, tarefas, oportunidades e próxima ação. Cada bloco leva à fonte operacional correta.

**Fonte única:** o mapa não replica o cliente nem cria uma segunda base. Projeto, corretor, campanha, conversas e pipeline permanecem em seus registros canônicos e aparecem reconciliados na lead autorizada. Qualidade e lacunas continuam explicadas sem fusão silenciosa.

**Escopo:** `requireLeadAccess` antecede qualquer enriquecimento; organização e RLS protegem atividades, mensagens, conversas, tarefas, oportunidades, campanhas e memórias. O contrato está em `config/lead-360.json`, o gate em `npm run lead-360:check` e o roteiro em `docs/LEAD_360_PHASE_26.md`.

Pendência externa: testar lead própria e lateral, reconciliar projeto, responsável, campanha, mensagens e pipeline, e medir se o corretor encontra contexto e próxima ação em menos de um minuto.

Próxima fase: **Fase 27 — busca inteligente**, encontrando rapidamente leads por nome, telefone, e-mail, projeto, origem e contexto permitido.

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
