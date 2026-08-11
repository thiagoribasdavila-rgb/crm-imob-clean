# V3000 — Fase 44: Uma ação primária por oportunidade

## Resultado

O card do Pipeline agora escolhe um único comando dominante usando os sinais
operacionais que já existiam. O corretor deixa de comparar uma fileira de
atalhos e inicia, em um clique, a ação mais útil para aquela oportunidade.

## Seleção contextual

| Evidência real | Comando dominante |
| --- | --- |
| Primeiro contato vencido | abrir WhatsApp agora |
| Follow-up vencido | retomar conversa |
| Sem próxima ação | registrar compromisso |
| Etapa de visita | confirmar visita |
| Etapa de proposta | revisar proposta |
| Quente ou score alto | avançar para a próxima etapa |
| Demais oportunidades com telefone | falar com cliente |
| Sem telefone | preparar abordagem com o Copilot |

## Redução de ruído

- card, decisão mobile e preview usam o mesmo seletor de ação;
- somente uma ação recebe peso visual dominante;
- Lead 360, resumo por IA, preview e avanço alternativo ficam no contexto
  expandido;
- o avanço não é repetido quando já é o comando principal;
- foco por teclado e rótulos textuais preservam acessibilidade.

## Segurança da mudança

- nenhum schema, migration, policy, API ou dado foi alterado;
- SLA, próxima ação, etapa, temperatura e score existentes continuam sendo as
  evidências da decisão;
- WhatsApp é aberto somente quando há telefone válido;
- nenhuma ação externa é executada automaticamente;
- as ações secundárias permanecem acessíveis, sem competir no primeiro nível.

## Arquivos centrais

- `app/(crm)/pipeline/page.tsx`
- `app/globals.css`
- `config/v3000-phase-44-single-primary-action.json`
- `scripts/check-v3000-phase-44-single-primary-action.mjs`
- `tests/contracts/v3000-phase-44-single-primary-action.test.mjs`
