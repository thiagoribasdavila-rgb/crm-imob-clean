# ATLAS AI OS — Fase 22/24

## Objetivo

Preparar o primeiro ensaio descartável e determinístico da migration de
segurança da Fase 21. Esta entrega define e valida o contrato; ela não inicia Docker,
não cria banco local, não aplica migration e não acessa Supabase
remoto.

## Estado real

O gate está bloqueado por três entradas ausentes:

1. recibo sanitizado da autoria local da Fase 21;
2. autorização humana da Fase 22, de uso único e validade máxima de 30 minutos;
3. `supabase/config.toml` revisado para o ambiente isolado.

Sem as três entradas, nenhum plano executável é gerado. O bloqueio é
fail-closed.

## Isolamento obrigatório

- workdir: `.atlas/runtime/phase-022/rehearsal`;
- project-id: `atlas-phase-022-rehearsal`;
- somente banco local descartável;
- fixtures sintéticas, sem seed e sem linhas de negócio/Auth;
- tráfego externo desabilitado;
- nenhuma expectativa de TLS ou hardening de produção no stack local;
- limpeza direcionada ao project-id; nunca `--all`.

O stack local serve para desenvolvimento e teste. Ele não representa as
proteções de um projeto hospedado e não deve ser exposto à internet.

## Ciclo previsto

1. preparar baseline sem a nova migration;
2. iniciar apenas o banco local;
3. resetar o baseline explicitamente com `--local --no-seed`;
4. capturar fingerprints do schema e do histórico;
5. posicionar a única migration e o pgTAP autorizados;
6. aplicar a migration pendente somente localmente;
7. executar os 18 testes pgTAP;
8. executar lint local com falha em nível `error`;
9. capturar fingerprints pós-migration;
10. destruir o volume descartável;
11. reconstruir o baseline sem a nova migration;
12. confirmar a restauração dos fingerprints e repetir os testes de baseline;
13. destruir o volume e o workdir isolados.

## Comandos permitidos pelo contrato

Os tokens abaixo foram validados contra a CLI Supabase 2.109.1, mas **não foram
executados nesta fase**:

```text
supabase db start --workdir .atlas/runtime/phase-022/rehearsal
supabase db reset --local --no-seed --workdir .atlas/runtime/phase-022/rehearsal
supabase migration up --local --workdir .atlas/runtime/phase-022/rehearsal
supabase test db --local supabase/tests/atlas_security_remediation_test.sql --workdir .atlas/runtime/phase-022/rehearsal
supabase db lint --local --level error --fail-on error --workdir .atlas/runtime/phase-022/rehearsal
supabase stop --project-id atlas-phase-022-rehearsal --no-backup --workdir .atlas/runtime/phase-022/rehearsal
```

## Cobertura

O pgTAP exigido cobre:

- negação de CRUD para `anon`;
- negação de CRUD entre tenants;
- CRUD permitido somente ao proprietário autorizado;
- proibição de trocar o tenant da linha;
- grants explícitos da Data API em conjunto com RLS;
- views com `security_invoker`;
- bloqueio de execução pública de função privilegiada;
- ausência do segredo de `service_role` no cliente.

Grants e RLS continuam controles distintos. O papel precisa de privilégio de
objeto para alcançar a tabela pela Data API e, ainda assim, a política RLS
precisa autorizar a linha.

## Rollback verificável

Rollback nesta etapa não significa produzir SQL inverso. O único rollback
aceito é:

1. destruir o volume local isolado;
2. reconstruir o baseline limpo, sem a migration ensaiada;
3. comparar fingerprints SHA-256 de schema e histórico;
4. repetir a verificação de segurança;
5. limpar somente `atlas-phase-022-rehearsal`.

Isso evita alegar reversibilidade sem prova e impede que a restauração alcance
dados reais.

## Referências oficiais

- [Supabase CLI: desenvolvimento local](https://supabase.com/docs/reference/cli/supabase-start)
- [Fluxo local e migrations](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Visão geral de testes locais](https://supabase.com/docs/guides/local-development/testing/overview)
- [pgTAP e lint](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Changelog oficial do Supabase](https://supabase.com/changelog)

## Próxima etapa

Fase 23/24: após um ensaio explicitamente autorizado, consolidar apenas
evidência sanitizada de pgTAP, lint, fingerprints e cleanup para decisão
humana de homologação. Projeto linked e produção continuam fora do escopo.
