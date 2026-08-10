# ATLAS V30 — Auditoria de lapidação antes do teste real

**Data:** 23/07/2026  
**Escopo:** aplicação, banco, APIs, autenticação, integrações, experiência, performance e empacotamento  
**Objetivo:** distinguir produto comprovado localmente de integrações ainda não testadas no ambiente real

## Veredito

O projeto está em **86,7% do programa total** e em **92,9% da preparação anterior ao build**. O código local está sem falhas conhecidas nos gates executáveis, mas o produto ainda não pode ser chamado de 10/10 porque as provas que mais importam para operação real continuam pendentes.

| Dimensão | Situação | Nota atual |
| --- | --- | ---: |
| Código, tipos e lint | Aprovado localmente | 10/10 |
| Contratos de API e rotas | Aprovado após correções | 9,5/10 |
| Autenticação e RBAC | Contrato local aprovado; jornada real pendente | 8/10 |
| Supabase e modelo de dados | Migration e grants preparados; aplicação real pendente | 7/10 |
| CRM e Pipeline | Funcionalidade ampla e protegida; E2E pendente | 8,5/10 |
| Meta/CAPI | Arquitetura e gates prontos; lead real e Events Manager pendentes | 6/10 |
| WhatsApp | Governança preparada; template e número real pendentes | 6/10 |
| IA | Orquestração, memória e fallback preparados; provedor real pendente | 7/10 |
| Performance | Pacote estático otimizado; p95 e CWV pendentes | 8/10 |
| Operação Hostinger | Contratos preparados; deploy, PM2 e recuperação pendentes | 5/10 |

As notas de integrações não significam baixa cobertura de código. Elas refletem ausência de evidência externa — uma integração só é considerada ativa depois de produzir e receber dados reais.

## O que estava escondido e foi corrigido

### 1. Envelope de API incompatível com oito telas

O helper padronizado responde:

```text
{ ok: true, data: ... }
```

Oito páginas atribuíam o envelope completo ao estado que esperava apenas `data`. Isso podia quebrar ou esvaziar dossiê, estudo regional, homologação, registro de projetos, atribuição, comportamento, preferências e deduplicação.

As telas agora usam `payload.data`, leem `payload.error?.message` e possuem prova automática contra regressão.

### 2. Governança da Data API do Supabase

Foi criada a migration:

```text
supabase/migrations/20260723090000_explicit_data_api_grants.sql
```

Ela revoga privilégios implícitos, libera ao usuário autenticado somente as tabelas de leitura protegidas por RLS e mantém operações administrativas no servidor. O contrato possui 63 verificações aprovadas.

### 3. Inventários de navegação desatualizados

A nova configuração do Pipeline alterou a topologia do produto. Os inventários antigos esperavam 141 rotas CRM e 271 páginas totais. O estado real possui:

- 142 rotas CRM;
- 72 rotas profundas de suporte;
- 273 páginas totais;
- 104 superfícies contextuais.

Os contratos e a documentação foram sincronizados sem apagar os marcos históricos.

### 4. Documento de release contraditório

O relatório anterior afirmava que o build estava concluído e o ZIP estava permitido. O estado canônico registra `buildExecuted: false`, `packageCreated: false` e rejeita o artefato anterior. O relatório foi corrigido para impedir publicação acidental de pacote obsoleto.

## O que ainda ficou de fora

### Prioridade zero — antes de qualquer ZIP

1. Preencher o ambiente de homologação isolado com variáveis reais no servidor.
2. Executar as jornadas completas com Playwright e Chromium já instalados.
3. Executar a auditoria online de dependências quando o executor tiver acesso ao registry npm.
4. Aplicar todas as migrations, grants e RLS no Supabase após backup.
5. Comprovar isolamento entre dois tenants.
6. Testar login, recuperação, pós-login e escopo dos quatro perfis.
7. Comprovar backup, restauração e reinício do PM2.

### Prioridade zero — conversão e receita

1. Receber uma lead real do Meta Lead Ads.
2. Validar atribuição, `event_id`, deduplicação browser/servidor e qualidade no Events Manager.
3. Devolver ao Meta os marcos de lead qualificada, visita, proposta e venda.
4. Testar template oficial do WhatsApp, consentimento, opt-out e janela de conversa.
5. Testar OpenAI e provedores de fallback com custo e latência limitados.
6. Confirmar que nenhuma automação envia mensagem ou altera campanha sem aprovação humana.

### Polimento após o primeiro teste real

- Substituir diálogos nativos ainda presentes em homologação, aceite, saúde Hostinger, sessões e experimentos por modais acessíveis.
- Verificar foco inicial, contenção de foco e tecla Escape em todos os modais novos.
- Dividir `app/(crm)/pipeline/page.tsx`, atualmente com 3.392 linhas, em domínios menores depois de congelar o comportamento aprovado no E2E.
- Automatizar a atualização dos inventários de rota para reduzir manutenção manual sem perder o gate de mudança intencional.
- Eliminar gradualmente as rotas legadas em quarentena após confirmar equivalência funcional.

## Provas locais atuais

- Consolidação: 94 gates únicos, 88 executados com sucesso e zero falha.
- Playwright/Chromium: dependências aprovadas.
- Lapidação: 94/94.
- Grants Supabase: 63/63.
- Testes unitários: 9/9.
- TypeScript: aprovado.
- ESLint: aprovado, zero warnings.
- Segurança de APIs: 150 rotas classificadas.
- Segredos: nenhum valor real encontrado no código.
- Rotas ativas: zero colisão e zero erro bruto de banco exposto.
- Evolução 1–101: aprovada.
- Performance estática: 3.830.925 bytes em 360 chunks.

O `release:prebuild-check` chegou à auditoria de dependências e foi interrompido somente porque o registry externo não pode ser consultado neste executor. Os gates posteriores foram executados separadamente e aprovados.

## Sequência para chegar a 10/10

1. Resolver fase 27: jornadas reais por perfil e integração.
2. Resolver fase 28: segurança, carga, backup e recuperação.
3. Revisar as evidências com decisão humana.
4. Executar fase 29: único build limpo e pacote Hostinger.
5. Executar fase 30: deploy, smoke real e promoção controlada.

## Decisão

- **Código local:** aprovado.
- **Candidato para teste real:** aprovado após preparar o ambiente.
- **Build final:** ainda não autorizado.
- **ZIP novo:** ainda não autorizado.
- **Produção:** ainda não autorizada.

O caminho mais rápido não é adicionar novas telas. É fechar as três provas restantes e medir uma jornada completa de receita: **Meta → CRM → corretor/IA → visita/proposta/venda → CAPI**.
