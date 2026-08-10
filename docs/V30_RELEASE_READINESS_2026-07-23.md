# ATLAS V30 — Prontidão para teste real

**Data da auditoria:** 23/07/2026  
**Destino:** Hostinger, Node.js 24  
**Classificação canônica:** candidato local aguardando ambiente real

## Resultado executivo

O ATLAS V30 está consistente nos controles locais que não dependem de rede, navegador instalado, credenciais ou infraestrutura externa. O candidato atual ainda **não está autorizado para build final, ZIP novo ou produção**.

O estado canônico é:

- 26 de 30 fases aprovadas localmente: **86,7%**;
- 26 de 28 fases anteriores ao build aprovadas: **92,9%**;
- zero falha de código nos gates executáveis localmente;
- fase 26 aprovada com Node.js 24, Playwright 1.61.1 e Chromium;
- fases 27 e 28 aguardando ambiente real;
- fases 29 e 30 ainda não iniciadas;
- ZIP anterior rejeitado por ser anterior às correções e às evidências atuais.

## Evidências locais aprovadas

- TypeScript sem erros.
- ESLint sem erros e sem warnings.
- Testes unitários: 9/9.
- Lapidação V30: 94/94 controles.
- Grants explícitos do Supabase: 63/63 controles.
- Contrato de rotas ativas: 286 arquivos ativos, 136 páginas, 32 destinos, 78 links e zero erro bruto de banco exposto.
- Segurança de APIs: 150 rotas classificadas — 125 autenticadas, seis públicas, quatro de autenticação, dois webhooks e 13 workers.
- Evolução contínua: fases 1 a 101 verificadas.
- Observabilidade com logs correlacionados e sanitizados.
- Autenticação, pós-login, organização e RBAC aprovados em contrato local.
- Varredura de segredos sem credenciais persistidas.
- Arquitetura E2E aprovada e dependências de navegador instaladas.
- Consolidação local: 94 gates únicos, 88 executados com sucesso e zero falha.
- Performance estática: 360 chunks, 3.830.925 bytes; maior chunk com 465.641 bytes e 139.056 bytes compactados.

## Correções desta auditoria

1. Corrigido o consumo do envelope padronizado de API em oito telas. Elas recebiam `{ ok, data }`, mas tentavam renderizar o envelope completo.
2. Corrigida a leitura de mensagens de erro estruturadas para impedir objeto de erro chegando diretamente ao React.
3. Criado gate de regressão para os oito consumidores padronizados e para a exceção documentada de campanhas.
4. Sincronizados os inventários de navegação com a nova página de configuração do Pipeline e o onboarding seguro: 142 rotas CRM e 273 páginas totais.
5. Preservada a rastreabilidade entre a fundação da fase 43 e a evolução atual da fase 89.
6. Adicionada migration de grants explícitos para a Data API do Supabase, com RLS e separação entre acesso autenticado e `service_role`.

## Bloqueios externos atuais

- O registry npm está inacessível por DNS neste executor; a auditoria online de dependências não pôde ser atualizada. A tentativa autorizada fora do sandbox foi bloqueada por falha interna do revisor de execução, não pelo projeto.
- O navegador de E2E está instalado, mas este executor não recebeu permissão macOS para abrir o Chromium. Nenhuma falha da aplicação foi inferida.
- O `.env.local` foi preparado a partir do template e está ignorado pelo Git, mas ainda não contém Supabase, organização nem as quatro contas exclusivas de homologação.
- Supabase, Meta/CAPI, WhatsApp e provedores de IA não foram acionados nesta auditoria local.
- Não há URL Hostinger autenticável para coletar p95, Core Web Vitals e evidência móvel.
- Ainda não existe prova de backup e restauração do banco real.

## DDL antes do código

Antes de publicar qualquer código:

1. Fazer backup completo do Supabase.
2. Aplicar todas as migrations pendentes em ordem cronológica.
3. Confirmar a criação e o funcionamento de `atlas_events`.
4. Aplicar e verificar a migration `20260723090000_explicit_data_api_grants.sql`.
5. Recarregar o cache de schema.
6. Validar grants, RLS e isolamento com dois tenants de homologação.

## Ordem obrigatória para o teste real

1. Preencher os valores reais somente no `.env.local`/servidor seguro, nunca no chat.
2. Executar backup e restauração controlada.
3. Aplicar migrations e validar grants/RLS em dois tenants.
4. Executar jornadas autenticadas de administrador, diretor, gerente e corretor.
5. Percorrer uma lead real do Meta até o CRM e devolver eventos CAPI com deduplicação.
6. Testar WhatsApp oficial com consentimento, template aprovado e opt-out.
7. Testar uma chamada de IA controlada, custo, latência, fallback e persistência.
8. Registrar p95, Core Web Vitals e navegação móvel.
9. Obter decisão humana de homologação.
10. Executar o único build completo e, somente depois, gerar o ZIP Hostinger.

## Critério de liberação

O V30 só poderá avançar para a fase 29 quando as fases 27 e 28 tiverem evidências reais aprovadas. Abrir a interface, possuir um ZIP anterior ou encontrar variáveis declaradas não equivale a integração funcionando.

**Decisão local atual:** aprovado nos controles locais disponíveis.  
**Decisão de build/ZIP:** não autorizado.  
**Decisão de produção:** pendente de evidências reais.
