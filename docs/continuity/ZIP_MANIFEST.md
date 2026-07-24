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
