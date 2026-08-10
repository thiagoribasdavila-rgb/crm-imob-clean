# ATLAS AI OS — Fase 16/100

## Evidência sanitizada e reconciliação do ensaio isolado

Esta fase transforma o ciclo efêmero da Fase 15 em uma prova operacional auditável. O processo executa apenas contra um branch Supabase isolado e vazio, reconcilia o resultado esperado com o observado e arquiva somente um resumo sanitizado.

## Situação encontrada

O projeto ainda não recebeu credenciais de um branch isolado, Supabase CLI ou runtime de containers. Nenhuma chamada remota foi realizada e nenhum resultado remoto foi alegado.

Branches Supabase possuem banco, Auth, APIs, Storage e credenciais separados. Novos branches começam sem dados, o que permite criar e apagar fixtures sintéticas sem tocar a operação real:

- <https://supabase.com/docs/guides/deployment/branching>
- <https://supabase.com/docs/guides/deployment/branching/working-with-branches>

## O que a reconciliação prova

O comando `meta:phase-016:reconcile` encadeia o ensaio da Fase 15 e exige:

1. ambiente declarado como `staging_clone`;
2. aprovação explícita para as mutações efêmeras;
3. confirmação de branch vazio;
4. duas organizações, nove usuários Auth, nove perfis e quatro leads sintéticos;
5. pelo menos quinze cenários Auth, JWT, hierarquia, tenant e RLS aprovados;
6. remoção integral das fixtures;
7. contagem residual zero em Auth, organizações, perfis e leads;
8. nenhuma divergência entre contrato e resultado observado.

## Proteção da evidência

O processo não guarda:

- senhas;
- tokens de acesso ou refresh;
- chaves Supabase;
- e-mails das contas sintéticas;
- referência ou URL do projeto;
- saída bruta dos processos;
- dados pessoais de leads.

É calculado um hash SHA-256 do JSON sanitizado da Fase 15. O arquivo só é criado quando a reconciliação está aprovada e a limpeza residual é zero. A pasta recebe permissão `0700` e os arquivos `0600`. Evidência reprovada nunca é arquivada como sucesso.

## Execução futura no branch vazio

Preencher as variáveis apenas no terminal seguro ou cofre da Hostinger, nunca no Git:

```text
ATLAS_AUTH_TEST_ENVIRONMENT=staging_clone
ATLAS_AUTH_TEST_MUTATION_APPROVED=true
ATLAS_AUTH_TEST_REQUIRE_EMPTY_CLONE=true
ATLAS_AUTH_TEST_SUPABASE_URL=https://SEU-REF-ISOLADO.supabase.co
ATLAS_AUTH_TEST_EXPECTED_PROJECT_REF=SEU-REF-ISOLADO
ATLAS_AUTH_TEST_SUPABASE_PUBLISHABLE_KEY=...
ATLAS_AUTH_TEST_SUPABASE_SECRET_KEY=...
NEXT_PUBLIC_SUPABASE_URL=https://URL-DE-PRODUCAO.supabase.co
ATLAS_AUTH_TEST_ARCHIVE_SANITIZED_EVIDENCE=true
```

Depois executar:

```bash
npm run meta:phase-016:reconcile
```

O resultado aprovado será salvo sob `outputs/meta-phase-016/`, pasta já ignorada pelo Git. A validação independente usa:

```bash
npm run meta:phase-016:preflight -- outputs/meta-phase-016/ARQUIVO.json
```

## Compatibilidade atual da Data API

Desde maio de 2026, projetos novos podem exigir `GRANT` explícito antes que tabelas em `public` sejam alcançáveis pela Data API. Isso é separado de RLS: grants liberam a tabela para o papel e RLS limita quais linhas o usuário pode ver. A Fase 17 verificará os dois controles no branch, sem aplicar mudanças em produção:

- <https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically>
- <https://supabase.com/docs/guides/database/secure-data>

## Gate desta fase

- pipeline de evidência e reconciliação: pronto;
- auditoria estática e autotestes: locais;
- branch isolado: não fornecido;
- ensaio remoto e arquivo real: não executados;
- produção: bloqueada;
- eventos Meta reais: bloqueados;
- campanhas, orçamento e públicos: sem alteração;
- build: não executado, preservado para o fechamento do ZIP.
