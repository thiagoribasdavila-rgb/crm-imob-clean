# Fundação técnica F02–F16

## Resultado

O coordenador da **Fundação técnica F02–F16** separa os dois bloqueios que
precisam ser resolvidos antes da mesa de decisão F17–F21:

1. recuperação comprovada do Atlas V3;
2. captura e ensaio de segurança em Supabase local descartável.

Ele não soma percentuais incompatíveis nem interpreta arquivos vazios como
progresso. Cada fase mantém seus próprios gates e a cadeia apresenta o primeiro
bloqueio de cada trilha.

## Estado medido

### Trilha de recuperação

- F02: 0/7 controles, bloqueada.
- Falta comprovar restauração do banco e do Storage.
- Falta validar um pacote imutável da versão V3 anterior com login autenticado.
- Faltam métricas RTO/RPO e decisão humana.
- O V2 legado não é aceito como rollback.

### Trilha de migration local

- F12: 15/28 gates, 54%.
- F13: 4/32 gates, 13%.
- F14: 6/21 gates, 29%.
- F15: 13/40 gates, 33%.
- F16: 10/49 gates, 20%.

O primeiro bloqueio continua sendo a F12. O projeto possui Supabase CLI 2.109.1
e os contratos de segurança. O bootstrap local foi autorizado, executado e
reconciliado por pós-condição: o `supabase/config.toml` existe, declara
PostgreSQL 17, preserva as 124 migrations, não contém segredo literal e não
possui marcador de vínculo remoto.

Ainda faltam:

- runtime de containers disponível e respondendo;
- `psql`;
- PostgreSQL 17 descartável em loopback;
- autorização curta vinculada por fingerprint ao alvo local;
- captura `schema-only` aprovada.

F13–F16 estão bloqueadas por consequência. Elas não devem ser “corrigidas” com
dados inventados ou migrations criadas antes do snapshot.

## Fluxo seguro

1. Executar o ensaio isolado de restauração F02.
2. Preservar a evidência aceita do bootstrap local já concluído.
3. Preparar uma stack Supabase local descartável para a F12.
4. Capturar somente o schema `public`, sem linhas comerciais ou de autenticação.
5. Inventariar RLS, `GRANT`, ACL, views, funções e políticas na F13.
6. Gerar backlog determinístico e não aprovado na F14.
7. Após aprovação humana, gerar somente o manifesto local F15.
8. Autorizar um único ensaio F16 com migration, pgTAP, lint e advisors locais.
9. Encaminhar as evidências para F17–F21 e depois para o preflight F22.

## Segurança Supabase

A documentação atual do Supabase confirma que o desenvolvimento local começa
com `supabase init` e que a stack local depende de um runtime compatível com
Docker. A inicialização do banco não será feita automaticamente por este coordenador,
pois o alvo descartável e o ambiente precisam ser preparados de forma
consciente:

- [Supabase CLI](https://supabase.com/docs/reference/cli/supabase-start)
- [Desenvolvimento local com Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

O gate separado torna essa preparação reproduzível sem ampliar autorização:

```bash
npm run atlas:supabase-bootstrap:assess
npm run atlas:supabase-bootstrap:check
```

Ele não cria aprovação, não usa `--force` e não executa `start`, `link`,
migration, build ou ZIP.

RLS e privilégios da Data API são gates independentes. Desde a alteração
documentada pelo Supabase em 2026, novas tabelas não são expostas
automaticamente por `GRANT`; portanto, ter RLS não prova por si só que a Data API
está configurada corretamente:

- [Alteração de GRANTs explícitos na Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

## O que este coordenador não faz

- não acessa projeto Supabase vinculado;
- não lê ou escreve banco remoto;
- não inicia banco local;
- não cria aprovação em nome de uma pessoa;
- não gera ou aplica migration;
- não lê registros comerciais ou usuários de autenticação;
- não executa build;
- não cria ZIP;
- não publica na Hostinger.

Ausência de evidência nunca conta como aprovação. Migrations históricas são
referência local, não prova do estado efetivo do banco.

## Uso

```bash
npm run atlas:upstream-readiness:assess
npm run atlas:upstream-readiness:check
```

A evidência consolidada fica em:

```text
artifacts/runtime/human-gates/f02-f16-upstream-readiness-evidence.json
```

## Critério de avanço

A trilha de recuperação precisa concluir F02, e a trilha local precisa concluir
F12–F16. Somente depois disso a mesa F17–F21 pode receber evidências reais.
Qualquer aplicação remota continua exigindo uma nova autorização explícita.
