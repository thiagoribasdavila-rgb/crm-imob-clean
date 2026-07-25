# ZIP pronto para rodar — prova de execução

Data da prova: 2026-07-24 · Pacote: `atlas-one-v100-completo-2026-07-24.zip`

Até aqui o pacote tinha checksum, inventário e integridade verificados. Isso prova que o
**arquivo** está íntegro — não prova que ele **roda**. Esta é a prova que faltava, feita
extraindo o ZIP num diretório limpo, sem reaproveitar nada do repositório de trabalho.

## O que foi executado, na ordem

| passo | comando | resultado |
|---|---|---|
| 1. Extração limpa | `unzip` em diretório vazio | 2.264 arquivos |
| 2. Pré-requisitos | conferência de arquivos | lockfile, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `ecosystem.config.cjs` e `.env.example` presentes |
| 3. Dependências | `npm ci --no-audit --no-fund` | **exit 0** — instala só do lockfile, sem rede além do registry |
| 4. Build | `npm run build` | **exit 0** — "Compiled successfully in 14.5s" |
| 5. Execução | `npm start` | sobe e responde |
| 6. Saúde | `GET /api/health` | **200** |
| 7. Landing | `GET /` | **200** |
| 8. Login | `GET /login` | **200** |
| 9. Banco | `GET /api/ready` | **`{"ok":true,...,"database":{"ok":true,"latencyMs":1032}}`** |

Os passos 3 a 8 foram feitos com **variáveis de placeholder**, de propósito: provam que o
**pacote está completo** sem levar credencial real para diretório temporário. O passo 9 foi
repetido com o `.env.local` real só para confirmar a conexão com homologação, e o arquivo foi
removido do diretório de teste em seguida.

## O que isso significa

O pacote é **auto-suficiente**: quem receber o ZIP consegue instalar, compilar e subir sem
precisar de nenhum arquivo que não esteja dentro dele — exceto o `.env`, que é justamente o
que não deve viajar junto.

## O que isso NÃO significa

- Não prova login real (exige senha, que não está no pacote nem comigo).
- Não prova as telas internas — só que a aplicação sobe e serve as públicas.
- Não substitui o roteiro de [TESTE_REAL_RUNBOOK.md](TESTE_REAL_RUNBOOK.md).

## Como reproduzir

```bash
mkdir -p /tmp/atlas-teste && cd /tmp/atlas-teste && unzip -q "/Users/thiagoribasdavila/Documents/Aplas v 3/dist/hostinger/atlas-one-v100-completo-2026-07-24.zip" && cd atlas-v3 && npm ci --no-audit --no-fund && cp ~/atlas-v3/.env.local . && npm run build && npm start
```

Depois, em outro terminal:

```bash
curl -s localhost:3000/api/ready
```

Esperado: `"ok":true` com `database.ok = true`.

## Para subir na Hostinger

O runtime alvo é Node 20.9+ com PM2 (`ecosystem.config.cjs` já vem no pacote).

1. Suba o ZIP e extraia no diretório da aplicação.
2. `npm ci --omit=dev` — o pacote não precisa de devDependencies em produção.
3. Crie o `.env` **direto no servidor** (nunca por commit, nunca dentro do ZIP), com as
   variáveis obrigatórias listadas em `.env.example`.
4. **Antes de buildar**, confirme o banco alvo:
   ```bash
   npm run database:target:check
   ```
   Se reprovar, pare: o ambiente está apontando para o banco que não sustenta a aplicação
   (ver R-01 em [KNOWN_RISKS.md](KNOWN_RISKS.md)).
5. `npm run build` — as variáveis `NEXT_PUBLIC_*` são embutidas **no momento do build**.
   Definir depois não adianta; exige rebuild.
6. `pm2 start ecosystem.config.cjs`.
7. Confirme com `curl` em `/api/health` e `/api/ready`.

O runbook completo de deploy, com os riscos catalogados, está em
`docs/deploy/RUNBOOK_DEPLOY_HOSTINGER.md`.
