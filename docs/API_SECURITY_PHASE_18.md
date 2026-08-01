# Fase 18 — APIs protegidas

## Contrato

Toda rota do Atlas pertence a exatamente uma classe: pública mínima, fluxo de autenticação, webhook assinado, worker com segredo operacional ou API autenticada. A lista de exceções é explícita e auditável em `config/api-security-contract.json`.

- APIs de usuário exigem identidade validada no Supabase, perfil ativo, organização ativa e escopo por RLS.
- Operações comerciais sensíveis adicionam função, cadeia ou carteira no próprio endpoint.
- Entradas mutáveis precisam ser lidas e validadas antes da persistência.
- Fluxos de login e recuperação têm limites próprios.
- Webhooks exigem assinatura criptográfica e limitação por origem.
- Workers exigem `ATLAS_CRON_SECRET` e não aceitam sessão de navegador.
- Concessões e bloqueios do autenticador legado geram logs estruturados sem token.

## Correção crítica

`/api/leads` mantinha uma lista em memória e aceitava acesso anônimo. A implementação paralela foi removida; o caminho agora reutiliza `/api/v1/leads`, que exige sessão, organização, papel, validação, rate limit e RLS.

## Homologação externa

Testar 401 sem token, 403 fora da função/carteira, 400 para payload inválido, 429 após o limite e ausência de dados entre organizações. Conferir os logs por correlação sem registrar tokens, senhas ou conteúdo pessoal.
