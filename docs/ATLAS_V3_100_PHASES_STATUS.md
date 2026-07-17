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

## Fase 27 — Busca inteligente

**Estado:** 100% implementada e aprovada localmente; aferição de relevância com carteiras reais permanece para homologação.

**Evolução:** a busca deixou de ser uma tela vazia e ganhou endpoint canônico compartilhado com a paleta global. Agora encontra leads por nome, telefone, e-mail, projeto, incorporadora, corretor, origem e intenção, explica o motivo do resultado e sugere a próxima ação.

**Relevância:** resultados são ordenados por correspondência exata, quantidade de campos encontrados, score e urgência de follow-up. Texto é normalizado, acentos são tolerados e telefone pode ser localizado por trecho a partir de quatro dígitos. Consultas possuem debounce, limite e cancelamento no navegador.

**Escopo:** todas as leituras usam o cliente autenticado, organização e RLS hierárquico. Resultados ocultos não aparecem nem alteram contagens. O contrato está em `config/smart-search.json`, o gate em `npm run smart-search:check` e o roteiro em `docs/SMART_SEARCH_PHASE_27.md`.

Pendência externa: testar termos reais, acentos, telefone, projeto, corretor e intenção com quatro perfis e duas organizações; medir precisão dos dez primeiros resultados e tempo até abrir a lead correta.

## Fase 28 — Filtros comerciais

**Estado:** 100% implementada e aprovada localmente; conferência de datas, origens e hierarquia com dados reais permanece para homologação.

**Evolução:** a carteira ganhou atalhos de um toque para atrasos, ausência de próxima ação, calor e falta de responsável, além de filtros por origem, projeto, responsável, status, score e agenda. Próximas ações podem ser separadas entre hoje, sete dias e todas as futuras.

**Precisão operacional:** projeto agora usa diretamente o vínculo canônico da lead e não depende da existência de campanha. A rota antiga de filtros foi consolidada na carteira principal, eliminando uma tela duplicada e incompleta. O copiloto recebe o contexto dos filtros ativos.

**Escopo:** filtros passam pelo contexto autenticado, organização, RLS e validação da hierarquia antes de consultar dados. O contrato está em `config/commercial-filters.json`, o gate em `npm run commercial-filters:check` e o roteiro em `docs/COMMERCIAL_FILTERS_PHASE_28.md`.

Pendência externa: conferir janelas de data no fuso oficial, origens reais, projeto sem campanha e isolamento com quatro perfis e duas organizações.

## Fase 29 — Timeline

**Estado:** 100% implementada e aprovada localmente; confronto com eventos reais dos provedores permanece para homologação.

**Evolução:** a tela antes vazia tornou-se um histórico cronológico único com mudanças do CRM, contatos, transferências, IA, propostas e integrações. Cada evento explica o que ocorreu, quando, por qual origem e sob responsabilidade de quem, com filtros rápidos por categoria.

**Fonte única:** a timeline não replica eventos. Ela normaliza para leitura `activities`, `messages`, transferências, eventos de campanha e simulações; registros de simulação já representados em atividades são deduplicados.

**Privacidade e escopo:** sessão, lead, organização e RLS hierárquico são verificados antes das consultas. Conteúdo de mensagens, payloads técnicos e identificadores externos não são expostos. O contrato está em `config/unified-timeline.json`, o gate em `npm run unified-timeline:check` e o roteiro em `docs/UNIFIED_TIMELINE_PHASE_29.md`.

Pendência externa: validar sequência real de WhatsApp, Meta, transferências e propostas com quatro perfis e dois tenants; testar paginação acima de 500 eventos.

## Fase 30 — Dados incompletos

**Estado:** 100% implementada e aprovada localmente; aferição de utilidade com corretores reais permanece para homologação.

**Evolução:** o Lead 360 detecta automaticamente lacunas e apresenta perguntas ordenadas pelo impacto comercial. Respostas estruturadas recalibram a qualificação, campos livres recebem foco direto e ações de projeto ou agenda abrem o destino correto.

**Eficiência:** o cálculo é local, determinístico e sem custo de LLM. A completude é ponderada pelo valor do dado: canal, intenção, prazo, pagamento e orçamento valem mais que itens complementares. Dados documentais e endereço exato não elevam score ou completude comercial.

**Escopo:** o diagnóstico só é devolvido após sessão, organização, acesso à lead e RLS hierárquico. O contrato está em `config/data-completeness.json`, o gate em `npm run data-completeness:check` e o roteiro em `docs/DATA_COMPLETENESS_PHASE_30.md`.

Pendência externa: testar perfis vazios, parciais e completos com quatro papéis e dois tenants; medir redução do tempo de qualificação e utilidade das perguntas.

## Fase 31 — Etapas canônicas

**Estado:** 100% implementada e aprovada localmente; aplicação da migration e reconciliação com dados reais permanecem para homologação.

**Evolução:** nove chaves canônicas agora orientam CRM, Kanban, forecast, análises, IA e integrações. Aliases históricos são normalizados sem criar novas colunas. O Kanban recebe a configuração da API em vez de manter uma lista concorrente.

**Personalização governada:** diretoria, administração e superintendência podem ajustar rótulo, probabilidade, ordem e visibilidade por organização. Chave e significado do resultado permanecem imutáveis; comprador externo continua separado de ganho e não infla receita.

**Medição:** cada etapa possui probabilidade explícita para forecast e posição estável para funil. O contrato está em `config/canonical-pipeline-stages.json`, o gate em `npm run canonical-stages:check` e o roteiro em `docs/CANONICAL_PIPELINE_STAGES_PHASE_31.md`.

Pendência externa: aplicar migration, editar as etapas em homologação, percorrer a jornada completa e testar isolamento com dois tenants.

## Fase 32 — Kanban moderno

**Estado:** 100% implementada e aprovada localmente; aferição em aparelhos e carteiras reais permanece para homologação.

**Evolução:** o Kanban ganhou navegação de uma etapa por vez no celular, cabeçalhos fixos, scroll com encaixe, foco acessível e movimentação por teclado. No desktop preserva a visão ampla, densidade compacta, ocultação de vazias, ordenação e atalhos operacionais.

