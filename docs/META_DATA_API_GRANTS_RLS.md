# ATLAS AI OS — Fase 17/100

## Grants explícitos da Data API e RLS

Esta fase fecha o contrato entre a interface do Atlas, a Data API e a segurança por organização. Ela não aplica migrações nem consulta dados de clientes. A única consulta preparada lê os catálogos do Postgres em um branch Supabase isolado.

## Por que este controle é necessário

Data API e RLS são controles diferentes:

- o `GRANT` determina se o papel pode alcançar a tabela ou determinadas colunas;
- a RLS determina quais linhas esse usuário autenticado pode acessar;
- habilitar RLS sem os grants necessários bloqueia a interface;
- conceder grants sem RLS pode expor dados de outra organização.

Desde 30 de maio de 2026, novos projetos Supabase passaram gradualmente a não expor tabelas novas automaticamente. A aplicação precisa declarar os privilégios que realmente utiliza:

- <https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically>
- <https://supabase.com/docs/guides/database/secure-data>
- <https://supabase.com/docs/guides/api/securing-your-api>

## Problemas encontrados e corrigidos no rascunho

1. `organizations` era usada diretamente pelas Configurações, mas não estava no bloco explícito de acesso da Data API.
2. A página de perfil atualiza `profiles.name`, enquanto o contrato permitia atualizar apenas `full_name` e outros campos.
3. Leads não precisam de exclusão direta pelo navegador. O contrato mantém apenas `SELECT`, `INSERT` e `UPDATE` para o papel autenticado.
4. `anon` continua sem acesso, e `service_role` permanece exclusivo do servidor.

As correções estão apenas no rascunho `20260719070511_reconcile_legacy_and_canonical_contracts.sql`. Nenhuma migração foi aplicada no banco publicado.

## Prova catalogal somente leitura

O arquivo `scripts/sql/meta-data-api-access-audit.sql` produz um JSON sanitizado e verifica:

- existência de `organizations`, `profiles` e `leads`;
- RLS ativa nas três tabelas;
- ausência de privilégios de tabela ou coluna para `anon`;
- colunas mínimas usadas pelas telas;
- privilégios efetivos de `authenticated` e `service_role`;
- políticas de leitura, criação e atualização;
- presença de `USING` e `WITH CHECK` nos updates;
- ausência de `DELETE` de leads para `authenticated`.

A consulta usa apenas catálogos. Ela não lê nomes, telefones, e-mails, leads ou qualquer linha comercial.

## Como executar quando houver branch isolado

1. Executar a Fase 16 e preservar somente a evidência sanitizada aprovada.
2. Abrir o SQL Editor do branch vazio e executar `scripts/sql/meta-data-api-access-audit.sql`.
3. Salvar apenas o JSON retornado, sem URL, referência do projeto, token ou saída bruta.
4. Informar no terminal seguro:

```text
ATLAS_PHASE16_RECONCILIATION_EVIDENCE_FILE=outputs/meta-phase-016/EVIDENCIA.json
ATLAS_PHASE17_CATALOG_EVIDENCE_FILE=outputs/meta-phase-017/CATALOGO.json
```

5. Reconciliar e validar:

```bash
npm run meta:phase-017:reconcile
npm run meta:phase-017:preflight -- outputs/meta-phase-017/EVIDENCIA-COMBINADA.json
```

O reconciliador aceita somente arquivos JSON dentro do próprio projeto. Ele calcula hashes SHA-256, não persiste o conteúdo bruto e mantém todos os gates externos fechados.

## Gate desta fase

- contrato local de grants e menor privilégio: corrigido no rascunho;
- consulta catalogal somente leitura: pronta;
- validadores fail-closed e autotestes: prontos;
- consulta validada em Postgres local em memória: pronta;
- branch isolado: não fornecido;
- prova remota: pendente;
- migração: não aplicada;
- produção: bloqueada;
- eventos Meta reais: bloqueados;
- campanhas, orçamento e públicos: sem alteração;
- build: não executado, preservado para o fechamento do ZIP.
