# ZIP_MANIFEST — pacote de checkpoint da unificação

## Identificação

| campo | valor |
|---|---|
| Nome | `atlas-one-v100-unificado-2026-07-24-checkpoint-01.zip` |
| Local | `/Users/thiagoribasdavila/Documents/Aplas v 3/dist/hostinger/` |
| Tamanho | 4,8 MB (10.725.203 bytes descompactados) |
| Arquivos | **2.980** |
| SHA-256 | `c92113b502e823339008a462de8a91493bf707eeaca7eded92e75a1e56947aab` |
| Checksum externo | `atlas-one-v100-unificado-2026-07-24-checkpoint-01.zip.sha256` |
| Teste de abertura | `unzip -t` → **No errors detected** |
| Prefixo interno | `atlas-v3/` |
| Commit de origem | `700bb92e` (branch `claude/atlas-v3-entregas`) |

## Método de geração

Gerado com `git archive --format=zip -9 --prefix=atlas-v3/ HEAD`.

A escolha é deliberada: `git archive` empacota **apenas arquivos rastreados pelo Git**, o que
exclui por construção — e não por lista de exclusão manual — `node_modules/`, `.next/`, `dist/`,
caches, arquivos temporários e todo `.env` real (que são ignorados no repositório). Não há como
um artefato não rastreado escapar para dentro do pacote.

## Verificação executada antes de fechar

| verificação | resultado |
|---|---|
| `npm run security:secrets` | ❌ falha **pré-existente** por falso positivo — ver abaixo |
| varredura independente de segredos reais (`sk-`, JWT, `AKIA`, `xox[bp]-`, PEM) | **nenhum achado** |
| `.env` reais rastreados | **nenhum** (só `.env.example`, com placeholders `localhost`) |
| `node_modules` / `.next` / `dist` / `build` / cache | **0 arquivos** |
| arquivos `.log` | **0** |
| `.DS_Store` e afins | **0** |
| ZIPs internos (incluindo o pacote de origem) | **0** |
| integridade (`unzip -t`) | OK |
| ZIP original `ATLAS_ONE_FINAL_OPERACIONAL.zip` | **intacto** (checksum reconferido: OK) |

**Sobre a falha do `security:secrets`:** a regex do scanner casa o texto `NEXT_PUBLIC_SUPABASE_*`
escrito em prosa no runbook de deploy. Confirmado idêntico no estado pré-sessão (`b3d268df`).
Não é vazamento e não foi mascarado. A varredura independente acima cobre o risco real.

A única string com formato de JWT em todo o pacote é um fixture propositalmente falso em
`tests/observabilidade.test.ts` (`eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc`), usado justamente
para provar que a redação de segredos funciona.

## Conteúdo incluído

- **Código-fonte** completo da linha canônica (`app/`, `lib/`, `components/`, `core/`, `utils/`);
- **Migrations**: 151 arquivos em `supabase/migrations/`;
- **Testes**: 12 arquivos em `tests/` (9 suítes unitárias + 2 contratos importados + fixtures);
- **Documentação**: `docs/` completo, incluindo os **15 arquivos de `docs/continuity/`**
  (matriz de merge, log de decisões, resultados de teste, validação de tema, riscos, rollback,
  próximo bloco, prompt de retomada, razão de capacidade, changelog e este manifesto);
- **Configuração sem segredos**: `package.json`, `package-lock.json`, `tsconfig.json`,
  `next.config.ts`, `eslint.config.mjs`, `ecosystem.config.cjs`, `.env.example`;
- **Scripts** de verificação e release.

## Conteúdo deliberadamente ausente

`node_modules` · `.next` · `dist` · `build` · caches · `.env` reais (`.env.local`,
`.env.hostinger`, `hostinger.env`) · tokens, chaves, cookies, sessões · logs sensíveis ·
arquivos temporários · dumps de dados reais · arquivos de sistema operacional · o ZIP original
`ATLAS_ONE_FINAL_OPERACIONAL.zip` · o próprio pacote gerado.

Único item que poderia parecer exceção: `logs/.gitkeep` (1 byte). É um placeholder rastreado
para que o diretório de logs exista na instalação — não contém dado nenhum.

## Como validar o pacote recebido

```bash
cd "/Users/thiagoribasdavila/Documents/Aplas v 3/dist/hostinger" && shasum -a 256 -c atlas-one-v100-unificado-2026-07-24-checkpoint-01.zip.sha256
```

---

# ZIP FINAL DA EXECUÇÃO COMPLETA

| campo | valor |
|---|---|
| Nome | `atlas-one-v100-completo-2026-07-24.zip` |
| Local | `/Users/thiagoribasdavila/Documents/Aplas v 3/dist/hostinger/` |
| Tamanho | 4,8 MB (10.781.210 bytes descompactados) |
| Entradas | **2.988** = 2.259 arquivos rastreados + 729 diretórios |
| SHA-256 | ver `atlas-one-v100-completo-2026-07-24.zip.sha256` (ao lado do ZIP) — ver nota abaixo |
| Checksum externo | `atlas-one-v100-completo-2026-07-24.zip.sha256` |
| Integridade | `unzip -t` → **No errors detected** |
| Corresponde ao commit | **sim** — `git archive HEAD`, working tree limpo (0 modificações) |

> **Nota sobre o checksum.** O hash do ZIP não pode ser fixado dentro do próprio ZIP: escrever
> o valor neste arquivo cria um commit novo, que muda a árvore, que muda o hash. Por isso a
> fonte da verdade é o arquivo `.sha256` gerado ao lado do pacote, e não este documento.
> Para conferir, use o comando da seção "Como validar" — ele compara o ZIP com o `.sha256`
> irmão, sem depender deste texto.

## Verificação executada antes de fechar

| verificação | resultado |
|---|---|
| `npm run security:secrets` | **PASSED** — 2.252 arquivos, 0 credenciais |
| `node_modules` / `.next` / `dist` / `build` / caches | **0 entradas** |
| `.env` reais (`.env.local`, `.env.hostinger`, `hostinger.env`) | **0** — só `.env.example` |
| ZIPs anteriores e o git bundle | **0** |
| logs, dumps, dados pessoais, temporários | **0** |
| integridade (`unzip -t`) | OK |
| correspondência com o estado rastreado | exata |

## Conteúdo

Código-fonte completo · 151 migrations · 13 arquivos de teste (69 testes) ·
`docs/` completo incluindo os **19 documentos de `docs/continuity/`** (relatório da unificação,
matriz, decisões, riscos, rollback, restauração, melhorias, decisões de produto, changelog,
manifesto e prompt de continuação) · configuração sem segredos · scripts de verificação.

## Artefatos irmãos

| artefato | SHA-256 |
|---|---|
| `atlas-one-v100-pre-complete-merge.bundle` (backup Git completo, 7,4 MB) | `310f6167a0839dc176ba4ef99c38d957a53491b20985bd2f0af2a391082d4789` |
| `atlas-one-v100-unificado-2026-07-24-checkpoint-01.zip` (checkpoint anterior) | `c92113b502e823339008a462de8a91493bf707eeaca7eded92e75a1e56947aab` |

O bundle é o único artefato que preserva história e branches — guarde-o fora desta máquina.

## Como validar

```bash
cd "/Users/thiagoribasdavila/Documents/Aplas v 3/dist/hostinger" && shasum -a 256 -c atlas-one-v100-completo-2026-07-24.zip.sha256 && unzip -t atlas-one-v100-completo-2026-07-24.zip | tail -1
```
