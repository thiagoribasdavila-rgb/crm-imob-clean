# ATLAS AI OS — Fase 21/24

## Objetivo

Criar um gate fail-closed para autoria de uma migration local do Supabase, sem
executar a CLI, gravar SQL ou acessar qualquer ambiente remoto nesta fase.

## Fluxo controlado

1. A Fase 20 precisa produzir uma especificação real, sanitizada e aprovada.
2. Um revisor emite autorização curta, de uso único e vinculada por SHA-256.
3. O inventário atual de migrations é fixado por manifesto antes da autoria.
4. O gate prepara em memória os comandos exatos e o plano de verificação.
5. Somente depois da aprovação completa poderá ser usado
   `supabase migration new atlas_security_remediation`.
6. Testes e lint deverão usar explicitamente `--local`.

## Proteções

- arquivos de migration existentes são imutáveis;
- `--linked`, `db push` e `migration repair` são bloqueados;
- nenhuma migration é aplicada;
- nenhuma linha de negócio, Auth ou objeto de Storage é lido;
- rollback revisado e ponto de restauração são obrigatórios;
- credenciais e saída bruta da CLI não entram na evidência.

## Testes negativos obrigatórios

O catálogo cobre negação de CRUD anônimo, isolamento CRUD entre tenants,
permissões positivas do proprietário, bloqueio de troca de tenant, grants da
Data API em conjunto com RLS, views com identidade do chamador, funções
privilegiadas e ausência de segredo de service role no cliente.

Grants e RLS são controles separados: a exposição pela Data API exige
privilégio explícito e a política de linha ainda precisa restringir quais
registros o papel pode acessar.

## Comandos previstos, não executados nesta fase

```text
supabase migration new atlas_security_remediation
supabase test db --local
supabase db lint --local --level error
```

## Referências oficiais

- [CLI e migrations](https://supabase.com/docs/reference/cli/supabase-start)
- [Fluxo local com CLI](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Testes locais](https://supabase.com/docs/guides/local-development/testing/overview)
- [pgTAP e lint](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Changelog Supabase](https://supabase.com/changelog)

## Próxima etapa

Fase 22/24: com artefatos reais e autorização válida, ensaiar localmente em
banco descartável, executar pgTAP e lint `--local`, validar rollback e continuar
sem acesso linked ou aplicação remota.