**Produtividade:** cards levam diretamente a perfil, mensagem com IA, ligação e WhatsApp. A movimentação pode ocorrer por arrastar, seletor ou `Alt + seta`, com opção de desfazer e registro na timeline.

**Qualidade:** carregamento mantém skeletons e estado sem salto estrutural; a região do quadro declara ocupação e foco para tecnologia assistiva. O contrato está em `config/modern-kanban.json`, o gate em `npm run modern-kanban:check` e o roteiro em `docs/MODERN_KANBAN_PHASE_32.md`.

Pendência externa: testar celular físico, teclado, carteira volumosa, carregamento lento e percepção dos corretores.

## Fase 33 — Movimentação segura

**Estado:** 100% implementada e aprovada localmente; migration e concorrência real permanecem para homologação.

**Evolução:** status, registro causal, timeline e evento técnico agora são gravados na mesma transação. A lead é bloqueada durante a mudança e a etapa esperada evita que duas sessões sobrescrevam silenciosamente o trabalho uma da outra.

**Desfazer causal:** a reversão referencia o movimento original e só é aceita se ele continuar sendo o mais recente, a etapa atual corresponder e nenhuma reversão anterior existir. Tentativas antigas retornam conflito e pedem atualização do Kanban.

**Permissões:** organização, ator, hierarquia e responsável são validados dentro da transação, além do acesso prévio da API. O contrato está em `config/safe-pipeline-movement.json`, o gate em `npm run safe-movement:check` e o roteiro em `docs/SAFE_PIPELINE_MOVEMENT_PHASE_33.md`.

Pendência externa: aplicar migration e executar movimentos simultâneos, escopo lateral e reversões concorrentes no Supabase de homologação.

## Fase 34 — SLA de primeiro contato

**Estado:** 100% implementada e aprovada localmente; migration e aferição com contatos reais permanecem para homologação.

**Evolução:** toda lead passa a receber um prazo por origem: 5 minutos para canais Meta e 15 minutos para as demais fontes, com política isolada por organização. O histórico preserva horário, minutos de resposta e resultado do SLA.

**Precisão:** apenas ligações, e-mails, WhatsApp, visitas, reuniões, mensagens e contatos válidos encerram o relógio. Eventos internos e automações sem interação não geram falso cumprimento.

**Gestão:** o Kanban mostra tempo restante ou resultado concluído; a visão do gerente consolida taxa de cumprimento e tempo médio por corretor. O contrato está em `config/first-contact-sla.json`, o gate em `npm run first-contact-sla:check` e o roteiro em `docs/FIRST_CONTACT_SLA_PHASE_34.md`.

Pendência externa: aplicar migration e aferir prazos, concorrência e isolamento com leads e mensagens reais em homologação.

## Fase 35 — SLA de follow-up

**Estado:** 100% implementada e aprovada localmente; migration e amostra operacional de 30 dias permanecem para homologação.

**Evolução:** cada próxima ação abre um ciclo auditável com agendamento, prazo, execução e resultado. Reagendamento, cancelamento, cumprimento e recuperação tardia deixam de ser confundidos.

**Medição:** o painel gerencial mostra taxa de cumprimento, tempo médio de execução, follow-ups recuperados e atrasos ainda abertos, sempre limitado aos corretores diretamente subordinados.

**Fonte única:** `leads.next_action_at` continua sendo a agenda operacional. O histórico analítico apenas registra seus ciclos e interações válidas. O contrato está em `config/follow-up-sla.json`, o gate em `npm run follow-up-sla:check` e o roteiro em `docs/FOLLOW_UP_SLA_PHASE_35.md`.

Pendência externa: aplicar migration e aferir conclusão, reagendamento, cancelamento, transferência e isolamento com contatos reais.

## Fase 36 — SLA de visitas

**Estado:** 100% implementada e aprovada localmente; migration e jornada real permanecem para homologação.

**Evolução:** a antiga tela vazia virou um fluxo completo de agendamento, confirmação, realização, cancelamento e ausência. Visita presencial e videochamada compartilham o mesmo histórico governado.

**Operação:** o agendamento atualiza a próxima ação e registra timeline. O calendário reúne tarefas e visitas; resultados terminais não podem ser alterados silenciosamente e a ausência só é aceita após o horário marcado.

**Medição:** tempo de confirmação e atraso da realização ficam persistidos por lead e corretor. O contrato está em `config/visit-sla.json`, o gate em `npm run visit-sla:check` e o roteiro em `docs/VISIT_SLA_PHASE_36.md`.

Pendência externa: aplicar migration e validar presencial, vídeo, concorrência, escopo lateral e dois tenants em homologação.

## Fase 37 — SLA de proposta

**Estado:** 100% implementada e aprovada localmente; migration e ciclo real com aprovação permanecem para homologação.

**Evolução:** a proposta deixa de terminar na aprovação interna. O sistema acompanha preparação, revisão, envio, aceite, recusa e vencimento, mantendo a simulação e a regra financeira originais.

**Medição:** tempo de preparação, revisão e resposta do cliente ficam visíveis no Lead 360. O envio abre próxima ação dentro da validade; a resposta encerra o ciclo e registra timeline.

**Segurança:** apenas proposta aprovada e válida pode ser enviada. Resposta exige envio anterior, concorrência é bloqueada e preço, estoque, regra de pagamento, escopo comercial e revisão humana permanecem obrigatórios. O contrato está em `config/proposal-sla.json`, o gate em `npm run proposal-sla:check` e o roteiro em `docs/PROPOSAL_SLA_PHASE_37.md`.

Pendência externa: aplicar migration e validar aprovação, envio, retorno, vencimento, concorrência e isolamento em homologação.

## Fase 38 — Forecast por etapa

**Estado:** 100% implementada e aprovada localmente; reconciliação financeira com oportunidades reais permanece para homologação.

**Evolução:** a página demonstrativa foi substituída por um forecast hierárquico e explicável. O motor usa valor e probabilidade da etapa canônica da organização, excluindo resultados terminais e compradores externos.

