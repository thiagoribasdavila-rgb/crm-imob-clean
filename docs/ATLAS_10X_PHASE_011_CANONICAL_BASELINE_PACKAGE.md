# ATLAS 10X — Fase 11/24

## Pacote canônico de baseline

Esta fase transforma a decisão da Fase 10 em um contrato executável e
fail-closed. O baseline ainda não foi gerado: foi preparado o pacote que
determina onde, como e sob quais evidências ele poderá ser criado.

## Estado local confirmado

| Item | Estado |
| --- | --- |
| Supabase CLI | `2.109.1` |
| PostgreSQL de referência | 17 |
| Migrations locais preservadas | 126 (124 históricas + 2 correções pendentes) |
| Versões locais duplicadas | 3 |
| `supabase/config.toml` | Ausente |
| Docker ou Podman | Ausente |
| Destino isolado | Não provisionado |
| Snapshot sanitizado | Ausente |

Essas ausências são bloqueios explícitos, não falhas escondidas.

## Regra de captura

`supabase db pull` não pode ser executado contra
`atlas-v3-homologacao`. Segundo o fluxo atual do Supabase CLI, o comando
gera uma migration local e pode registrar essa migration como aplicada no
destino vinculado. Portanto, ele só será permitido contra um projeto
isolado e descartável, após autorização.

Os comandos operacionais deverão:

- usar `HOME` temporário e telemetria desativada;
- informar o alvo explicitamente com `--local` ou `--db-url`;
- rejeitar qualquer host que corresponda à homologação;
- nunca usar `migration repair` ou `db push`;
- nunca copiar usuários do Auth, leads ou linhas comerciais.

## Conteúdo do baseline

O baseline precisa representar a estrutura real:

- extensões, enums, tabelas, colunas e constraints;
- índices, sequências, views, funções e triggers;
- RLS e policies;
- roles, grants e default privileges;
- políticas customizadas de Storage, quando existirem.

O schema `public` é obrigatório. Objetos de `auth` e `storage` entram
somente quando forem customizações do Atlas. Registros gerenciados nunca
entram.

## Invariantes de segurança

O ensaio deve provar:

- RLS em todas as tabelas expostas;
- RLS e grants da Data API avaliados separadamente;
- policies de `UPDATE` com visibilidade de `SELECT`, `USING` e
  `WITH CHECK`;
- `TO` explícito nas policies;
- nenhum uso de `user_metadata` para autorização;
- funções `SECURITY DEFINER` com `search_path` explícito e auditoria de
  `EXECUTE`;
- views expostas com `security_invoker` ou inacessíveis aos papéis da API;
- isolamento entre organizações;
- negação de dados comerciais para `anon`.

## Dados de ensaio

Somente fixtures sintéticas podem ser usadas. O pacote rejeita:

- dados pessoais;
- linhas comerciais reais;
- usuários reais do Auth;
- URLs de banco, project refs, tokens ou credenciais;
- saída bruta do CLI.

## Artefatos exigidos antes do aceite

1. `canonical_baseline.sql`;
2. inventário estrutural;
3. snapshot sanitizado de roles e ACL;
4. revisão do diff;
5. evidência dinâmica de RLS;
6. replay do baseline em PostgreSQL 17 limpo;
7. seed sintético;
8. ensaio de recuperação;
9. checksums;
10. recibo de aprovação humana.

## Sequência autorizável

1. aprovar e provisionar destino isolado;
2. inicializar a configuração local do Supabase;
3. capturar somente a estrutura a partir do clone isolado;
4. revisar privacidade e inventário;
5. gerar e revisar manualmente o baseline;
6. reproduzir em PostgreSQL 17 limpo;
7. executar o gate dinâmico de RLS da Fase 8;
8. ensaiar recuperação e gerar checksums;
9. decidir `go/no-go`.

## O que permanece proibido

- capturar diretamente da homologação;
- alterar o ledger remoto;
- renomear qualquer uma das 126 migrations locais preservadas;
- executar DDL, DML, `repair` ou `push`;
- criar branch paga sem autorização;
- alterar usuários;
- executar build ou criar ZIP.

## Referências oficiais verificadas

- Supabase CLI workflows: `db pull`, migrations e mudança de projeto;
- Supabase local development: `init`, `start` e stack local;
- database migrations: revisão de DDL e replay;
- database testing: testes locais e lint;
- environment management: separação de ambientes;
- changelog de breaking changes, incluindo PostgreSQL 17.
