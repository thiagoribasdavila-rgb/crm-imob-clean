# Atlas Meta Signal Intelligence — Fase 6/100

## Preflight executável do bridge em ambiente isolado

**Resultado:** o Atlas agora possui um gate executável e fail-closed para validar o futuro bridge Meta antes de qualquer migration ou acesso ao banco publicado.

O preflight não recebe URL do Supabase, `service_role`, dados pessoais ou identificadores reais. Ele opera exclusivamente sobre um snapshot sanitizado de schema e encerra com erro quando encontra estado desconhecido.

## O que o preflight valida

1. Existência das fontes canônicas `crm_projects`, `marketing_campaigns`, `leads` e `profiles`.
2. Ausência de tabelas duplicadas `developments` e `campaigns`.
3. Existência dos dez objetos definidos na matriz da Fase 5.
4. Compatibilidade exata entre exposição na Data API e contrato.
5. Grants explícitos e mínimos para `anon`, `authenticated` e `service_role`.
6. RLS em todas as tabelas expostas.
7. Views de compatibilidade com `security_invoker` e RLS nas tabelas de origem.
8. Funções privilegiadas apenas no schema privado.
9. `search_path` vazio, verificação de usuário e execução pública revogada em `security definer`.
10. Índices essenciais para tenant, lead, idempotência e outbox.
11. Isolamento entre organizações.
12. Bloqueio de escrita direta por usuário autenticado.

## Prova de fail-closed

Além do cenário válido, o gate injeta sete falhas controladas e exige que todas sejam rejeitadas:

- objeto obrigatório ausente;
- RLS desligado;
- `select` concedido a `anon`;
- `insert` direto concedido a `authenticated`;
- `security_invoker` desligado;
- `search_path` inseguro em `security definer`;
- linha de outro tenant visível.

Se uma dessas falhas não for detectada, a Fase 6 reprova.

## Como executar

```bash
npm run meta:phase-006:preflight
```

Para validar outro snapshot sanitizado:

```bash
node scripts/preflight-meta-bridge-isolated.mjs --snapshot caminho/do/snapshot.json --self-test
```

O snapshot aceito deve declarar `isolated_fixture` ou `staging_snapshot`. Qualquer outro ambiente é recusado.

## Limite deliberado desta fase

O fixture aprovado demonstra que o contrato e seu verificador funcionam; ele não declara que o banco publicado já possui o bridge. A liberação de migration continua exigindo:

- coleta somente leitura do schema real;
- sanitização sem valores de negócio;
- comparação com este preflight;
- clone de staging;
- backup e ensaio de restauração;
- aprovação humana.

O Supabase recomenda testes automáticos para estrutura, RLS e integridade antes de mudanças: [Testing Your Database](https://supabase.com/docs/guides/database/testing). A Data API continua exigindo grants e RLS como controles separados: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api).

## Estado da homologação

- Contrato da Fase 5: carregado.
- Fixture ideal: aprovada.
- Sete falhas controladas: rejeitadas.
- Conexão remota: não realizada.
- Chave privilegiada: não utilizada.
- Migration: não criada nem aplicada.
- Build: não executado.
- Produção: bloqueada.

## Próxima etapa — Fase 7/100

Criar o coletor somente leitura que produz um snapshot sanitizado do schema real e compará-lo com este preflight. A coleta deverá exportar apenas estrutura, políticas, grants, funções e índices — nunca linhas comerciais, credenciais ou identificadores de ativos.
