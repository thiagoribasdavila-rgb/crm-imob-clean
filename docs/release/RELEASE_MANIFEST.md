# RELEASE MANIFEST — ATLAS ONE RC.2

**Congelado em 2026-07-31.** Este pacote **NÃO está publicado** e não deve ser,
até autorização explícita com a frase `DEPLOY RC.2 AUTORIZADO`.

## O ARTEFATO

| campo | valor |
|---|---|
| arquivo | `atlas-one-v3.0.0-rc.2-hostinger-20260731-1250-41ebf2fc.zip` |
| SHA-256 | `c6e43bc8ab9e573674419a7e0c50082799d031f59fb11bc57e5c80d059c352d8` |
| tamanho | **6716892** bytes |
| entradas | 3.369 |
| CRC | **OK** |
| commit | `41ebf2fc` |
| versão | 3.0.0-rc.2 |
| branch | `claude/atlas-v3-entregas` |
| tag | `v3.0.0-rc.2-hostinger` |
| origem | `git archive HEAD` — só arquivos rastreados |
| local | `~/atlas-v3-releases/` e `~/Downloads/` |

```bash
shasum -a 256 -c ~/atlas-v3-releases/atlas-one-v3.0.0-rc.2-hostinger-20260731-1250-41ebf2fc.zip.sha256
```

## ALVO CONFIRMADO

Aplicação **Node.js gerenciada da Hostinger** — confirmado pelo dono no hPanel,
não presumido. **Não é VPS.** O domínio é servido pelo CDN da Hostinger.

| campo | valor |
|---|---|
| Node | **20.x** (`engines: ">=20.9"`) |
| build | `npm run build` |
| start | `npm start` |
| raiz | `./` |
| saída | `.next` |

## VALIDAÇÃO DO PACOTE — extraído em diretório novo

| etapa | resultado |
|---|---|
| `npm ci` | **exit 0** |
| `npx tsc --noEmit` | **exit 0** |
| `npx eslint . --max-warnings=0` | **exit 0** |
| `npm run security:secrets` | **exit 0** |
| **build SEM ambiente** | **exit 1 — RECUSOU**, como projetado |
| **build COM ambiente** | **exit 0** |
| URL pública no bundle | **1 arquivo** ✔ |
| service role no bundle | **0** ✔ |
| placeholder `127.0.0.1:54321` | **0** ✔ |

Na máquina de origem: **1.222 contratos · 1.213 aprovados · 0 falhas · 9 pulados
· 220/220 portões**.

## O QUE ESTE DEPLOY **NÃO** FAZ

**Não toca no banco.** A Hostinger executa apenas `npm ci → npm run build →
npm start`. Verificado:

- `scripts/build.mjs` referencia migrations **só por leitura de nome de arquivo**
  (`readdirSync` em `supabase/migrations`) — **nenhuma conexão**;
- **nenhum** hook `preinstall`/`postinstall`/`prebuild`/`poststart`;
- o único script que cita `reset` (`auth:official:reset`) **não está** em
  nenhum dos três comandos.

Nenhuma migration está pendente (): as 4 desta
linha de trabalho já foram aplicadas, e o drift de schema é **0**.

## ROLLBACK PRESERVADO

| campo | valor |
|---|---|
| arquivo | `atlas-v3-completo-2026-07-30.zip` |
| local | `~/Downloads/` |
| SHA-256 | `58eb23d25d6376513aa53f608b0b485f364cf167be6c8d9280593a6f61a4f0a3` |
| tamanho | 6.240.058 bytes · CRC **OK** |

É o pacote que está **em operação agora**. Não foi substituído nem alterado.

## ESTADO

**Código congelado neste commit.** Nenhuma alteração até nova autorização.
