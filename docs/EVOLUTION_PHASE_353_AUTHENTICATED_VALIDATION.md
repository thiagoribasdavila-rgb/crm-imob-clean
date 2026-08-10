# Fase 353 — validação autenticada da primeira ação

## Resultado desta entrega

Foi criado um verificador de runtime seguro para provar o fluxo da fase 352 com uma conta exclusiva de corretor e uma lead previamente designada. O verificador não escolhe registros sozinho e não usa a chave `service_role` no cliente.

## Proteções

- não executa sem todas as variáveis necessárias;
- exige `ATLAS_RUNTIME_MUTATION_CONFIRM=phase-353-first-action`;
- exige UUID explícito em `ATLAS_RUNTIME_TEST_LEAD_ID`;
- exige data futura explícita em `ATLAS_RUNTIME_NEXT_ACTION_AT`;
- usa chave de idempotência estável por lead;
- valida sessão, papel de corretor, organização e visibilidade por RLS;
- não imprime e-mail, senha, token ou chave do Supabase.

## Prova realizada quando o ambiente estiver autorizado

1. autentica a conta de homologação;
2. resolve perfil e organização em `/api/v1/auth/me`;
3. confirma que a lead designada é visível pelo RLS;
4. registra primeira ação, tarefa, atualização da lead e evento auditável;
5. lê os quatro registros com a sessão do próprio corretor;
6. repete a mesma chamada e exige replay sem novos identificadores.

## Execução segura

As variáveis devem ser preenchidas somente no ambiente local seguro ou na infraestrutura de homologação. Nenhum segredo deve ser enviado por chat ou versionado.

```bash
npm run verify:phase-353:first-action
```

Antes da execução, a migration `20260809120000_phase_352_atomic_first_action.sql` precisa estar reconciliada no Supabase de homologação. Essa reconciliação foi concluída em 09/08/2026.

O preflight local confirmou que `.env.local` está ignorado pelo Git, porém ainda faltam as configurações exclusivas da prova:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `ATLAS_TEST_EMAIL`;
- `ATLAS_TEST_PASSWORD`;
- `ATLAS_RUNTIME_TEST_LEAD_ID`;
- `ATLAS_RUNTIME_NEXT_ACTION_AT`;
- `ATLAS_RUNTIME_MUTATION_CONFIRM=phase-353-first-action`.

Os valores devem ser preenchidos somente no arquivo local seguro. A prova não selecionará uma lead automaticamente e não executará mutação parcial.

## Estado

O harness está implementado, a migration remota está aplicada e os contratos locais estão aprovados. A fase 353 não é considerada concluída sem a evidência autenticada real. O marcador oficial permanece na fase 349.
