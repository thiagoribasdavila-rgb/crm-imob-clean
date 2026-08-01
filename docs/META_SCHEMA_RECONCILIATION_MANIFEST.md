# ATLAS AI OS — Fase 10/100

## Manifesto de reconciliação do schema

Esta fase fecha o diagnóstico entre o banco legado que está em operação e o contrato canônico esperado pelo Atlas V3. Nenhuma alteração foi aplicada ao banco, nenhuma migration foi executada e nenhum build foi disparado.

O resultado é deliberadamente conservador: a reconciliação está especificada, mas continua bloqueada até existir um ambiente Supabase de staging isolado, backup verificável e evidência de execução completa.

## O que já existe

A migration histórica `20260717213000_v3_legacy_runtime_schema_bridge.sql` é uma ponte aditiva útil. Ela:

- mantém as colunas legadas;
- adiciona `full_name`, `commercial_role` e `reports_to` em `profiles`;
- adiciona `assigned_to`, `development_id` e `score` em `leads`;
- tenta copiar valores dos contratos legados;
- cria índices para o contrato V3.

O aplicativo também possui adaptadores que leem os dois contratos:

- `assigned_user_id` e `assigned_to`;
- `project_id` e `development_id`;
- `score_ia` e `score`;
- `name` e `full_name`.

Isso evita reconstrução desnecessária, mas não torna a migration histórica segura para replay.

## Riscos encontrados

### 1. Score histórico pode ser mascarado

A ponte adiciona `score` como `not null default 0` antes do backfill. Depois executa a lógica equivalente a:

```sql
score = coalesce(score, score_ia, 0)
```

Como o novo `score` já nasce com zero, o primeiro valor não é nulo e um `score_ia` histórico diferente de zero pode deixar de ser copiado.

A migration corretiva deverá seguir esta ordem:

1. adicionar `score` sem default e permitindo nulo;
2. copiar `score_ia`;
3. validar faixas, contagens e divergências;
4. somente então definir default e `not null`.

### 2. Dois contratos ainda escrevem no mesmo dado

O código atual utiliza tanto os campos legados quanto os canônicos. Não foi encontrada uma proteção bidirecional versionada para:

- responsável: `assigned_user_id` ↔ `assigned_to`;
- projeto: `project_id` ↔ `development_id`;
- score: `score_ia` ↔ `score`.

Durante a janela de compatibilidade, uma escrita em apenas um lado pode produzir divergência silenciosa. A nova migration precisará sincronizar mudanças válidas e rejeitar conflitos, deixando registro auditável.

### 3. Papéis desconhecidos não podem virar corretor

A ponte histórica converte qualquer papel desconhecido em `broker`. Isso pode reduzir privilégios indevidamente, alterar a hierarquia e ocultar um dado que precisa de decisão humana.

Mapeamentos automáticos permitidos:

| Papel legado | Papel comercial |
|---|---|
| `admin` | `director` |
| `manager` | `manager` |
| `broker` | `broker` |

Qualquer outro valor bloqueia a execução até revisão. O campo `reports_to` também não será inferido: a relação gerente–corretor exige um mapa aprovado.

### 4. Permissões da Data API precisam ser explícitas

RLS e privilégios de tabela são controles separados. O contrato final deve versionar os `GRANT`/`REVOKE` mínimos, manter RLS ativo e provar isolamento entre organizações.

Regras mínimas:

- `anon`: nenhum acesso direto a `profiles` e `leads`;
- `authenticated`: apenas as operações e colunas exigidas pelo produto;
- `service_role`: nunca no navegador;
- alteração de campos de autorização: somente por fluxo administrativo protegido.

## Sequência aprovada para a Fase 11

1. Criar staging isolado e sanitizado.
2. Capturar fingerprint do catálogo e validar backup restaurável.
3. Criar uma **nova** migration com `supabase migration new`.
4. Não editar nem reproduzir a ponte histórica.
5. Adicionar campos ausentes como nullable e sem defaults que escondam legado.
6. Mapear papéis e hierarquia com revisão humana.
7. Fazer backfill e provar preservação de score, responsável, projeto e nome.
8. Adicionar constraints, defaults e índices somente após as invariantes passarem.
9. Instalar a compatibilidade bidirecional protegida.
10. Aplicar privilégios explícitos e RLS como controles separados.
11. Executar os 13 testes contratuais e o rollback em staging.
12. Preparar promoção separada somente após aprovação de diretoria e segurança.

## Matriz obrigatória

O gate exige evidência para:

- cópia e sincronização do responsável nos dois sentidos;
- rejeição de conflito de responsável;
- cópia e sincronização do projeto;
- preservação e sincronização do score histórico;
- preservação do nome;
- bloqueio de papel desconhecido;
- ausência de inferência automática de `reports_to`;
- negação de acesso anônimo;
- acesso permitido no mesmo tenant;
- bloqueio cross-tenant;
- rollback sem perda de dados.

## Resultado da fase

| Controle | Estado |
|---|---|
| Ponte histórica identificada | OK |
| Contratos legado/canônico mapeados | OK |
| Falha de backfill do score detectada | BLOQUEIO |
| Sincronização bidirecional comprovada | PENDENTE |
| Mapeamento de papéis aprovado | PENDENTE |
| Hierarquia aprovada | PENDENTE |
| Privilégios explícitos comprovados | PENDENTE |
| Staging isolado | PENDENTE |
| Rollback testado | PENDENTE |
| Banco de produção alterado | NÃO |
| Build executado | NÃO |

## Governança Meta

Esta fase não enviou eventos reais, não alterou campanha, orçamento ou público e não utilizou dados pessoais em evidências. A evolução do aprendizado Meta continua dependente de sinais comerciais confiáveis; por isso a consistência do schema é um pré-requisito e não uma tarefa administrativa secundária.

## Próxima fase

**Fase 11/100 — Migration de reconciliação canônica versionada e testes locais.**

A Fase 11 poderá criar o rascunho de uma migration nova via Supabase CLI, mas continuará sem aplicação em produção. A execução só será considerada após staging isolado e todas as evidências deste manifesto.
