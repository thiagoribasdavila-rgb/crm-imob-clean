# Fase 176 — Provisionamento local dos quatro perfis

## Resultado

O núcleo de conversão agora possui um provisionador idempotente para `ADMIN`, `DIRETOR`, `GERENTE` e `CORRETOR`, alinhado às regras oficiais do schema atual. A autorização continua baseada em `public.profiles`; `app_metadata` é somente um espelho de contexto.

## Hierarquia comprovada

- `ADMIN`: raiz administrativa, papel comercial `director`.
- `DIRETOR`: raiz decisora, papel comercial `director`.
- `GERENTE`: responde ao diretor.
- `CORRETOR`: responde ao gerente.

O provisionador resolve usuários existentes pelo e-mail normalizado, atualiza-os quando já existem e cria somente os ausentes. Em seguida, grava os perfis na ordem da hierarquia para respeitar os triggers do banco.

## Isolamento de credenciais

O provisionamento exige `ATLAS_E2E_LOCAL_PROVISIONER_SERVICE_ROLE_KEY`, separada das variáveis que chegam ao Playwright. A chave:

- só pode ser usada com Supabase em loopback;
- nunca é copiada para o workspace descartável como arquivo;
- nunca entra no ambiente do navegador;
- nunca é impressa ou devolvida em relatórios;
- não possui fallback para `SUPABASE_SERVICE_ROLE_KEY` ou `.env.local`.

O projeto operacional `pozbrcsfthnhmnebfoxv` e hosts `supabase.co` são recusados.

## Avaliação segura

```bash
npm run evolution:phase-176:assess
```

O comando não provisiona nada e mostra somente nomes de variáveis ausentes.

## Execução futura no runtime local

Depois de iniciar Docker e Supabase local e configurar exclusivamente as variáveis isoladas:

```bash
npm run evolution:phase-176:execute
```

Para provisionar os perfis locais sem executar a jornada:

```bash
npm run evolution:phase-176:provision
```

Ambos recusam URLs não locais. Nenhum comando inicia, reseta, migra ou para o Supabase automaticamente.

## Estado honesto

Contratos, idempotência e isolamento da chave administrativa estão aprovados. A jornada autenticada real ainda não foi executada porque Docker e Supabase local não estão disponíveis neste host. Nenhum build, ZIP, deploy ou acesso ao banco operacional foi realizado nesta fase.
