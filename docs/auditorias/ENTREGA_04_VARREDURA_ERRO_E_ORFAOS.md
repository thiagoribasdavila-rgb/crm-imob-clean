# Entrega 04 — Varredura sistemática do bug de renderização + limpeza de órfãos

**Branch:** `claude/atlas-v3-entregas` · **Commits:** `77867969`, `d017b364` · **Data:** 2026-07-19

## Objetivo

Verificar se o bug de crash encontrado na Entrega 02 (erro-objeto renderizado cru no JSX) era isolado ou um padrão recorrente, e decidir o destino dos ~25 arquivos órfãos deixados pela remoção do Customer360.

## O que foi encontrado

**Bug confirmado em mais 5 arquivos, 8 ocorrências** — não era isolado:
- `developments/homologation/page.tsx` (GET + POST)
- `developments/[id]/dossier/page.tsx` (GET + PATCH)
- `developments/[id]/region-study/page.tsx` (GET + POST + PATCH)
- `leads/deduplication/page.tsx` (GET + POST)
- `developments/materials/page.tsx` (GET + PATCH)

Todas as APIs correspondentes usam `apiError()` (retorna objeto `{code,message}`); todas as telas guardavam o valor bruto em `setError()`. Mesma classe de bug, mesmo risco: tela inteira quebra ao receber qualquer erro de negócio dessas rotas.

**7 outros pontos verificados e descartados como falso positivo** (a API correspondente só retorna string, não objeto) — evitando correção desnecessária: inventory, `leads/[id]/schedule`, `leads/[id]/simulation`, `developments/[id]/page.tsx`, `approvals` (rota de decisão), forgot/reset-password.

**26 arquivos órfãos confirmados e removidos** (não os ~25 estimados — a contagem exata era 26): componentes "folha" de `components/crm/customer/` e `components/crm/customer/intelligence/`, sem nenhum importador real fora da própria ilha morta. Verificado duas vezes, incluindo descarte manual de 2 falsos positivos por coincidência de substring (`CustomerBehaviorIntelligence`, interface de domínio `CustomerMemory` — não relacionados ao componente React).

## O que foi implementado

- 8 correções de renderização (mesmo padrão: `error?.message || error || fallback`)
- 26 remoções de arquivo (componentes órfãos)

## Nota de processo (auto-correção)

O primeiro commit desta entrega acabou incluindo as 26 remoções junto com as 5 correções de renderização (o `git rm` de um agente anterior já tinha deixado os 26 arquivos staged, e meu `git commit` capturou tudo). Como a branch nunca foi pushada, corrigido com `git reset --soft` + recommit em 2 partes corretas, sem perda de trabalho. Registro aqui porque a Regra 4 pede rastreabilidade — inclusive dos meus próprios erros de processo.

## Testes executados

```
npx tsc --noEmit       → 0 erros (repo inteiro)
npx eslint . --max-warnings 0 → 0 erros/warnings
npm run build           → completo (rodado pelo workflow)
```

## Pendências

Nenhuma pendência nova desta entrega. A dívida estrutural (schema drift, migrations) segue documentada no Adendo da Entrega 01.

## Riscos

Nenhum risco novo introduzido. Risco eliminado: 8 pontos de crash real em produção corrigidos.

## Próxima entrega

Com o padrão de erro-como-objeto varrido e o código morto conhecido limpo, as frentes seguras de código estão no fim do que dá para fazer sem tocar em banco. Próximo passo natural depende da decisão do usuário sobre migrations/deploy.

---

# Resumo para revisão (ChatGPT)

**Percentual:** 100% do escopo desta entrega concluído.

**Funcionalidades implementadas:** correção sistemática (não pontual) de uma classe de bug real; limpeza de 26 arquivos mortos.

**Funcionalidades simuladas:** nenhuma.

**Commits:** `77867969` (5 arquivos, 8 correções), `d017b364` (26 remoções).

**Build/lint/typecheck:** todos limpos, verificados duas vezes (pela verificação adversarial do workflow e por mim, independentemente).

**Riscos restantes:** nenhum introduzido por esta entrega.

**Recomendo revisar antes do merge:** nada específico desta entrega — mesma pendência de sempre (schema drift/migrations, fora do escopo de código).
