# ATLAS AI OS — Fase 14/100

## Objetivo

Preparar uma homologação real e isolada da corrente completa de segurança:

`Supabase Auth → JWT assinado → sessão → Data API → grants → RLS → hierarquia comercial`.

Esta fase não acessa nem altera o ambiente publicado. Ela entrega o executor, a auditoria local e o gate que impedem uma aprovação sem evidências.

## O que já está comprovado

- A Fase 13 aprovou 24 cenários e 44 verificações PostgreSQL locais.
- O middleware do Atlas usa `auth.getClaims()` e exige um `sub` válido.
- APIs sensíveis confirmam o usuário no servidor com `auth.getUser(token)`.
- O controle de sessão não devolve access token nem refresh token ao navegador.
- A autorização comercial é lida do banco, não de `user_metadata` editável.
- A versão `2.110.0` de `@supabase/supabase-js` está fixada no projeto.

## O que o ensaio isolado verificará

1. Login por senha com quatro identidades sintéticas.
2. Verificação de assinatura com `getClaims()`.
3. Descoberta JWKS e compatibilidade com projetos que ainda usem validação remota legada.
4. `iss`, `aud`, `sub`, `role`, `iat`, `exp` e `session_id`.
5. Rotação de access token e refresh token.
6. Rejeição do refresh token após revogação global.
7. Limites da Data API para `anon`, `authenticated` e chave secreta de servidor.
8. Escopo de corretor, gerente e diretor.
9. Bloqueio de leitura e escrita entre organizações.
10. Tentativa de elevação por metadados editáveis e restauração posterior.
11. Restauração do status da lead usado como sonda de escrita.

## Regra importante sobre logout

O Atlas não afirma que um access token desaparece instantaneamente após o logout. O teste comprova a revogação do refresh token; o access token já emitido pode continuar válido até sua expiração. Operações especialmente sensíveis devem, quando necessário, conferir o `session_id` no servidor.

## Variáveis do clone de homologação

Preencher somente no ambiente seguro do executor. Nunca inserir valores no Git, relatório ou chat.

```text
ATLAS_AUTH_TEST_ENVIRONMENT=staging_clone
ATLAS_AUTH_TEST_MUTATION_APPROVED=true
ATLAS_AUTH_TEST_SUPABASE_URL=https://SEU-REF-ISOLADO.supabase.co
ATLAS_AUTH_TEST_EXPECTED_PROJECT_REF=SEU-REF-ISOLADO
ATLAS_AUTH_TEST_SUPABASE_PUBLISHABLE_KEY=
ATLAS_AUTH_TEST_SUPABASE_SECRET_KEY=

ATLAS_AUTH_TEST_BROKER_A_EMAIL=
ATLAS_AUTH_TEST_BROKER_A_PASSWORD=
ATLAS_AUTH_TEST_MANAGER_A_EMAIL=
ATLAS_AUTH_TEST_MANAGER_A_PASSWORD=
ATLAS_AUTH_TEST_DIRECTOR_A_EMAIL=
ATLAS_AUTH_TEST_DIRECTOR_A_PASSWORD=
ATLAS_AUTH_TEST_BROKER_B_EMAIL=
ATLAS_AUTH_TEST_BROKER_B_PASSWORD=

ATLAS_AUTH_TEST_OWN_LEAD_A_ID=
ATLAS_AUTH_TEST_TEAMMATE_LEAD_A_ID=
ATLAS_AUTH_TEST_OTHER_TEAM_LEAD_A_ID=
ATLAS_AUTH_TEST_CROSS_TENANT_LEAD_B_ID=
```

## Execução futura autorizada

Somente depois de criar e conferir o clone:

```bash
npm run meta:phase-014:staging
npm run meta:phase-014:preflight -- caminho/para/evidencia-sanitizada.json
```

O executor rejeita automaticamente:

- URL sem HTTPS;
- referência diferente da esperada;
- URL igual à produção;
- chave pública classificada como secreta;
- chave secreta classificada como pública;
- ausência de autorização explícita para as sondas reversíveis.

## Critério de aprovação

A Fase 14 local fica concluída quando auditoria, verificador e autotestes passam. A homologação remota continuará bloqueada enquanto o template estiver com `status: not_run`.

Produção, envio de eventos Meta, campanhas, orçamento, público e build permanecem fora do escopo.

## Próxima fase

Fase 15: executar esse roteiro no clone Supabase isolado, capturar apenas evidências sanitizadas e reconciliar divergências reais.