**Prazo e confiança:** a previsão é distribuída entre vencido, 30, 60, 90 dias, prazo posterior e sem data. Confiança considera amostra, valor, data prevista e etapa válida; lacunas ficam explícitas.

**Governança:** a API aplica sessão, organização e RLS. Forecast não garante receita nem declara tendência sem snapshot anterior. O contrato está em `config/stage-forecast.json`, o gate em `npm run stage-forecast:check` e o roteiro em `docs/STAGE_FORECAST_PHASE_38.md`.

Pendência externa: conferir somas por etapa e escopo com oportunidades reais, quatro papéis e dois tenants.

## Fase 39 — Aging do pipeline

**Estado:** 100% implementada e aprovada localmente; aferição com histórico real permanece para homologação.

**Evolução:** o sistema mede tempo na etapa atual, compara com o SLA canônico, identifica atenção, estagnação e criticidade e entrega uma fila objetiva para ação do corretor e da liderança.

**Precisão e governança:** movimentações registradas são a fonte real. Leads anteriores ao histórico usam a criação como estimativa, com cobertura explícita. A análise é hierárquica, somente leitura e não transfere carteira nem toma decisão sobre pessoas. O contrato está em `config/pipeline-aging.json`, o gate em `npm run pipeline-aging:check` e o roteiro em `docs/PIPELINE_AGING_PHASE_39.md`.

Pendência externa: aferir idades, reversões, limites e cobertura com histórico real, quatro papéis e dois tenants.

## Fase 40 — Velocidade e conversão do funil

**Estado:** 100% implementada e aprovada localmente; aferição estatística com volume real permanece para homologação.

**Evolução:** o Atlas mede conversão sequencial e tempo de saída por etapa dentro da mesma coorte. Etapas alcançadas permanecem no denominador mesmo após retorno, evitando distorção pelo status atual.

**Confiança e governança:** taxas exigem 30 entradas e tempos exigem 10 saídas para comparação segura. Reversões ficam explícitas. A análise respeita RLS e hierarquia, não atribui causalidade, não ranqueia pessoas e não executa decisões. O contrato está em `config/funnel-velocity.json`, o gate em `npm run funnel-velocity:check` e o roteiro em `docs/FUNNEL_VELOCITY_PHASE_40.md`.

Pendência externa: aferir coortes, saltos, retornos, reversões, durações e isolamento com histórico real.

## Fase 41 — Central de tarefas

**Estado:** 100% implementada e aprovada localmente; jornada multiusuário real permanece para homologação.

**Evolução:** uma fila canônica reúne prioridade explicável, tarefas vencidas e de hoje, itens sem prazo, responsáveis e leads relacionadas. A liderança recebe somente o consolidado visível da própria cadeia.

**Segurança:** conclusão e reagendamento passam por API autenticada, ações permitidas e reconfirmação de organização e RLS. Não existe atribuição automática nem ranking de pessoas. O contrato está em `config/task-center.json`, o gate em `npm run task-center:check` e o roteiro em `docs/TASK_CENTER_PHASE_41.md`.

Pendência externa: validar tarefas próprias, subordinadas, laterais, sem lead, concorrência e isolamento com usuários reais.

## Fase 42 — Criação rápida de tarefas

**Estado:** 100% implementada e aprovada localmente; criação multiusuário real permanece para homologação.

**Evolução:** a tarefa nasce dentro da Central com título, prazo, prioridade, lead opcional e responsável. A seleção de lead preserva automaticamente o corretor único; sem lead, o responsável precisa estar visível na hierarquia.

**Segurança:** a API valida prazo futuro, limites, prioridades permitidas, organização, lead, responsável e RLS. A criação é humana, autenticada e limitada. O contrato está em `config/task-quick-create.json`, o gate em `npm run task-quick-create:check` e o roteiro em `docs/TASK_QUICK_CREATE_PHASE_42.md`.

Pendência externa: validar lead e responsável laterais, corretor próprio, liderança, datas e dois tenants com banco de homologação.

## Fase 43 — Tarefas recorrentes

**Estado:** 100% implementada e aprovada localmente; migration, cron e ciclos reais permanecem para homologação.

**Evolução:** tarefas repetem diariamente, semanalmente ou mensalmente, sempre com data final e limite entre 2 e 100 ocorrências. A primeira tarefa e a regra nascem atomicamente.

**Segurança:** o worker Hostinger usa segredo, trava concorrente e chave única por ocorrência. A regra encerra ao atingir prazo ou quantidade, mantém o corretor único da lead e nunca nasce por decisão autônoma da IA. O contrato está em `config/recurring-tasks.json`, o gate em `npm run recurring-tasks:check` e o roteiro em `docs/RECURRING_TASKS_PHASE_43.md`.

Pendência externa: aplicar migration e validar cadências, virada mensal, concorrência, encerramento e isolamento real.

## Fase 44 — Lembretes inteligentes

**Estado:** 100% implementada e aprovada localmente; migration, worker e fuso real permanecem para homologação.

**Evolução:** a tela vazia de notificações virou caixa pessoal. Alta prioridade alerta com 24 horas, normal com 4, baixa com 1 e atraso imediatamente. Leitura e descarte pertencem ao responsável.

**Controle:** tarefa, tipo e prazo geram um único alerta; reagendamento abre um novo ciclo. Tarefas encerradas somem. Não há mensagem ao cliente nem conclusão automática. O contrato está em `config/smart-task-reminders.json`, o gate em `npm run smart-reminders:check` e o roteiro em `docs/SMART_TASK_REMINDERS_PHASE_44.md`.

Pendência externa: aplicar migration e validar cron, fuso, janelas, reagendamento, descarte, hierarquia e isolamento real.

## Fase 45 — Notificações em tempo real

**Estado:** 100% implementada e aprovada localmente; publicação Realtime e duas sessões reais permanecem para homologação.

**Evolução:** a caixa e o contador superior acompanham lembretes sem recarregar. O contador mostra apenas itens pessoais, não lidos e ativos; mudanças possuem anúncio acessível.

