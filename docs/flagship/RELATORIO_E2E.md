# RELATÓRIO E2E

**2026-07-31.**

# NÃO EXECUTADO

**Não existem testes end-to-end neste projeto.** Playwright não está instalado
(`@playwright/test`, `playwright`, `puppeteer`: todos ausentes do `package.json`).

Os 6 fluxos exigidos — entrada e distribuição · atendimento e follow-up ·
negociação e proposta · hierarquia e permissões · reativação · agência de
campanhas — **não foram exercitados ponta a ponta**.

Escrever este relatório com resultados seria inventar a validação mais cara de
todas.

## O QUE FOI EXERCITADO NO LUGAR — e vale menos

Verificação contra a **rota real**, autenticada, com usuário descartável: 8/8 na
lista de leads, 13/13 no investimento, e as execuções repetidas dos três workers.
Isso prova que **a API responde certo**. Não prova que **uma pessoa consegue
concluir uma tarefa** atravessando telas.

E smoke test com a aplicação **de pé**, servida do pacote: `/login` 200,
`/api/v1/ready` 503 declarado, redirect 308.

## O QUE FALTA PARA ESTA SEÇÃO EXISTIR

```bash
npm i -D @playwright/test
npx playwright install chromium webkit firefox
```

Depois, um arquivo por fluxo, com usuário descartável por execução e limpeza no
final. **Sem escrever dado fictício em produção** — que é a razão de isto não ter
sido improvisado agora: `atlas-v3-homologacao` **é** a produção, e um E2E que
cria lead de teste polui a base que a diretoria lê.

**A ordem correta é: ambiente de teste isolado primeiro, E2E depois.** Fazer o
inverso troca cobertura por contaminação.
