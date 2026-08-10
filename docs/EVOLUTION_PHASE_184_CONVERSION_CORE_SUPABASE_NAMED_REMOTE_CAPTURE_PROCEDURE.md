# ATLAS AI OS — Fase 184/3000

## Objetivo

Preparar, sem executar, o procedimento de uso único necessário para obter os nomes das migrations remotas que colidem por versão.

## Diagnóstico confirmado

A CLI Supabase `2.109.1` consulta apenas `version` no comando `migration list` por compatibilidade. A fonte oficial da mesma versão confirma que `supabase_migrations.schema_migrations` também possui a coluna `name` e que migrations novas gravam `version`, `name` e `statements`.

Por isso, repetir `supabase migration list --linked` não resolveria as três colisões. A evidência necessária deve ler somente `version` e `name`, sem consultar o corpo SQL.

## Implementação

- consulta fixa em `BEGIN TRANSACTION READ ONLY` e encerrada com `ROLLBACK`;
- projeção limitada a `version` e ao nome canônico `<version>_<name>`;
- nenhum `statements`, SQL de migration, project ref em claro ou segredo na evidência;
- identidade do projeto somente por SHA-256;
- autorização explícita por execução e revisão humana obrigatória;
- saída destinada ao adaptador validado na fase 183;
- execução remota propositalmente indisponível nesta fase.

## Prova de segurança

Os testes recusam:

- consulta sem transação somente leitura;
- tokens de mutação;
- mudança no hash da consulta fixa;
- indicação de contato remoto ou escrita;
- execução, build, ZIP ou deploy.

## Validação local

```bash
npm run evolution:phase-184:assess
npm run evolution:phase-184:check
node --test tests/contracts/conversion-core-supabase-named-remote-capture-procedure.test.mjs
```

## Estado final

O procedimento está pronto e testável localmente, mas não foi autorizado nem executado. Nenhuma migration, dado, usuário, policy ou ambiente remoto foi alterado.

## Próxima fase

Criar o gate local de autorização e a revisão humana da captura. O contato remoto seguirá bloqueado até uma autorização explícita e separada.