**Segurança e resiliência:** o canal respeita RLS, filtra `assigned_to`, é removido ao sair e cai para atualização manual em erro ou timeout. O contrato está em `config/realtime-task-notifications.json`, o gate em `npm run realtime-notifications:check` e o roteiro em `docs/REALTIME_TASK_NOTIFICATIONS_PHASE_45.md`.

Pendência externa: aplicar migration após a Fase 44 e validar duas sessões, reconexão, logout, lateralidade e dois tenants.

## Fase 46 — Agenda comercial unificada

**Estado:** 100% implementada e aprovada localmente; fusos, hierarquia e Realtime reais permanecem para homologação.

**Evolução:** tarefas abertas, visitas ativas e próximas ações das leads agora chegam por uma API única. Hoje, sete dias, mês, atrasados e visão completa compartilham o mesmo contrato e indicadores claros.

**Consistência e segurança:** uma próxima ação igual a uma visita ativa não é duplicada. A API exige autenticação, organização e RLS hierárquico; atualizações não concluem tarefas, não mudam responsáveis e não contatam clientes. O contrato está em `config/commercial-calendar.json`, o gate em `npm run commercial-calendar:check` e o roteiro em `docs/COMMERCIAL_CALENDAR_PHASE_46.md`.

Pendência externa: validar quatro perfis, dois tenants, fuso, virada mensal, eventos simultâneos, reconexão e volume real.

## Fase 47 — Sincronização externa de calendário

**Estado:** 100% da base segura implementada e aprovada localmente; OAuth e entrega real permanecem para homologação com credenciais.

**Evolução:** Google Calendar e Microsoft Outlook ganharam preferências pessoais, opt-in explícito, direção única Atlas → externo e fila auditável. O padrão oculta nomes e contexto comercial.

**Segurança e verdade operacional:** tokens não passam pelo navegador nem ficam no banco comum. Desconectar remove a referência de acesso; a tela não afirma conexão antes do OAuth real. O contrato está em `config/external-calendar-sync.json`, o gate em `npm run external-calendar:check` e o roteiro em `docs/EXTERNAL_CALENDAR_SYNC_PHASE_47.md`.

Pendência externa: aplicar migration, configurar credenciais e redirects na Hostinger, implementar callbacks dos provedores e validar revogação e entrega reais.

## Fase 48 — Assistente diário de produtividade

**Estado:** 100% implementada e aprovada localmente; ordenação, adoção e experiência móvel reais permanecem para homologação.

**Evolução:** a Central de Tarefas ganhou uma sequência pessoal de até sete passos. Cada item explica o motivo e a próxima ação usando SLA, tarefa, visita, prioridade, temperatura e score.

**Eficiência e governança:** a ordenação tem custo LLM zero, exige carteira própria e não usa ranking de pessoas. O assistente orienta e abre o destino; nunca executa ou conclui sozinho. O contrato está em `config/daily-productivity-assistant.json`, o gate em `npm run daily-productivity:check` e o roteiro em `docs/DAILY_PRODUCTIVITY_ASSISTANT_PHASE_48.md`.

Pendência externa: validar quatro perfis, dois tenants, empates, atualização após ações e uso móvel com corretores reais.

## Fase 49 — Revisão semanal assistida

**Estado:** 100% implementada e aprovada localmente; aferição com semanas e usuários reais permanece para homologação.

**Evolução:** resultados, pendências e até cinco focos da próxima semana aparecem no relatório pessoal. A tela separa entregas de backlog e explica cada recomendação.

**Qualidade:** custo LLM zero, carteira própria, nenhum ranking de pessoas e percentual oculto em amostra menor que cinco. O contrato está em `config/weekly-productivity-review.json`, o gate em `npm run weekly-productivity:check` e o roteiro em `docs/WEEKLY_PRODUCTIVITY_REVIEW_PHASE_49.md`.

Pendência externa: validar quatro perfis, dois tenants, semana vazia, virada do período e comportamento móvel.

## Fase 50 — Fechamento do bloco de produtividade

**Estado:** engenharia local das fases 41–49 reconciliada e 100% aprovada; homologação operacional permanece independente.

**Auditoria:** nove contratos e nove gates cobrem tarefas, criação, recorrência, lembretes, Realtime, agenda, conexão externa, assistente diário e revisão semanal. Limites de consulta e tamanho das filas evitam excesso de custo e interface.

**Verdade operacional:** o painel separa “engenharia local” de “evidência real”. Quatro perfis, dois tenants, mobile, fuso, cron, Realtime, OAuth, acessibilidade e volume real continuam obrigatórios. O contrato está em `config/productivity-block-closure.json`, o gate em `npm run productivity-block:check` e o roteiro em `docs/PRODUCTIVITY_BLOCK_CLOSURE_PHASE_50.md`.

## Fase 51 — Motor de distribuição por disponibilidade

**Estado:** 100% implementada e aprovada localmente; concorrência e presença reais permanecem para homologação.

**Evolução:** a versão 2 preserva responsável único e registra carga anterior, peso, carga ponderada, última atribuição e critérios. A liderança visualiza a justificativa das atribuições dentro da própria hierarquia.

**Atomicidade:** trava por organização/projeto, `SKIP LOCKED` e atualização condicionada a lead ainda não atribuída impedem colisões. O contrato está em `config/explainable-lead-distribution.json`, o gate em `npm run explainable-distribution:check` e o roteiro em `docs/EXPLAINABLE_LEAD_DISTRIBUTION_PHASE_51.md`.

Pendência externa: aplicar migration e testar concorrência, presença, pesos, projetos e dois tenants com equipe real.

## Fase 52 — Fila de leads sem responsável

**Estado:** 100% implementada e aprovada localmente; volume, concorrência e inspeção de rede reais permanecem para homologação.

**Evolução:** a liderança vê até 100 leads sem responsável por projeto, origem, etapa e tempo de espera. Nome, contato, CPF, notas e metadata não saem na fila.

