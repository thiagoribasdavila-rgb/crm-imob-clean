# Fase 019 — Correção das evidências de schema

## Resultado

A auditoria deixou de tratar o primeiro `42703` como diagnóstico completo. Ela agora verifica tabelas e colunas sem retornar registros, informa todas as lacunas do contrato V3 e não presume que a hierarquia comercial exista.

O banco publicado **não foi alterado**. A leitura segura confirmou que `profiles` e `leads` ainda usam o contrato legado. Nenhum nome, e-mail, telefone ou outro dado de cliente foi impresso.

As quatro contas autenticadas possuem seus quatro perfis correspondentes. Esse resultado confirma a integridade básica de autenticação, mas não aprova a hierarquia: `access_role`, `commercial_role` e `reports_to` ainda não existem no ambiente conectado.

## Risco encontrado

`20260711040000_atlas_v3_foundation.sql` documenta uma aplicação remota anterior, mas não contém o DDL completo dessa fundação. Portanto, a cadeia histórica ainda não é comprovadamente reproduzível em um banco vazio.

Não executar `supabase db push` diretamente em produção. A existência de arquivos de migração não prova que a história remota esteja reconciliada.

## Sequência segura obrigatória

1. Criar e verificar backup do banco publicado.
2. Comparar a história de migrações local e remota.
3. Reproduzir a cadeia completa em staging separado.
4. Executar `npm run audit:runtime-schema` e `npm run audit:auth-hierarchy` em staging.
5. Validar login, RLS, perfis e dados reais no staging.
6. Solicitar aprovação explícita antes da produção.
7. Aplicar somente a migração aprovada e repetir as auditorias somente leitura.

## Gate da próxima fase

A Fase 020, homologação da onda, permanece pendente até que as duas auditorias retornem `PRONTO` no ambiente de staging e depois no ambiente publicado, sem perda de registros e sem ampliação indevida de permissões.
