# ATLAS AI OS — Fase 34/100

## Objetivo

Criar uma matriz objetiva e verificável de prontidão para migração da amostra 02. A matriz transforma o recibo somente leitura da Fase 33 em controles de evidência, sem conectar ao banco, Supabase remoto, Meta ou campanhas e sem executar build.

## Problema resolvido

Uma conciliação local entre PostgreSQL 15 e 17 não basta para autorizar staging ou produção. Era necessário separar claramente:

- evidências técnicas já demonstradas em ensaio local;
- evidências operacionais ainda ausentes;
- autorização humana de mudança;
- compatibilidade de produção, que continua não comprovada.

## Matriz de 15 controles

Somente após receber um recibo válido `phase33.cross-major-reconciliation.v1`, a Fase 34 herda cinco controles:

1. integridade da cadeia de evidências;
2. equivalência dos artefatos entre os majors;
3. equivalência de segurança;
4. equivalência de rollback;
5. compatibilidade das extensões revisadas.

Antes de qualquer migração ainda faltam dez controles:

1. backup imutável verificado;
2. ensaio de restauração verificado;
3. replay em staging isolado verificado;
4. integridade de dados verificada;
5. baseline de desempenho verificada;
6. observabilidade pronta;
7. Security Advisor verificado;
8. Performance Advisor verificado;
9. runbook de rollback de produção verificado;
10. aprovação humana da mudança verificada.

## Como interpretar o percentual

Com um recibo real e aprovado da Fase 33, a cobertura máxima desta fase é `5/15 = 33%`. Esse número mede somente cobertura documental de evidências. Ele **não** significa prontidão de produção, probabilidade de sucesso, autorização de staging ou autorização de migração.

Sem o recibo real da Fase 33, a cobertura operacional atual permanece em `0/15 = 0%`.

## Comportamento fail-closed

O avaliador rejeita:

- arquivo fora do workspace, link simbólico ou arquivo acima de 1 MiB;
- schema, fase, status, imagem ou major divergente;
- conjunto de hashes incompleto ou inválido;
- ausência de segurança, rollback, equivalência ou compatibilidade de extensões;
- qualquer alegação de compatibilidade de produção;
- credenciais, tokens, URLs de conexão ou valores sensíveis;
- qualquer recibo que alegue acesso remoto, Meta ou build.

Mesmo com fonte válida, `stagingMigrationAllowed`, `productionMigrationAllowed` e `productionCompatibilityApproved` permanecem `false`.

## Estado desta fase

- contrato estático da matriz: **preparado**;
- autotestes negativos e fail-closed: **preparados**;
- avaliador somente leitura: **preparado**;
- workflow manual encadeado: **preparado**;
- recibo real da Fase 33: **não recebido**;
- avaliação real: **não foi executada**;
- cobertura operacional atual: **0%**;
- banco local, remoto ou produção: **não tocados**;
- Supabase remoto, Meta e campanhas: **não tocados**;
- staging e produção: **bloqueados**;
- build: **não executado**.

## Referências oficiais consultadas em 19/07/2026

- [Checklist para produção](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Migrations de banco](https://supabase.com/docs/guides/deployment/database-migrations)
- [Gerenciamento de ambientes](https://supabase.com/docs/guides/deployment/managing-environments)
- [Upgrade self-hosted para PostgreSQL 17](https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17)
- [Mudança self-hosted PostgreSQL 15 para 17](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)

O checklist oficial recomenda proteção de dados, segurança, desempenho e observabilidade antes da produção. A documentação de migrations recomenda testar em ambiente local e trabalhar com ambientes separados. Por isso a matriz não converte evidência local em autorização automática.

## Próxima etapa recomendada

A Fase 35 poderá preparar apenas o contrato de um ensaio de restauração em staging isolado e descartável. Ela continua bloqueada até existirem recibo real da Fase 33, backup imutável verificável, plano de restauração/rollback e aprovação humana explícita. Nenhuma conexão ou migração será iniciada automaticamente.
