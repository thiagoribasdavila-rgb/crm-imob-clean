# Atlas AI — Entrega V1 + V2 para homologação

Status técnico em 2026-07-11.

## Quality gates

- Atlas V3 Release Gate: aprovado
- Atlas Security Gate: aprovado
- TypeScript: aprovado
- ESLint: aprovado
- Build de produção: aprovado
- Auditoria de dependências: aprovada
- Varredura de segredos: aprovada
- Guardrails de produção: aprovados

## V1 entregue

- autenticação, logout e recuperação de senha
- sessão protegida e rotas internas protegidas
- organizações, usuários, perfis, papéis e multiempresa
- dashboard executivo
- leads, Lead 360, score, temperatura, histórico e matching
- pipeline comercial
- clientes
- imóveis, empreendimentos e estoque
- tarefas, agenda e follow-up
- vendas, oportunidades, VGV e forecast
- relatórios, configurações, auditoria e qualidade de dados
- health, readiness, rate limiting, logs e RLS

## V2 entregue

- Command Center V2
- campanhas, CPL, CAC, ROAS, ROI e atribuição
- conversas omnichannel
- biblioteca de criativos
- regras de automação
- fila de aprovação humana
- envio governado de mensagens
- webhook Meta
- webhook WhatsApp
- outbox, retry, backoff e dead-letter queue
- integrações e feature flags
- status operacional V1 + V2

## Variáveis exigidas para homologação completa

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ATLAS_CRON_SECRET
- META_APP_SECRET
- META_WEBHOOK_VERIFY_TOKEN
- META_GRAPH_API_VERSION
- WHATSAPP_PHONE_NUMBER_ID
- WHATSAPP_ACCESS_TOKEN

Nunca versionar os valores dessas variáveis.

## Comandos oficiais

```bash
npm ci
npm run prisma:generate
npm run v1-v2:check
npm run dev
```

Em outro terminal:

```bash
npm run smoke:v1-v2
```

## Critério de aceite

A implementação técnica de V1 e V2 está concluída. A liberação para produção depende da homologação funcional com usuário, dados e credenciais reais, incluindo login, CRUD, pipeline, isolamento multiempresa, mensagens, webhooks, mobile e persistência.
