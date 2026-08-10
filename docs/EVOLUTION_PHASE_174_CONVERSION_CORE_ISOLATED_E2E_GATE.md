# ATLAS AI OS — Fase 174/3000

## Objetivo

Preparar a prova autenticada do núcleo de conversão sem usar a operação real como ambiente de teste e sem confundir infraestrutura ausente com aprovação.

## Entrega

- contrato de ambiente exclusivo `ATLAS_E2E_ISOLATED_*`;
- recusa explícita do domínio operacional e do projeto Supabase real;
- quatro contas locais distintas: administrador, diretor, gerente e corretor;
- remoção de fallbacks `ATLAS_TEST_*` e `ATLAS_BASE_URL` no processo filho;
- proibição de `SERVICE_ROLE_KEY` no executor Playwright;
- reutilização da jornada real existente de login, contexto, API e módulos centrais;
- modo `assess`, que nunca imprime valores secretos;
- modo `execute`, que falha fechado sem Docker e Supabase local.
- bloqueio do servidor E2E quando o diretório contém `.env.local`, pois o Next.js o carregaria automaticamente.

## Como avaliar com segurança

```bash
npm run evolution:phase-174:assess
```

O diagnóstico lista apenas nomes de variáveis ausentes e estados de runtime. Ele não imprime credenciais.

## Como executar quando a pilha descartável existir

Preencha no terminal seguro somente variáveis `ATLAS_E2E_ISOLATED_*`, inicie o Supabase local e então rode:

```bash
npm run evolution:phase-174:execute
```

O executor aceita somente URLs de loopback e chama diretamente a jornada autenticada existente. Não use `.env` de produção.

O comando deve ser executado em uma cópia descartável do workspace que não contenha `.env.local`. O arquivo real não é renomeado nem removido automaticamente.

## Evidência atual

- contrato e sanitização: implementados;
- Docker: indisponível neste host;
- Supabase local: indisponível neste host;
- isolamento do `.env.local`: bloqueado no workspace atual;
- jornada autenticada: não executada;
- banco remoto e integrações externas: não tocados;
- build e ZIP: não executados.

## Gate de release

A fase não homologa runtime. Build, ZIP e deploy continuam bloqueados até a jornada isolada passar e a proveniência Git da base canônica ser restaurada.
