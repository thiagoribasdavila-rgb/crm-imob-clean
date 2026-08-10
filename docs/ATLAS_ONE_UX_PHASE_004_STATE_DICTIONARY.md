# Atlas One — Fase 4: estados, cores e severidades

Data: 04/08/2026

## Resultado

O Atlas One passa a ter um único contrato semântico para estados operacionais. A cor deixa de ser decorativa e nunca atua como único sinal: rótulo, símbolo, significado e decisão esperada acompanham cada estado.

| Estado | Cor | Significado | Decisão |
|---|---|---|---|
| Informativo | Neutro | Contexto sem julgamento | Observar |
| Ação disponível | Azul | Próxima ação segura e opcional | Agir |
| Saudável | Verde | Evidência confirma operação esperada | Observar |
| Revisar | Âmbar | Desvio sem bloqueio imediato | Revisar |
| Agir agora | Rosa | Risco comprovado e imediato | Agir agora |
| Bloqueado | Rosa + borda tracejada | Dependência impede continuidade | Desbloquear |
| Amostra insuficiente | Violeta | Evidência ainda não permite decisão | Validar/coletar |
| Atualizando | Neutro | Leitura incompleta | Aguardar |

## Proteções

- Estado desconhecido cai em `neutral`, nunca em `healthy`.
- `insufficient` não é tratado como erro ou alerta.
- `blocked` e `critical` compartilham a família de risco, mas possuem rótulo, símbolo e tratamento visual diferentes.
- Os aliases legados são traduzidos em um ponto único.
- O contrato é compatível com os badges existentes; nenhuma tela precisa ser reescrita de uma vez.

## Primeira aplicação real

O selo de entrada e distribuição da Sala de Comando agora usa o estado semântico:

- amostra insuficiente → `insufficient`;
- desequilíbrio comprovado → `attention`;
- distribuição comprovadamente adequada → `healthy`.

## Escopo técnico

- Dicionário: `lib/ui/operational-state.ts`
- Componente: `components/atlas/status-badge.tsx`
- Primitivo visual: `components/ui/AtlasUI.tsx`
- Aplicação inicial: `app/(crm)/dashboard/page.tsx`
- Prova: `tests/contracts/operational-state-dictionary.test.mjs`

Não houve alteração de schema, RLS, autenticação, registros ou integrações.