**Governança:** a fila é ordenada pela criação e depende do comando “Distribuir próxima”, projeto escolhido e corretor elegível. A atomicidade da Fase 51 reconfirma que a lead ainda está livre. O contrato está em `config/unassigned-lead-queue.json`, o gate em `npm run unassigned-queue:check` e o roteiro em `docs/UNASSIGNED_LEAD_QUEUE_PHASE_52.md`.

Pendência externa: validar liderança, dois tenants, concorrência, fila acima de 100 e resposta sem PII na rede.

## Fase 53 — Transferência individual governada

**Estado:** 100% implementada e aprovada localmente; concorrência, triggers e hierarquia reais permanecem para homologação.

**Evolução:** a Lead 360 abre uma transferência com destinos permitidos e motivo obrigatório. Tarefas abertas acompanham o novo corretor; timeline, lote e item preservam a evidência.

**Concorrência:** o RPC bloqueia a lead e compara o responsável esperado, retornando conflito sem sobrescrever uma mudança recente. Conversa e copiloto seguem o trigger de titularidade exclusiva. O contrato está em `config/governed-single-lead-transfer.json`, o gate em `npm run single-transfer:check` e o roteiro em `docs/GOVERNED_SINGLE_LEAD_TRANSFER_PHASE_53.md`.

Pendência externa: aplicar migration e validar gestor, diretor, dois tenants, conflito, tarefas, conversa e copiloto reais.

## Fase 54 — Transferência controlada entre equipes

**Estado:** 100% implementada e aprovada localmente; pesos, volume e concorrência reais permanecem para homologação.

**Evolução:** diretor ou superintendente escolhe o gerente de destino, mas cada lead vai diretamente para um corretor ativo e elegível da equipe. O gerente nunca se torna proprietário da lead.

**Equilíbrio e auditoria:** a decisão usa projeto, habilitação, peso, carga ponderada e última atribuição. Lote, itens, timeline e tarefas abertas acompanham a operação atômica. O contrato está em `config/controlled-team-transfer.json`, o gate em `npm run team-transfer:check` e o roteiro em `docs/CONTROLLED_TEAM_TRANSFER_PHASE_54.md`.

Pendência externa: aplicar migration e validar dois tenants, equipe real, projetos, pesos, concorrência, tarefas e lote de até 200 leads.

## Fase 55 — Redistribuição governada por ausência

**Estado:** 100% implementada e aprovada localmente; equipe, concorrência e carga reais permanecem para homologação.

**Evolução:** o gerente declara corretor, período e motivo e confirma a cobertura. Uma simples queda de internet nunca transfere carteira. Somente leads comerciais ativas são redistribuídas; vendas, perdas, descartes e arquivos permanecem intactos.

**Continuidade:** cada lead vai diretamente a um corretor online da mesma equipe, elegível no projeto e escolhido por carga ponderada. Timeline, tarefas, lote e evento de ausência preservam a evidência. O contrato está em `config/governed-absence-redistribution.json`, o gate em `npm run absence-redistribution:check` e o roteiro em `docs/GOVERNED_ABSENCE_REDISTRIBUTION_PHASE_55.md`.

Pendência externa: aplicar migration e validar dois tenants, equipe real, projetos, pesos, concorrência, tarefas e lote de até 200 leads.

## Fase 56 — Limites de carteira por corretor

**Estado:** 100% implementada e aprovada localmente; carga e concorrência reais permanecem para homologação.

**Evolução:** o gerente define teto total, teto por projeto, alerta e motivo. A capacidade representa condição operacional, sem meta, score ou ranking de pessoas.

**Proteção universal:** o banco bloqueia novas atribuições acima do teto em todos os caminhos do CRM e usa trava por corretor contra concorrência. Carteiras encerradas não consomem capacidade; reduzir um teto não remove leads atuais. O contrato está em `config/broker-portfolio-capacity.json`, o gate em `npm run broker-capacity:check` e o roteiro em `docs/BROKER_PORTFOLIO_CAPACITY_PHASE_56.md`.

Pendência externa: aplicar migration e validar dois tenants, carga real, todos os caminhos de atribuição, projetos e concorrência.

## Fase 57 — Prioridade explicável de distribuição

**Estado:** 100% implementada e aprovada localmente; fila, volume e concorrência reais permanecem para homologação.

**Evolução:** a liderança define prioridade e SLA por origem dentro do projeto. A ordem usa pressão de SLA, prioridade da origem e antiguidade, sem dados pessoais ou ranking de pessoas.

**Destino protegido:** o corretor continua sendo escolhido por hierarquia, presença, projeto, capacidade e carga ponderada. Cada atribuição registra sua explicação. O contrato está em `config/explainable-distribution-priority.json`, o gate em `npm run distribution-priority:check` e o roteiro em `docs/EXPLAINABLE_DISTRIBUTION_PRIORITY_PHASE_57.md`.

Pendência externa: aplicar migration e validar dois tenants, origens, projetos, SLA, capacidade, concorrência e evento sem PII.

## Fase 58 — Reserva, aceite e devolução segura

**Estado:** 100% implementada e aprovada localmente; cron, concorrência e usuários reais permanecem para homologação.

**Evolução:** cada distribuição cria reserva de cinco minutos. O corretor aceita na Lead 360; sem aceite ou interação, o worker protegido devolve a lead e tarefas abertas à fila.

**Proteções:** interação iniciada impede devolução; troca de responsável supera a reserva; o worker não contata clientes. O contrato está em `config/lead-assignment-reservations.json`, o gate em `npm run lead-reservation:check` e o roteiro em `docs/LEAD_ASSIGNMENT_RESERVATIONS_PHASE_58.md`.

Pendência externa: aplicar migration, configurar cron Hostinger e validar aceite, expiração, interação, concorrência, tarefas e dois tenants.

## Fase 59 — Histórico e auditoria da carteira

**Estado:** 100% implementada e aprovada localmente; volume e hierarquia reais permanecem para homologação.

**Evolução:** a liderança acompanha distribuição, transferência, reservas, devoluções, ausências e capacidade em um livro único, ordenado e resumido.

