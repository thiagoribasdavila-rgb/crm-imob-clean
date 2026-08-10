# ATLAS — Atestação de preflight da branch isolada

> Este documento nunca deve conter project ref, URL, chave, connection string,
> nome de pessoa, linha comercial, registro de `auth.users`, objeto do Storage,
> SQL bruto ou saída bruta da CLI.

## 1. Permissão humana de uso único

- Status: `approved_for_isolated_read_only_preflight`
- Escopo: `isolated_supabase_branch_read_only_metadata_and_catalog`
- Validade máxima: 30 minutos
- Uso único: sim
- Consumida: não
- Revisor opaco:
- Change ticket:
- SHA-256 do dossiê F17:
- SHA-256 do descritor sanitizado do alvo:

### Autorizações

- Ler saúde e metadados da branch isolada: sim
- Ler catálogo, ledger de migrations e resumos dos advisors: sim
- Ler linhas comerciais, `auth.users` ou objetos do Storage: não
- Persistir saída bruta: não
- Aplicar migration, DDL, DML, `db push` ou `migration repair`: não
- Criar, atualizar, pausar, mesclar ou apagar branch: não
- Acessar produção ou main: não

## 2. Observação sanitizada

- Status: `isolated_branch_preflight_observed`
- PostgreSQL major: 17
- Supabase CLI: 2.109.1
- Saúde após observação: `preflight_observed`
- Permit consumido: sim
- Somente metadados: sim

### Checks capturados

- Reachability:
- Isolamento:
- Ledger de migrations:
- Postura RLS:
- Grants da Data API:
- Políticas UPDATE:
- Segurança de views:
- Funções `SECURITY DEFINER`:
- Advisors de segurança:
- Advisors de performance:

Use apenas `captured` ou `not_captured`. Findings são contagens sanitizadas,
não nomes de objetos.

### Contagens sanitizadas

- Migrations:
- Tabelas expostas:
- Tabelas com RLS:
- Tabelas sem RLS:
- Findings de grants:
- Findings de UPDATE:
- Findings de views:
- Findings de `SECURITY DEFINER`:
- Findings dos advisors de segurança:
- Findings dos advisors de performance:

### Fingerprints

- Catálogo SHA-256:
- Ledger SHA-256:
- Advisors SHA-256:

## 3. Declaração final

- Nenhuma linha comercial ou de autenticação foi consultada.
- Nenhum segredo, identificador bruto ou dado pessoal foi persistido.
- Nenhum comando remoto de escrita foi executado.
- Nenhuma migration foi aplicada.
- Nenhuma branch foi criada, alterada, mesclada ou apagada.
- Produção e main não foram tocadas.
- Build não foi executado.
- ZIP não foi criado.

Esta atestação comprova somente uma observação read-only. Ela não aprova
remediação, aplicação de migration, promoção ou produção.
