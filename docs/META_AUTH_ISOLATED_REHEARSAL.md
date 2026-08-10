# ATLAS AI OS — Fase 15/100

## Ensaio efêmero de Auth, JWT, Data API e RLS

Esta fase converte o executor da Fase 14 em um ciclo reproduzível e descartável. O objetivo é provar o isolamento comercial com tokens reais em um clone Supabase isolado, sem usar contas, leads ou organizações da operação.

## Situação encontrada

Nesta cópia do projeto não existem credenciais de um branch Supabase isolado, Supabase CLI nem runtime de containers. Por isso nenhum banco remoto foi acessado e nenhuma evidência foi marcada artificialmente como aprovada.

O Supabase documenta branches como ambientes separados, com banco, Auth, API e chaves próprios. Branches de preview começam sem dados e podem receber seed controlado. Esse é o alvo obrigatório deste ensaio:

- <https://supabase.com/docs/guides/deployment/branching>
- <https://supabase.com/docs/guides/local-development/seeding-your-database>
- <https://supabase.com/docs/guides/database/testing>

## Ciclo automatizado

O executor `scripts/run-meta-auth-isolated-rehearsal.mjs` realiza, nesta ordem:

1. exige `ATLAS_AUTH_TEST_ENVIRONMENT=staging_clone`;
2. confere HTTPS, referência exata do branch e bloqueia a URL de produção;
3. exige confirmação explícita de mutação e clone vazio;
4. verifica que Auth, `organizations`, `profiles` e `leads` têm contagem zero;
5. cria dois tenants sintéticos, nove usuários Auth, nove perfis hierárquicos e quatro leads;
6. executa login com senha, `getClaims()`, descoberta JWKS, refresh, revogação, Data API e RLS da Fase 14;
7. remove leads, perfis, usuários Auth e organizações, inclusive após falha;
8. só aprova quando a contagem residual volta a zero.

As contas usam endereços reservados `example.invalid`. Senhas e tokens existem apenas na memória do processo e não aparecem no relatório.

## Cobertura comercial

O cenário sintético valida:

- corretor A vê somente a própria lead;
- gerente A vê os corretores de sua equipe direta;
- diretor A vê toda a organização A;
- uma segunda equipe da organização A permanece invisível ao corretor e ao outro gerente;
- a organização B permanece invisível à organização A em leitura e escrita;
- anônimo não recebe dados;
- `user_metadata` editável não amplia o papel comercial;
- a chave secreta fica restrita ao processo server-side;
- a alteração reversível de status é restaurada antes da limpeza total.

## Variáveis exigidas

```text
ATLAS_AUTH_TEST_ENVIRONMENT=staging_clone
ATLAS_AUTH_TEST_MUTATION_APPROVED=true
ATLAS_AUTH_TEST_REQUIRE_EMPTY_CLONE=true
ATLAS_AUTH_TEST_SUPABASE_URL=https://SEU-REF-ISOLADO.supabase.co
ATLAS_AUTH_TEST_EXPECTED_PROJECT_REF=SEU-REF-ISOLADO
ATLAS_AUTH_TEST_SUPABASE_PUBLISHABLE_KEY=...
ATLAS_AUTH_TEST_SUPABASE_SECRET_KEY=...
NEXT_PUBLIC_SUPABASE_URL=https://URL-DE-PRODUCAO.supabase.co
```

A chave secreta é usada somente no servidor para criar e apagar fixtures. A documentação do Supabase confirma que operações administrativas de Auth exigem credencial privilegiada e não devem ser expostas no navegador:

- <https://supabase.com/docs/reference/javascript/auth-admin-deleteuser>

## Execução futura no clone

Quando o branch vazio estiver disponível:

```bash
npm run meta:phase-015:rehearsal
```

Salvar somente o JSON sanitizado de saída e validá-lo:

```bash
npm run meta:phase-015:preflight -- caminho/para/evidencia.json
```

## Gate desta fase

- automação local e auditoria estática: preparada;
- ensaio remoto em clone: não executado;
- Auth/JWT/RLS remoto: não aprovado;
- produção: bloqueada;
- envio de eventos Meta: bloqueado;
- campanhas, orçamento e público: sem alteração;
- build: não executado, conforme a política de um único build no fechamento do ZIP.

A Fase 16 deve executar este ciclo em um branch vazio. Nenhuma aprovação de produção pode ser inferida pela simples presença das chaves ou pelo sucesso de testes locais.