**Privacidade:** a visão respeita tenant e hierarquia, reutiliza fontes operacionais e não retorna nome, contato ou texto livre da lead. O contrato está em `config/portfolio-audit-ledger.json`, o gate em `npm run portfolio-audit:check` e o roteiro em `docs/PORTFOLIO_AUDIT_LEDGER_PHASE_59.md`.

Pendência externa: aplicar migration e validar três níveis de liderança, dois tenants, volume e resposta sem PII.

## Fase 60 — Fechamento do bloco de distribuição

**Estado:** 100% da engenharia local aprovada; homologação operacional continua dependente de evidência real.

**Reconciliação:** nove contratos, nove gates e nove invariantes cobrem as fases 51–59. A página de homologação separa claramente engenharia aprovada de operação pendente e inclui testes reais de capacidade, reserva, aceite e escopo gerencial.

**Pendências externas:** quatro perfis, dois tenants, equipe online, concorrência, cron de reservas, capacidade, mobile e 10 mil leads. O contrato está em `config/distribution-block-closure.json`, o gate em `npm run distribution-block:check` e o roteiro em `docs/DISTRIBUTION_BLOCK_CLOSURE_PHASE_60.md`.

## Fase 61 — Cadastro canônico de incorporadoras

**Estado:** 100% implementada e aprovada localmente; migração e cadastros reais permanecem para homologação.

**Evolução:** incorporadora passa a ser entidade única com razão social, nome comercial, CNPJ, contatos, sede, status e SLA padrão de comissão. Projetos ganham vínculo por ID e nomes antigos são migrados automaticamente.

**Governança:** diretoria/superintendência escrevem, RLS isola empresas e eventos auditam mudanças. O contrato está em `config/canonical-developers.json`, o gate em `npm run canonical-developers:check` e o roteiro em `docs/CANONICAL_DEVELOPERS_PHASE_61.md`.

Pendência externa: aplicar migration e validar incorporadoras reais, dois tenants, CNPJ, permissões e vínculos migrados.

## Fase 62 — Cadastro completo de empreendimentos

**Estado:** 100% implementada e aprovada localmente; migração e portfólio real permanecem para homologação.

**Evolução:** cada empreendimento ganha ficha operacional única, ligada por ID à incorporadora, com identidade, localização, coordenadas, produto, tipologias, faixas, unidades, datas e ciclo comercial.

**Governança:** diretoria/superintendência escrevem por RPC atômica, o banco valida faixas e datas, o nome legado permanece sincronizado e eventos auditam alterações. O contrato está em `config/complete-development-registry.json`, o gate em `npm run development-registry:check` e o roteiro em `docs/COMPLETE_DEVELOPMENT_REGISTRY_PHASE_62.md`.

Pendência externa: aplicar migrations 61–62 e validar portfólio real, dois tenants, permissões, concorrência, geolocalização e dossiê automático.

## Fase 63 — Catálogo de tipologias e diferenciais

**Estado:** 100% implementada e aprovada localmente; catálogo e consumo real permanecem para homologação.

**Evolução:** tipologias ganham área, dormitórios, vagas, preço e disponibilidade estruturados. Diferenciais são categorizados, priorizados e separados entre verificados e pendentes.

**Governança:** liderança grava por RPC atômica, RLS isola tenants e fonte é obrigatória para marcar um fato como verificado. O contrato está em `config/typology-feature-catalog.json`, o gate em `npm run development-catalog:check` e o roteiro em `docs/TYPOLOGY_FEATURE_CATALOG_PHASE_63.md`.

Pendência externa: aplicar migration, cadastrar portfólio real e validar matching, copiloto, fontes e permissões em dois tenants.

## Fase 64 — Estoque e espelho de vendas canônico

**Estado:** 100% implementada e aprovada localmente; espelho real e concorrência permanecem para homologação.

**Evolução:** cada unidade é ligada à tipologia canônica, recebe chave única, origem, versão e frescor. Status e preço passam por operação atômica e geram histórico com autor e motivo.

**Proteções:** reserva ativa impede alteração incompatível e concorrência otimista bloqueia sobrescrita de dado novo. O contrato está em `config/canonical-sales-mirror.json`, o gate em `npm run sales-mirror:check` e o roteiro em `docs/CANONICAL_SALES_MIRROR_PHASE_64.md`.

Pendência externa: aplicar migrations 63–64 e validar espelho real, duplicidade, reserva, concorrência, perfis e dois tenants.

## Fase 65 — Importação e atualização inteligente de tabelas

**Estado:** 100% implementada e aprovada localmente; formatos reais das incorporadoras permanecem para homologação.

**Evolução:** arquivos XLSX/CSV são normalizados, reconciliados linha a linha e separados em criação, atualização, sem mudança, conflito ou erro. A prévia é obrigatória e arquivo repetido é identificado por hash.

**Proteções:** somente diretoria/superintendência aprovam com motivo; aplicação atômica reutiliza concorrência e bloqueio por reserva. O contrato está em `config/intelligent-inventory-import.json`, o gate em `npm run inventory-import:check` e o roteiro em `docs/INTELLIGENT_INVENTORY_IMPORT_PHASE_65.md`.

Pendência externa: aplicar migration e validar tabelas reais, volume, moeda, duplicidade, reservas, concorrência e dois tenants.

## Fase 66 — Versionamento e vigência comercial

**Estado:** 100% implementada e aprovada localmente; fontes e simulações reais permanecem para homologação.

**Evolução:** tabela, espelho/importação e condição de pagamento passam a formar um pacote versionado. Uma única versão ativa governa o empreendimento e cada simulação fotografa suas fontes.

**Governança:** superintendência prepara; diretoria ativa com motivo. Ativação substitui a anterior atomicamente e validade limita simulações. O contrato está em `config/commercial-release-versioning.json`, o gate em `npm run commercial-release:check` e o roteiro em `docs/COMMERCIAL_RELEASE_VERSIONING_PHASE_66.md`.

Pendência externa: aplicar migration e validar fontes reais, duas versões, concorrência, vigência, simulação, histórico e dois tenants.

## Fase 67 — Central de materiais por incorporadora

**Estado:** 100% implementada e aprovada localmente; portfólio e Storage reais permanecem para homologação.

