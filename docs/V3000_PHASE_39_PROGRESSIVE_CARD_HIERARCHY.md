# V3000 — Fase 39: hierarquia progressiva dos cards

## Resultado

A Fase 39 reduz o ruído antes da decisão sem remover informação do CRM. O
contrato canônico da Fase 38 agora possui três níveis de leitura:

1. **Decisão em três segundos** — uma mensagem, relevância, urgência,
   evidência principal e uma ação.
2. **Contexto sob demanda** — descrição, evidências extras, explicação e
   atualização ficam em um disclosure nativo.
3. **Histórico no Lead 360** — a superfície operacional pode fornecer um
   controle para o histórico completo, sem repetir a jornada dentro do card.

## Regra da leitura imediata

Antes de expandir, `AtlasDecisionCard` aceita visualmente:

- uma mensagem principal;
- no máximo três sinais: relevância, urgência e evidência principal;
- uma ação primária.

O limite é exposto por `data-visible-signal-count` e protegido pelo gate da
fase. Evidências adicionais continuam disponíveis, mas ficam depois do
`<summary>`.

## Disclosure acessível e server-safe

O contexto usa `<details>` e `<summary>` nativos. Assim, a expansão funciona
com teclado e sem adicionar estado client-side, listeners ou JavaScript à
primitiva. O componente continua compatível com Server Components e recebe
ações por `ReactNode`.

Quando a tela possuir Lead 360, ela pode fornecer o acesso por:

```tsx
progressiveDisclosure={{
  contextLabel: "Ver contexto e histórico",
  historyControl: <Link href={`/leads/${leadId}`}>Abrir Lead 360</Link>,
}}
```

## Adoção controlada

Sala de Comando, Leads e Pipeline declaram o mesmo contrato progressivo por
`data-progressive-contract` e `data-progressive-reading`. Nenhuma consulta,
API, prioridade, drag and drop, persistência, autenticação, RLS ou tabela foi
alterada.

## Validação

```bash
npm run v3000:phase-39:check
npm run v3000:phase-39:test
```

O gate falha se a leitura imediata permitir mais de três sinais, se a ação
deixar de aparecer antes do contexto, se os detalhes vazarem para a primeira
camada ou se uma superfície prioritária perder o contrato.

## Próxima fase

A Fase 40 poderá aplicar densidade adaptativa por função e dispositivo sobre
esta hierarquia, sem reabrir o contrato nem alterar a operação real.
