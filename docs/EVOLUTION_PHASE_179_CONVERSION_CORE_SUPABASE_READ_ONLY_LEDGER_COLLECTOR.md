# Fase 179 — Coletor seguro do histórico remoto de migrations

## Resultado

Foi criado um coletor estritamente limitado a `supabase migration list --linked`. Por padrão ele executa somente o preflight local e não contata o Supabase.

O snapshot de 23/07 registra 179 migrations remotas, mas é tratado apenas como referência histórica. Ele não comprova o estado remoto atual.

## Barreiras de segurança

- exige simultaneamente `--collect` e `ATLAS_ALLOW_READ_ONLY_REMOTE_MIGRATION_HISTORY=1`;
- exige vínculo local prévio e confirma o projeto por hash allowlisted;
- nunca executa `link`, `db push`, `db pull`, `db reset` ou `migration repair`;
- não aceita `--db-url`, senha ou argumentos arbitrários;
- remove URLs e senhas de banco do ambiente do subprocesso;
- não grava a saída bruta, referência do projeto, credenciais ou dados pessoais;
- produz somente versões numéricas e estados derivados;
- não autoriza DDL, reparo de histórico ou push após a coleta.

## Estado desta fase

O projeto não está vinculado localmente, portanto a coleta remota não foi executada. Isso é intencional: vincular ou consultar o ambiente remoto exige uma sessão operacional autorizada.

Preflight seguro:

```bash
npm run evolution:phase-179:assess
```

Procedimento futuro, somente no terminal seguro do operador e sem compartilhar credenciais:

```bash
ATLAS_ALLOW_READ_ONLY_REMOTE_MIGRATION_HISTORY=1 npm run evolution:phase-179:collect
```

Antes disso, o projeto correto deve ter sido vinculado manualmente. O comando oficial apenas lista migrations locais e remotas; ele não resolve sozinho os nomes históricos necessários para as três colisões. Consulte a [referência oficial do Supabase CLI](https://supabase.com/docs/reference/cli/supabase-migration-list).

## O que não foi feito

- nenhuma conexão remota;
- nenhuma migration aplicada ou renomeada;
- nenhum reparo de histórico;
- nenhum reset de banco;
- nenhuma mudança em usuário, organização ou dados reais;
- nenhum build, ZIP ou deploy.

