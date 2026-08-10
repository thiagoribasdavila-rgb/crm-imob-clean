# ATLAS AI OS — Fase 33/100

## Objetivo

Conciliar, de forma somente leitura, as evidências dos ensaios locais PostgreSQL 15 e PostgreSQL 17 da amostra 02. Esta fase transforma três arquivos separados em um recibo único, sanitizado e verificável, sem acessar banco, Docker, Supabase remoto, Meta ou campanhas.

## Problema resolvido

Uma migration executar isoladamente em dois bancos não comprova que os dois ensaios usaram os mesmos artefatos, que preservaram as mesmas proteções ou que destruíram corretamente os runtimes. A Fase 33 valida toda a cadeia e rejeita qualquer divergência antes de produzir uma comparação.

## Cadeia de evidências

O reconciliador exige, simultaneamente:

1. `phase31.runtime-evidence.v1`, originada no ensaio PostgreSQL 15 da Fase 30;
2. `phase31.runtime-reconciliation.v1`, com o hash exato da evidência anterior;
3. `phase32.pg17-compatibility-evidence.v1`, originada em volume PostgreSQL 17 novo;
4. os hashes encadeados da Fase 30 e do recibo da Fase 31 dentro da evidência da Fase 32;
5. os mesmos hashes de baseline, migration, verificação de segurança, rollback e limpeza nos dois ensaios.

Qualquer ausência, link simbólico, arquivo fora do workspace, arquivo maior que 1 MiB, segredo, evento fora de ordem ou hash divergente reprova a conciliação.

## Comparação formal

O recibo `phase33.cross-major-reconciliation.v1` registra somente:

- major e imagem fixada de cada runtime;
- aprovação do runtime local;
- equivalência dos artefatos compartilhados;
- verificação de segurança nos dois majors;
- rollback e destruição dos volumes;
- ausência das extensões incompatíveis revisadas;
- hashes dos três arquivos de origem.

O recibo nunca contém credenciais, URLs de conexão ou conteúdo de clientes.

## Limite de aprovação

`crossMajorApproved` significa apenas que os dois ensaios locais, efêmeros e isolados apresentaram evidências equivalentes e íntegras. Ele **não** significa compatibilidade de produção. Por isso, `productionCompatibilityApproved` permanece sempre `false` nesta fase.

## Estado desta fase

- contrato estático de comparação: **preparado**;
- validação negativa e fail-closed: **preparada**;
- workflow manual encadeado: **preparado**;
- evidência real PostgreSQL 15: **não recebida**;
- recibo real da Fase 31: **não recebido**;
- evidência real PostgreSQL 17: **não recebida**;
- conciliação real: **não foi executada**;
- banco local/remoto/produção: **não tocado nesta fase**;
- Supabase remoto e Meta: **não tocados**;
- permissão ou campanha: **não alterada**;
- build: **não executado**.

O ambiente atual não possui Docker. Assim, nenhuma compatibilidade operacional foi presumida ou aprovada.

## Segurança aplicada

- leitura restrita a arquivos regulares dentro do workspace;
- rejeição de links simbólicos;
- limite individual de 1 MiB;
- conferência do hash do conteúdo bruto, sem normalização silenciosa;
- validação de imagens, majors, alvos distintos, eventos e artefatos;
- detecção de chaves e valores sensíveis;
- saída local com permissão `0600`;
- zero conexão de banco, rede, Supabase, Meta ou Docker;
- zero build.

## Referências oficiais consultadas em 19/07/2026

- [Mudança self-hosted do PostgreSQL 15 para 17](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)
- [Testes e linting local do banco](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Testes de banco com pgTAP](https://supabase.com/docs/guides/database/testing)
- [Migrations de banco](https://supabase.com/docs/guides/deployment/database-migrations)

O Supabase informa que o PostgreSQL 17 tornou-se o padrão self-hosted, que o diretório físico PostgreSQL 15 não pode ser lido diretamente pelo PostgreSQL 17 e que `timescaledb`, `plv8`, `plcoffee` e `plls` exigem tratamento nesse caminho. Por isso os runtimes permanecem distintos e o volume PostgreSQL 15 nunca é reutilizado.

## Próxima etapa recomendada

Executar o workflow manual em ambiente isolado com Docker. Somente após o recibo real da Fase 33 ser aprovado, a Fase 34 poderá preparar uma matriz de prontidão para migração. Produção, Meta, permissões e campanhas continuarão bloqueados até aprovação humana e evidência própria.