**Evolução:** cobertura de book, tabela e espelho passa a ser calculada em todo o portfólio e agrupada por incorporadora, com vencimentos e revisões pendentes.

**Governança:** nova versão entra pendente, gestão valida somente o arquivo atual e eventos preservam a decisão. Links continuam privados e temporários. O contrato está em `config/developer-material-center.json`, o gate em `npm run material-center:check` e o roteiro em `docs/DEVELOPER_MATERIAL_CENTER_PHASE_67.md`.

Pendência externa: aplicar migration e validar três incorporadoras, kit, validade, revisão, Storage, perfis e dois tenants.

## Fase 68 — Dossiê automático do projeto e da região

**Estado:** 100% implementada e aprovada localmente; evidências e fontes reais permanecem para homologação.

**Evolução:** cada empreendimento recebe prontidão explicável baseada em localização, tipologias, diferenciais com fonte, materiais comerciais vigentes e fontes regionais. Lacunas ficam visíveis e não viram fatos por inferência.

**Governança:** somente um dossiê com 100% pode ser publicado, e apenas após decisão de diretor ou superintendente. A autorização limita a IA a fatos aprovados, não usa dados pessoais e preserva eventos. O contrato está em `config/project-region-dossier.json`, o gate em `npm run project-dossier:check` e o roteiro em `docs/PROJECT_REGION_DOSSIER_PHASE_68.md`.

Pendência externa: aplicar migration e validar projeto incompleto/completo, fontes reais, aprovação por perfil, histórico e dois tenants.

## Fase 69 — Estudo regional assistido e governado

**Estado:** 100% implementada e aprovada localmente; fontes regionais reais permanecem para homologação.

**Evolução:** gestores cadastram fontes por categoria com publicador, URL HTTPS, resumo factual, data de referência e validade. Somente fontes vigentes e verificadas alimentam o dossiê.

**Governança:** novas fontes ficam pendentes; diretoria ou superintendência revisa. Vencimento remove a fonte do contexto, alterações revogam a publicação anterior e eventos preservam decisões. O contrato está em `config/governed-region-study.json`, o gate em `npm run region-study:check` e o roteiro em `docs/GOVERNED_REGION_STUDY_PHASE_69.md`.

Pendência externa: aplicar migration e validar fontes reais, expiração, aprovação por perfil, sincronização do dossiê e dois tenants.

## Fase 70 — Homologação completa do bloco de projetos

**Estado:** 100% implementada e aprovada localmente; aceite com dados e usuários reais permanece pendente.

**Evolução:** o portfólio mostra oito gates por projeto — incorporadora, cadastro, catálogo, estoque, versão comercial, materiais, região e dossiê — com prontidão individual e média do bloco.

**Governança:** somente a diretoria homologa. O servidor revalida as oito evidências, preserva snapshot e histórico, e o aceite não autoriza produção. O contrato está em `config/project-block-homologation.json`, o gate em `npm run project-block:check` e o roteiro em `docs/PROJECT_BLOCK_HOMOLOGATION_PHASE_70.md`.

Pendência externa: aplicar migrations 61–70 e validar portfólio real, oito gates, quatro perfis, expiração, dois tenants e renovação do aceite.

## Fase 71 — Contrato canônico de dados da lead

**Estado:** 100% implementada e aprovada localmente; base real permanece para homologação.

**Evolução:** e-mail, telefone, origem e identidade passam a ter representação normalizada. Dez dimensões formam uma qualidade de 0–100, com status e lacunas acionáveis em uma fila de saneamento.

**Governança:** qualidade é determinística, custa zero em LLM e permanece separada do score de compra. O painel respeita a hierarquia e não retorna contatos, notas ou documentos. O contrato está em `config/canonical-lead-data-contract.json`, o gate em `npm run lead-contract:check` e o roteiro em `docs/CANONICAL_LEAD_DATA_CONTRACT_PHASE_71.md`.

Pendência externa: aplicar migration e validar contatos, duplicidades, dez dimensões, quatro perfis, base real e dois tenants.

## Fase 72 — Deduplicação e identidade única

**Estado:** 100% implementada e aprovada localmente; duplicidades reais permanecem para homologação.

**Evolução:** contatos normalizados idênticos formam grupos com identidade mascarada e recomendação explicável da lead principal. A gestão escolhe qual registro permanecerá ativo.

**Governança:** nenhuma união é automática e nenhum registro é apagado. Origem, status e responsável anteriores permanecem em snapshot; a operação é atômica, auditável e isolada por organização. O contrato está em `config/unique-lead-identity.json`, o gate em `npm run lead-identity:check` e o roteiro em `docs/UNIQUE_LEAD_IDENTITY_PHASE_72.md`.

Pendência externa: aplicar migration e validar duplicidades reais, concorrência, históricos, perfis e dois tenants.

## Fase 73 — Consentimento e preferência de contato

**Estado:** 100% implementada e aprovada localmente; consentimentos e canais reais permanecem para homologação.

**Evolução:** cada lead passa a ter uma fonte única por canal com autorização, base, evidência, preferência, dias, horário, fuso e validade. Corretor visualiza claramente se pode contatar agora.

**Governança:** opt-out sincroniza supressão imediatamente. Rascunho de IA e envio consultam a mesma elegibilidade; atalhos externos foram removidos. O contrato está em `config/contact-consent-preferences.json`, o gate em `npm run contact-consent:check` e o roteiro em `docs/CONTACT_CONSENT_PREFERENCES_PHASE_73.md`.

Pendência externa: aplicar migration e validar autorização, expiração, horários, opt-out, quatro perfis, canais reais e dois tenants.

## Fase 74 — Histórico de origem e atribuição

**Estado:** 100% implementada e aprovada localmente; campanhas e jornadas reais permanecem para homologação.

**Evolução:** a primeira origem fica imutável e cada novo contato vira um toque na jornada, preservando canal, campanha, anúncio, formulário, página e projeto quando disponíveis.

