# RESTORE_INSTRUCTIONS — como restaurar o Atlas v3 a partir dos backups

Última atualização: 2026-07-24

## Onde estão os backups

| artefato | caminho | conteúdo |
|---|---|---|
| **Bundle Git completo** | `~/Documents/Aplas v 3/dist/hostinger/atlas-one-v100-pre-complete-merge.bundle` (7,4 MB) | **Toda a história**, todas as branches e tags. É o backup mais completo. |
| checksum do bundle | `…/atlas-one-v100-pre-complete-merge.bundle.sha256` | `310f6167a0839dc1…` |
| ZIP de checkpoint | `…/atlas-one-v100-unificado-2026-07-24-checkpoint-01.zip` (4,8 MB) | Árvore de trabalho rastreada, sem história. |
| checksum do ZIP | `…/atlas-one-v100-unificado-2026-07-24-checkpoint-01.zip.sha256` | `c92113b502e82333…` |
| Branch de segurança (local) | `checkpoint/pre-unificacao-2026-07-24` → `b3d268df` | Âncora do estado anterior à unificação. |
| Remoto | `origin` → `github.com/thiagoribasdavila-rgb/crm-imob-clean` | Tem a branch `claude/atlas-v3-entregas` em `8171a397`. |

O bundle é o único artefato que preserva **história e branches**. O ZIP preserva só
os arquivos do commit final. Guarde os dois fora desta máquina.

## Verificar antes de confiar

```bash
cd "/Users/thiagoribasdavila/Documents/Aplas v 3/dist/hostinger" && shasum -a 256 -c atlas-one-v100-pre-complete-merge.bundle.sha256 && git bundle verify atlas-one-v100-pre-complete-merge.bundle
```

Esperado: `OK` no checksum e `The bundle records a complete history.`

## Cenário 1 — o repositório local sumiu ou corrompeu (restauração completa)

```bash
git clone "/Users/thiagoribasdavila/Documents/Aplas v 3/dist/hostinger/atlas-one-v100-pre-complete-merge.bundle" atlas-v3-restaurado
```

Isso recria o repositório com toda a história. Depois:

```bash
cd atlas-v3-restaurado && git checkout claude/atlas-v3-entregas && npm ci
```

O que **não** vem no bundle (por design, são segredos ou artefatos): `.env.local`,
`.env.hostinger`, `hostinger.env`, `node_modules`, `.next`, `dist`. Recrie os `.env` a
partir de `.env.example` e das credenciais que só o dono tem.

## Cenário 2 — voltar ao estado anterior à unificação, mantendo o repositório

```bash
git checkout claude/atlas-v3-entregas && git reset --hard checkpoint/pre-unificacao-2026-07-24
```

Para recuperar o trabalho que estava pendente naquele momento:

```bash
git apply docs/continuity/PRE_MERGE_DIFF.patch
```

## Cenário 3 — desfazer só uma entrega

Cada commit é independente e reversível com `git revert <hash>`. A tabela commit → efeito
está em [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md). Atenção à única dependência: `916c609a`
corrige `0e963a82`, então revertem-se juntos, nessa ordem.

## Cenário 4 — só preciso dos arquivos, sem história

```bash
unzip "/Users/thiagoribasdavila/Documents/Aplas v 3/dist/hostinger/atlas-one-v100-unificado-2026-07-24-checkpoint-01.zip" -d /destino
```

## Depois de qualquer restauração, valide

```bash
npm run security:secrets && npm run typecheck && npm run lint && npm test && npm run cc23:check && npm run build
```

Estado esperado no HEAD desta sessão: scanner PASSED · tsc 0 · eslint 0 · 69 testes
(53 unitários + 16 contratos) 0 falhas · CC23 30/30 · build exit 0.

## Sobre o remoto (nada foi enviado)

`origin/claude/atlas-v3-entregas` está em `8171a397` e o local está **14 commits à frente**,
0 atrás. Nenhum push foi executado nesta sessão nem na anterior — é decisão do dono. Quando
autorizar, o comando é:

```bash
git push origin claude/atlas-v3-entregas
```

Enquanto isso não acontece, o bundle é o único backup dos 14 commits fora do disco local —
**copie-o para outro lugar**.
