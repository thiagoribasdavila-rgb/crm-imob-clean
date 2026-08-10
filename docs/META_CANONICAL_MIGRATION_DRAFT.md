# ATLAS AI OS — Fase 11/100

## Migração canônica versionada e testes locais

Esta fase transforma os bloqueios identificados na Fase 10 em um rascunho de migração corretiva, rastreável e testável. O arquivo foi criado pelo Supabase CLI, mas permanece fora de `supabase/migrations/`. Portanto, ele não participa de um deploy ou `db push` por engano.

## Estado da entrega

- Rascunho criado pelo Supabase CLI e guardado em `supabase/migration-drafts/`.
- Fila ativa de migrations permanece limpa para esse timestamp.
- Nenhuma conexão com banco remoto foi aberta.
- Nenhum dado comercial ou pessoal foi lido.
- Nenhuma migration foi aplicada.
- Nenhuma campanha, público, orçamento ou evento real da Meta foi alterado.
- Nenhum build foi executado nesta fase.

O resultado é um artefato **verificado offline**, ainda bloqueado para staging e produção.

## Contratos reconciliados

O rascunho trata os pares usados simultaneamente pelo legado e pelo contrato canônico:

| Domínio | Legado | Canônico | Regra temporária |
| --- | --- | --- | --- |
| Responsável | `assigned_user_id` | `assigned_to` | sincronizar e rejeitar divergência |
| Projeto | `project_id` | `development_id` | sincronizar e rejeitar divergência |
| Score | `score_ia` | `score` | preservar valor legado, sincronizar e limitar entre 0 e 100 |

O erro histórico em que o `score = 0` podia esconder um `score_ia` válido foi corrigido pela ordem da operação: o default e o `not null` são retirados antes do backfill e restaurados somente depois da verificação.

## Papéis, nomes e hierarquia

- Papéis conhecidos são convertidos para o contrato comercial.
- Papel desconhecido bloqueia toda a transação; não vira corretor silenciosamente.
- Divergência entre nomes ou papéis existentes bloqueia a transação.
- `reports_to` não é inferido. A hierarquia depende de mapa humano aprovado.

## Segurança e Data API

O rascunho mantém RLS habilitado e registra privilégios explícitos para a Data API. Privilégios e políticas RLS continuam sendo gates diferentes: ambos precisarão ser comprovados em banco isolado antes da promoção.

A migration também contém:

- transação única;
- `lock_timeout` e `statement_timeout`;
- trava obrigatória para `staging_clone`;
- ausência de `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` e `DELETE`;
- função de compatibilidade com `security invoker` e `search_path` controlado;
- rejeição explícita de conflitos durante insert e update.

## Testes executados

Foram aprovados 19 testes locais com dados sintéticos e sem PII:

- escrita pelo contrato legado;
- escrita pelo contrato canônico;
- sincronização nos dois sentidos;
- rejeição de alteração conflitante;
- correção do zero mascarado no score;
- rejeição de score fora da faixa;
- conversão de papéis conhecidos;
- rejeição de papel desconhecido.

A auditoria estática também aprovou a ordem do backfill, o gatilho de compatibilidade, a trava de staging, RLS, privilégios e a ausência de operações destrutivas.

## O que ainda não está comprovado

Testes JavaScript não substituem a semântica real do PostgreSQL. A migration continua bloqueada até que um ambiente efêmero e isolado com seed sanitizado comprove:

1. fingerprint do schema e backup restaurável;
2. execução transacional integral;
3. contagem e conteúdo do backfill;
4. sincronização bidirecional no banco;
5. aprovação humana de papéis e hierarquia;
6. grants da Data API;
7. isolamento RLS entre organizações;
8. rollback sem perda de dados;
9. aprovação do diretor e da revisão de segurança.

O preflight possui 26 cenários fail-closed. A ausência de qualquer evidência impede a aprovação.

## Fase 12/100

Executar a semântica em um PostgreSQL efêmero e sanitizado, sem usar produção. Somente após a matriz completa e as aprovações a migration poderá sair de `migration-drafts/` e entrar na fila ativa.
