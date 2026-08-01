# Variáveis de ambiente — Atlas One

Gerado a partir de `config/environment-variables.json`, que é a **fonte única**:
o portão `npm run environment:variables` reprova o build se alguma variável for
usada no código sem estar classificada aqui. Não existe variável "esquecida".

## Resumo

| | |
|---|---|
| Classificadas | **134** |
| **Obrigatórias** | **9** — sem elas a aplicação não sobe |
| Opcionais | 125 — integração ausente degrada, não derruba |
| Marcadas como segredo | 30 — todas sob rotação em `config/secret-governance.json` |

## As 9 obrigatórias

Sem estas nove o boot falha com mensagem clara, e é assim de propósito: subir
sem banco ou sem segredo de cron produz um sistema que parece vivo e não é.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ATLAS_BASE_URL=https://atlasaios.com.br
ATLAS_CRON_SECRET=
```

> A lista completa e autoritativa está na tabela abaixo, coluna **obrigatória**.

## Regras que valem para todas

1. **`SUPABASE_SERVICE_ROLE_KEY` nunca no navegador.** Só `NEXT_PUBLIC_*` chega
   ao bundle; o portão `security:secrets` varre 2.301 arquivos a cada validação.
2. **Integração opcional ausente não derruba a aplicação.** Ela reporta o estado
   em `/api/ready` e no centro de saúde, e degrada com mensagem explícita.
3. **`NEXT_PUBLIC_*` é fixada no build.** Definir depois exige rebuild — não
   basta reiniciar o processo.
4. **Nada de valor real em `.env.example`.** Só nomes e exemplos não sensíveis.

## Tabela completa

| variável | escopo | obrigatória | segredo | para que serve |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | server | não | sim | Provedor Anthropic (Claude) para IA comercial e raciocínio governados. |
| `ATLAS_AI_COMMERCIAL_INPUT_USD_PER_MILLION` | server | não | não | Preço auditado de entrada comercial. |
| `ATLAS_AI_COMMERCIAL_MODEL` | server | não | não | Modelo comercial. |
| `ATLAS_AI_COMMERCIAL_OUTPUT_USD_PER_MILLION` | server | não | não | Preço auditado de saída comercial. |
| `ATLAS_AI_COMMERCIAL_PROVIDER_ORDER` | server | não | não | Ordem de fallback comercial. |
| `ATLAS_AI_FAST_INPUT_USD_PER_MILLION` | server | não | não | Preço auditado de entrada rápida. |
| `ATLAS_AI_FAST_MODEL` | server | não | não | Modelo de baixa latência. |
| `ATLAS_AI_FAST_OUTPUT_USD_PER_MILLION` | server | não | não | Preço auditado de saída rápida. |
| `ATLAS_AI_FAST_PROVIDER_ORDER` | server | não | não | Ordem de fallback para tarefas rápidas. |
| `ATLAS_AI_MODEL` | server | não | não | Modelo padrão legado. |
| `ATLAS_AI_PRICE_TABLE` | server | não | não | Tabela JSON de tarifa por provedor e modelo, usada para estimar custo de IA. |
| `ATLAS_AI_REASONING_INPUT_USD_PER_MILLION` | server | não | não | Preço auditado de entrada de raciocínio. |
| `ATLAS_AI_REASONING_MODEL` | server | não | não | Modelo de raciocínio. |
| `ATLAS_AI_REASONING_OUTPUT_USD_PER_MILLION` | server | não | não | Preço auditado de saída de raciocínio. |
| `ATLAS_AI_REASONING_PROVIDER_ORDER` | server | não | não | Ordem de fallback de raciocínio. |
| `ATLAS_AI_RESEARCH_INPUT_USD_PER_MILLION` | server | não | não | Preço auditado de entrada de pesquisa. |
| `ATLAS_AI_RESEARCH_OUTPUT_USD_PER_MILLION` | server | não | não | Preço auditado de saída de pesquisa. |
| `ATLAS_ALLOW_PUBLIC_ONLY_TEST` | server | não | não | Permite que o teste de rotas rode só com as páginas públicas quando não há login. |
| `ATLAS_ANTHROPIC_MODEL` | server | não | não | Modelo Claude homologado usado pelo roteador de IA. |
| `ATLAS_AUTH_ORGANIZATION_ID` | server | não | não | Organização-alvo do reset RBAC; opcional quando existe somente uma ativa. |
| `ATLAS_BASE_URL` | server | **sim** | não | URL canônica interna do ambiente. |
| `ATLAS_BOOTSTRAP_SECRET` | server | não | sim | Criação inicial do administrador; proibido em produção. |
| `ATLAS_CEREBRAS_BASE_URL` | server | não | não | Sobrescreve o endpoint de Cerebras (proxy corporativo ou instância própria). |
| `ATLAS_CEREBRAS_MODEL` | server | não | não | Modelo usado com Cerebras. Sem ele o provedor fica fora da ordem de roteamento. |
| `ATLAS_CLAUDE_MODEL` | server | não | não | Modelo Anthropic preferido pelo roteador de IA (lib/ai/provider-router.ts). |
| `ATLAS_CRON_SECRET` | server | **sim** | sim | Autenticação de workers e rotinas agendadas. |
| `ATLAS_DATABASE_ENVIRONMENT` | server | **sim** | não | Estágio declarado do banco conectado. |
| `ATLAS_DEEPSEEK_MODEL` | server | não | não | Modelo DeepSeek homologado. |
| `ATLAS_DEFAULT_ORGANIZATION_ID` | server | não | não | Organização assumida em homologação quando a sessão não resolve tenant; proibida em produção. |
| `ATLAS_E2E_CHROMIUM_PATH` | build | não | não | Caminho do Chromium para os testes end-to-end. |
| `ATLAS_ENV` | server | **sim** | não | Estágio Atlas: development, homologation ou production. |
| `ATLAS_ENVIRONMENT_ID` | server | **sim** | não | Identidade exclusiva da instalação. |
| `ATLAS_EVOLUTION_PHASE` | build | não | não | Fase de evolução registrada no empacotamento de checkpoints e releases. |
| `ATLAS_GEMINI_BASE_URL` | server | não | não | Sobrescreve o endpoint de Gemini (proxy corporativo ou instância própria). |
| `ATLAS_GEMINI_MODEL` | server | não | não | Modelo usado com Gemini. Sem ele o provedor fica fora da ordem de roteamento. |
| `ATLAS_GLM_MODEL` | server | não | não | Modelo GLM homologado. |
| `ATLAS_GROQ_BASE_URL` | server | não | não | Sobrescreve o endpoint de Groq (proxy corporativo ou instância própria). |
| `ATLAS_GROQ_MODEL` | server | não | não | Modelo usado com Groq. Sem ele o provedor fica fora da ordem de roteamento. |
| `ATLAS_HOSTING_PROVIDER` | server | **sim** | não | Provedor que executa a aplicação. |
| `ATLAS_IDENTITY_CACHE_TTL_MS` | server | não | não | TTL (ms) do cache de identidade em lib/api/security.ts; 0 desliga o cache. Padrão 60000. |
| `ATLAS_IMPORT_ACTOR_ID` | server | não | não | Autor auditável de uma importação supervisionada. |
| `ATLAS_IMPORT_ORGANIZATION_ID` | server | não | não | Tenant de uma importação supervisionada. |
| `ATLAS_IMPORT_OWNER_ID` | server | não | não | Responsável de uma importação supervisionada. |
| `ATLAS_INITIAL_ADMIN_EMAIL` | server | não | não | E-mail do administrador inicial. |
| `ATLAS_INITIAL_ADOLFO_EMAIL` | server | não | não | E-mail do corretor Adolfo. |
| `ATLAS_INITIAL_DIEGO_EMAIL` | server | não | não | E-mail do corretor Diego. |
| `ATLAS_INITIAL_LUCIANO_EMAIL` | server | não | não | E-mail do corretor Luciano. |
| `ATLAS_INITIAL_SENNA_EMAIL` | server | não | não | E-mail do diretor comercial inicial. |
| `ATLAS_INITIAL_THIAGO_EMAIL` | server | não | não | E-mail do diretor decisor inicial. |
| `ATLAS_KIMI_MODEL` | server | não | não | Modelo Kimi homologado. |
| `ATLAS_MARKETING_BUDGET_CEILING` | server | não | não | Teto de verba do período para o stop loss de marketing. Sem ele as regras de orçamento não rodam — cobrar meta que ninguém combinou é inventar régua. |
| `ATLAS_MARKETING_TARGET_CPL` | server | não | não | CPL alvo acordado. Sem ele o stop loss reporta a regra como não avaliada em vez de estimar um alvo. |
| `ATLAS_MATERIAL_STORAGE_PROVIDER` | server | não | não | Backend dos materiais de projetos. |
| `ATLAS_META_CAPI_ENABLED` | server | não | não | Liga o envio governado de conversões Meta (CAPI); desligado por padrão. |
| `ATLAS_MISTRAL_BASE_URL` | server | não | não | Sobrescreve o endpoint de Mistral (proxy corporativo ou instância própria). |
| `ATLAS_MISTRAL_MODEL` | server | não | não | Modelo usado com Mistral. Sem ele o provedor fica fora da ordem de roteamento. |
| `ATLAS_NEXT_BUNDLER` | build | não | não | Bundler do build Next (webpack padrão; turbopack opcional). |
| `ATLAS_OBJECT_STORAGE_ACCESS_KEY_ID` | server | não | sim | Credencial do storage S3/R2. |
| `ATLAS_OBJECT_STORAGE_BUCKET` | server | não | não | Bucket privado de materiais. |
| `ATLAS_OBJECT_STORAGE_ENDPOINT` | server | não | não | Endpoint S3/R2. |
| `ATLAS_OBJECT_STORAGE_FORCE_PATH_STYLE` | server | não | não | Compatibilidade de endereço do storage. |
| `ATLAS_OBJECT_STORAGE_REGION` | server | não | não | Região S3/R2. |
| `ATLAS_OBJECT_STORAGE_SECRET_ACCESS_KEY` | server | não | sim | Segredo do storage S3/R2. |
| `ATLAS_OLLAMA_BASE_URL` | server | não | não | Sobrescreve o endpoint de Ollama (proxy corporativo ou instância própria). |
| `ATLAS_OLLAMA_MODEL` | server | não | não | Modelo do Ollama auto-hospedado. Não exige chave e nenhum dado sai da máquina — é o único provedor que pode receber dado pessoal sem contrato com terc |
| `ATLAS_OPENAI_MODEL` | server | não | não | Modelo OpenAI usado nos testes de saúde e no roteador de IA. |
| `ATLAS_OPENROUTER_BASE_URL` | server | não | não | Sobrescreve o endpoint de Openrouter (proxy corporativo ou instância própria). |
| `ATLAS_OPENROUTER_MODEL` | server | não | não | Modelo usado com Openrouter. Sem ele o provedor fica fora da ordem de roteamento. |
| `ATLAS_PACKAGE_ENV_FILE` | server | não | não | Arquivo de ambiente alternativo usado somente na validação limpa do pacote Hostinger. |
| `ATLAS_PACKAGE_NAME` | build | não | não | Nome controlado do artefato ZIP de release. |
| `ATLAS_PERPLEXITY_MODEL` | server | não | não | Modelo Perplexity usado pelo roteador de IA e pelo portão de tarifas. |
| `ATLAS_PGLITE_MODULE` | build | não | não | Módulo PGlite usado para verificar migrations em Postgres embarcado. |
| `ATLAS_PIPELINE_STAGE_SETTINGS_ENABLED` | server | não | não | Habilita etapas de pipeline configuráveis por organização; desligada por padrão. |
| `ATLAS_PREFLIGHT_IGNORE_LOCAL_ENV` | build | não | não | Faz o preflight de produção ignorar o .env.local da máquina do desenvolvedor. |
| `ATLAS_PRODUCTION_SUPABASE_URL` | server | não | não | URL do Supabase de produção usada só para comparar ambientes; nunca para conectar. |
| `ATLAS_QWEN_MODEL` | server | não | não | Modelo Qwen homologado. |
| `ATLAS_READINESS_DECISION_FILE` | build | não | não | Arquivo com a decisão de prontidão para uso real, lido pelo preflight. |
| `ATLAS_RECOVERY_INBOX` | server | não | não | Caixa central que recebe recuperações por endereçamento adicional. |
| `ATLAS_RESEARCH_MODEL` | server | não | não | Modelo de pesquisa. |
| `ATLAS_RLS_REHEARSAL_EVIDENCE_PATH` | build | não | não | Caminho da evidência dos ensaios de isolamento RLS. |
| `ATLAS_RLS_TEST_MUTATION_APPROVED` | build | não | não | Autoriza explicitamente que o ensaio de RLS execute escrita. |
| `ATLAS_SLA_AUTO_REASSIGN` | server | não | não | Liga a reatribuição automática por SLA vencido (ação A2). Desligada por padrão: exige regra de distribuição aprovada. |
| `ATLAS_SLA_JANELA_RECUPERACAO_MIN` | server | não | não | Minutos de atraso além dos quais a lead deixa de virar tarefa de SLA e passa a ser acervo de reativação (padrão 2880 = 48h). |
| `ATLAS_SLA_MAX_TAREFAS` | server | não | não | Teto de tarefas de SLA criadas por execução do vigia, para não soterrar a fila do corretor (padrão 25). |
| `ATLAS_SMOKE_BASE_URL` | server | não | não | URL HTTPS temporária usada pelo smoke do artefato publicado. |
| `ATLAS_TEST_EMAIL` | server | não | não | Conta exclusiva de homologação. |
| `ATLAS_TEST_PASSWORD` | server | não | sim | Senha da conta exclusiva de homologação. |
| `ATLAS_WHATSAPP_NLU_ENABLED` | server | não | não | Liga a interpretação NLU de mensagens recebidas no WhatsApp; desligada por padrão. |
| `CEREBRAS_API_KEY` | server | não | sim | Chave da camada gratuita de IA. Origem: Cerebras Cloud (cloud.cerebras.ai). Sem custo até o teto do provedor — o teto é deles, não nosso. |
| `DATABASE_URL` | server | **sim** | sim | Conexão Prisma/Postgres exclusiva do ambiente. |
| `DEEPSEEK_API_KEY` | server | não | sim | Provedor econômico opcional. |
| `GEMINI_API_KEY` | server | não | sim | Chave da camada gratuita de IA. Origem: Google AI Studio (aistudio.google.com/apikey). Sem custo até o teto do provedor — o teto é deles, não nosso. |
| `GLM_API_KEY` | server | não | sim | Provedor econômico opcional. |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | server | não | sim | Conector futuro Google Ads. |
| `GOOGLE_CALENDAR_CLIENT_ID` | server | não | não | Identificador OAuth do Google Calendar. |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | server | não | sim | Segredo OAuth do Google Calendar, exclusivo do servidor. |
| `GOOGLE_CALENDAR_REDIRECT_URI` | server | não | não | Retorno OAuth exato do Google Calendar. |
| `GROQ_API_KEY` | server | não | sim | Chave da camada gratuita de IA. Origem: Groq Console (console.groq.com/keys). Sem custo até o teto do provedor — o teto é deles, não nosso. |
| `KIMI_API_KEY` | server | não | sim | Provedor econômico opcional. |
| `META_AD_ACCOUNT_ID` | server | não | não | Conta de anúncios Meta. |
| `META_ADS_ACCESS_TOKEN` | server | não | sim | Leitura de desempenho de anúncios Meta. |
| `META_APP_SECRET` | server | não | sim | Validação de assinaturas Meta. |
| `META_CAPI_DATASET_ID` | server | não | não | Dataset Meta que recebe os eventos de conversão do CAPI. |
| `META_CONVERSIONS_ACCESS_TOKEN` | server | não | sim | Envio governado de conversões Meta. |
| `META_GRAPH_API_VERSION` | server | não | não | Versão homologada da Graph API. |
| `META_INSTAGRAM_ACTOR_ID` | server | não | não | Ator do Instagram usado ao publicar criativos pela Meta; opcional quando só há Página. |
| `META_LEAD_ACCESS_TOKEN` | server | não | sim | Leitura de leads Meta. |
| `META_LEAD_FORM_ID` | server | não | não | Formulário instantâneo (lead form) Meta vinculado às campanhas de captação prontas. |
| `META_PAGE_ID` | server | não | não | Página do Facebook/Instagram usada para gerar campanhas de captação prontas (ready-campaigns). |
| `META_WEBHOOK_VERIFY_TOKEN` | server | não | sim | Verificação do webhook Meta. |
| `MICROSOFT_CALENDAR_CLIENT_ID` | server | não | não | Identificador OAuth do Microsoft Calendar. |
| `MICROSOFT_CALENDAR_CLIENT_SECRET` | server | não | sim | Segredo OAuth do Microsoft Calendar, exclusivo do servidor. |
| `MICROSOFT_CALENDAR_REDIRECT_URI` | server | não | não | Retorno OAuth exato do Microsoft Calendar. |
| `MISTRAL_API_KEY` | server | não | sim | Chave da camada gratuita de IA. Origem: Mistral Console (console.mistral.ai). Sem custo até o teto do provedor — o teto é deles, não nosso. |
| `NEXT_PHASE` | runtime | não | não | Estado interno de build do Next.js. |
| `NEXT_PUBLIC_APP_URL` | public | não | não | URL pública canônica da interface. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | não | não | Chave anon legada do Supabase para o navegador. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | não | não | Chave publishable do Supabase para o navegador. |
| `NEXT_PUBLIC_SUPABASE_URL` | public | **sim** | não | URL pública do projeto Supabase. |
| `NODE_APP_INSTANCE` | runtime | não | não | Identificador de processo gerenciado pelo PM2. |
| `NODE_ENV` | runtime | não | não | Estágio técnico gerenciado por Node/Next. |
| `OPENAI_API_KEY` | server | não | sim | IA comercial e raciocínio com dados pessoais governados. |
| `OPENAI_MODEL` | server | não | não | Grafia alternativa do modelo OpenAI, aceita como fallback de ATLAS_OPENAI_MODEL. |
| `OPENROUTER_API_KEY` | server | não | sim | Chave da camada gratuita de IA. Origem: OpenRouter (openrouter.ai/keys) — use modelos com sufixo :free. Sem custo até o teto do provedor — o teto é de |
| `PERPLEXITY_API_KEY` | server | não | sim | Pesquisa externa sem dados pessoais. |
| `QWEN_API_KEY` | server | não | sim | Provedor econômico opcional. |
| `SUPABASE_SERVICE_ROLE_KEY` | server | **sim** | sim | Acesso administrativo do servidor ao Supabase. |
| `SUPABASE_URL` | server | não | não | Alternativa exclusiva do servidor à NEXT_PUBLIC_SUPABASE_URL, usada por scripts de verificação. |
| `TELEGRAM_BOT_TOKEN` | server | não | sim | Token do bot de alerta INTERNO (equipe). Criado no @BotFather em minutos, sem custo. A mensagem enviada nunca contém dado pessoal de lead. |
| `TIKTOK_ADS_ACCESS_TOKEN` | server | não | sim | Conector futuro TikTok Ads. |
| `WHATSAPP_ACCESS_TOKEN` | server | não | sim | WhatsApp Cloud API oficial. |
| `WHATSAPP_NIGHTLY_APPROACH_TEMPLATE` | server | não | não | Template aprovado para abordagem noturna. |
| `WHATSAPP_PHONE_NUMBER_ID` | server | não | não | Número da WhatsApp Cloud API. |
| `WHATSAPP_TEST_RECIPIENT` | server | não | não | Destino exclusivo do ensaio de homologação. |
