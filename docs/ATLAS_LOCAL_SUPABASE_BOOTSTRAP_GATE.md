# ATLAS — gate de bootstrap Supabase local

## Resultado desta etapa

O projeto agora possui um caminho único, auditável e fail-closed para criar
`supabase/config.toml` antes da F12.

O bootstrap:

- usa exclusivamente a CLI local fixada em `2.109.1`;
- aceita somente `supabase init`, sem argumentos;
- usa um `HOME` temporário isolado;
- desabilita a telemetria;
- remove tokens, senha de banco e `DATABASE_URL` do processo filho;
- recusa `--force`, `--interactive`, `--linked` e `--project-ref`;
- recusa sobrescrever um config existente;
- recusa operar se encontrar marcador de projeto linked;
- exige autorização explícita, com expiração e vinculada ao fingerprint atual;
- não acessa projeto remoto, banco, dados ou credenciais;
- não inicia containers;
- não aplica migrations;
- não executa build;
- não gera ZIP.

As evidências são separadas:

- `local-supabase-bootstrap-readiness.json` registra somente a avaliação;
- `local-supabase-bootstrap-evidence.json` registra a execução aceita.

Assim, uma nova avaliação nunca apaga a prova de execução.

Se a CLI devolver um aviso após criar o arquivo, o gate não repete o comando.
Ele valida a pós-condição local: arquivo presente, PostgreSQL 17, ausência de
segredo literal e ausência de marcador `linked`. Somente essa combinação pode
ser reconciliada como concluída.

## Por que esta configuração é necessária

O fluxo local oficial do Supabase é iniciado com `supabase init`, que cria
`supabase/config.toml`. O arquivo versiona portas, serviços e a versão local do
PostgreSQL. A cadeia ATLAS exige PostgreSQL 17 antes de aceitar a configuração.

O runtime completo ainda depende de um ambiente Docker compatível. Esse runtime
será tratado depois do bootstrap e nunca será iniciado por este gate.

Referências oficiais:

- <https://supabase.com/docs/guides/local-development/cli-workflows>
- <https://supabase.com/docs/reference/cli/getting-started>
- <https://supabase.com/docs/reference/cli/supabase-start>

## Comandos seguros

Diagnóstico:

```bash
npm run atlas:supabase-bootstrap:assess
```

Validação do contrato:

```bash
npm run atlas:supabase-bootstrap:check
```

Rascunho não aprovado, já vinculado ao fingerprint atual:

```bash
npm run atlas:supabase-bootstrap:approval-draft
```

O rascunho nunca equivale a aprovação. A autorização válida deve ser colocada
em:

`artifacts/runtime/phase-012/manual/local-supabase-bootstrap-approval.json`

Somente após a autorização explícita:

```bash
npm run atlas:supabase-bootstrap:execute
```

## O que acontece depois

Após o config ser criado e validado:

1. reexecutar a avaliação F12;
2. reexecutar o preflight F22;
3. disponibilizar runtime de containers e `psql`;
4. revisar o config e confirmar PostgreSQL 17;
5. solicitar a autorização JIT separada do ensaio descartável.

O bootstrap local não autoriza nenhuma dessas etapas posteriores.