**Governança:** a timeline é append-only, idempotente, sem PII e protegida por hierarquia. Leads antigas recebem backfill sem inventar informação. O contrato está em `config/immutable-lead-attribution.json`, o gate em `npm run lead-attribution:check` e o roteiro em `docs/IMMUTABLE_LEAD_ATTRIBUTION_PHASE_74.md`.

Pendência externa: aplicar migration e validar Meta, entradas manuais, mudanças, repetição, backfill, perfis e dois tenants.

Próxima fase: **Fase 75 — Eventos comportamentais canônicos**, padronizando respostas, visitas, propostas e conversões para aprendizado confiável.

## Fase 75 — Eventos comportamentais canônicos

**Estado:** 100% implementada e aprovada localmente; aplicação da migration e jornada real permanecem para homologação.

**Evolução:** mensagens, ligações, visitas, propostas e desfechos agora convergem para uma taxonomia append-only com 19 eventos e cinco categorias. Captura automática, backfill e idempotência evitam lacunas e duplicidades.

**Eficiência e privacidade:** a normalização é determinística, custa zero tokens e aceita somente atributos estruturados. Conteúdo, nome, telefone, e-mail, documentos, endereço e anotações não entram na memória analítica. O contrato está em `config/canonical-behavior-events.json`, o gate em `npm run behavior-events:check` e o roteiro em `docs/CANONICAL_BEHAVIOR_EVENTS_PHASE_75.md`.

Pendência externa: aplicar migration e validar jornada completa, repetição de webhooks, quatro perfis e dois tenants.

Próxima fase: **Fase 76 — Dataset supervisionado de conversão**, criando rótulos e janelas temporais confiáveis sem vazamento do futuro.

## Fase 76 — Dataset supervisionado de conversão

**Estado:** 100% implementada e aprovada localmente; aplicação das migrations e maturação temporal da coorte permanecem para homologação.

**Evolução:** fotografias imutáveis preservam apenas sinais conhecidos no instante da previsão. Ganho, perda e compra externa viram rótulo somente quando acontecem depois e dentro de janelas de 30, 60, 90 ou 180 dias. Leads abertas nunca são rotuladas artificialmente como perda.

**Governança:** datasets são versionados e exigem no mínimo 100 exemplos, 20 positivos e 20 negativos. Não há PII, texto livre, ranking de pessoas ou promoção automática de modelo. O contrato está em `config/supervised-conversion-dataset.json`, o gate em `npm run conversion-dataset:check` e o roteiro em `docs/SUPERVISED_CONVERSION_DATASET_PHASE_76.md`.

Pendência externa: aplicar migrations, criar coortes em datas distintas e aguardar desfechos reais para aferir calibração.

Próxima fase: **Fase 77 — Score preditivo calibrado**, comparando probabilidade prevista e conversão observada com explicação e limites de confiança.

## Fase 77 — Score preditivo calibrado

**Estado:** 100% implementada e aprovada localmente; métricas reais e ativação permanecem condicionadas à maturação do dataset.

**Evolução:** score comercial e probabilidade permanecem separados. Candidatos imutáveis comparam previsto e observado em faixas, medem Brier Score e erro esperado de calibração, aplicando fallback quando a faixa tem menos de 20 exemplos.

**Governança:** no mínimo 100 exemplos, 20 positivos e 20 negativos; somente a diretoria ativa uma curva elegível, com justificativa auditável. Há um modelo ativo por organização, sem promoção automática ou ranking de pessoas. O contrato está em `config/calibrated-predictive-score.json`, o gate em `npm run conversion-calibration:check` e o roteiro em `docs/CALIBRATED_PREDICTIVE_SCORE_PHASE_77.md`.

Pendência externa: maturar dataset, construir candidato, aferir Brier/ECE e homologar aprovação do diretor entre dois tenants.

Próxima fase: **Fase 78 — Explicabilidade preditiva operacional**, traduzindo probabilidade, confiança e fatores em ações claras para corretor e gestão.

## Fase 78 — Explicabilidade preditiva operacional

**Estado:** 100% implementada e aprovada localmente; sinais e ações reais permanecem para homologação com a equipe.

**Evolução:** cada lead recebe probabilidade bruta e calibrada, confiança explícita, fatores positivos, riscos, sinais ausentes e próxima melhor ação. A explicação expira em 24 horas e pode ser atualizada por corretor ou liderança autorizada.

**Eficiência e governança:** cálculo determinístico com custo zero de LLM, chaves controladas e tradução clara na interface. Score continua separado da probabilidade; não há decisão automática, troca de responsável ou ranking de pessoas. O contrato está em `config/operational-prediction-explainability.json`, o gate em `npm run prediction-explainability:check` e o roteiro em `docs/OPERATIONAL_PREDICTION_EXPLAINABILITY_PHASE_78.md`.

Pendência externa: aplicar migrations, comparar perfis de leads reais e validar compreensão por corretor, gerente e diretor em dois tenants.

Próxima fase: **Fase 79 — Monitoramento de drift e qualidade**, detectando mudança de público, queda de calibração e envelhecimento do modelo sem reação automática.

## Fase 79 — Monitoramento de drift e qualidade

**Estado:** 100% implementada e aprovada localmente; séries temporais reais permanecem necessárias para homologação.

**Evolução:** janelas de 30, 60 e 90 dias são comparadas ao período imediatamente anterior. O monitor mede PSI das probabilidades, score médio, conversão observada e mudança no Brier Score, preservando cada relatório.

**Governança:** cada lado exige 100 fotografias; amostra baixa não vira alerta. PSI 0,10/0,25 e delta Brier 0,02/0,05 separam atenção e alerta. Não há rollback, mudança de campanha ou decisão sobre pessoas. O contrato está em `config/prediction-drift-monitoring.json`, o gate em `npm run prediction-drift:check` e o roteiro em `docs/PREDICTION_DRIFT_MONITORING_PHASE_79.md`.

Pendência externa: acumular séries, gerar três janelas e homologar estabilidade, atenção, alerta, perfis autorizados e dois tenants.

Próxima fase: **Fase 80 — Gate final de modelo e equidade**, fechando dados e predição com critérios de liberação, auditoria de segmentos permitidos e rollback humano.

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
