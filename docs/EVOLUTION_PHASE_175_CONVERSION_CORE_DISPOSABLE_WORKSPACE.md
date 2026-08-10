# Fase 175 — Workspace descartável para o núcleo de conversão

## Resultado

O executor autenticado agora possui um lançador físico isolado. Ele copia o código para um diretório temporário, reutiliza apenas `node_modules` por link local e nunca copia arquivos `.env*`, arquivos locais de credencial (`.npmrc`, chaves e certificados), `.git`, caches, artefatos, arquivos compactados, metadados `supabase/.temp` ou links simbólicos da origem.

## Segurança operacional

- A pasta canônica e seu `.env.local` não são alterados.
- A cópia é recusada se os arquivos mínimos do aplicativo e dos testes estiverem ausentes.
- A inspeção falha se encontrar ambiente, cache, artefato ou symlink inesperado.
- A limpeza só aceita diretórios temporários com prefixo e marcador Atlas válidos.
- O diretório é removido no bloco `finally`, inclusive quando Playwright falha.
- Service role, credenciais genéricas, domínio operacional e Supabase remoto continuam proibidos pelo gate da fase 174.
- O processo Playwright recebe uma lista mínima de variáveis do sistema e as credenciais locais mapeadas; chaves de IA, Meta, WhatsApp e banco externo não são herdadas.

## Como avaliar sem executar

```bash
npm run evolution:phase-175:assess
```

O comando informa somente nomes de variáveis ausentes e nomes de arquivos `.env*` detectados. Valores secretos nunca são exibidos.

## Como executar quando o runtime local existir

Com Docker, Supabase local e as variáveis exclusivas `ATLAS_E2E_ISOLATED_*` configuradas no ambiente do terminal:

```bash
npm run evolution:phase-175:execute
```

O executor cria e apaga a cópia automaticamente. Ele não inicia, para, reseta nem migra o Supabase por conta própria.

## Estado honesto

O contrato do workspace descartável está aprovado. A jornada autenticada ainda não foi executada porque Docker e Supabase local não estão disponíveis neste host. Por isso build, ZIP e deploy continuam bloqueados.
