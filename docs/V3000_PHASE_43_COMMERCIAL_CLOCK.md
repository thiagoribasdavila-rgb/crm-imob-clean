# V3000 — Fase 43: Relógio comercial contextual

## Resultado

O card do Pipeline agora traduz os sinais temporais já existentes em decisão
operacional. O corretor vê, sem abrir o Lead 360:

- qual prazo está em jogo;
- o que causou a urgência;
- qual impacto comercial é provável;
- qual ação deve ser executada.

## Estados cobertos

| Estado | Prazo exibido | Decisão |
| --- | --- | --- |
| Primeiro contato vencido | tempo real do SLA vencido | contatar agora |
| Primeiro contato dentro do prazo | tempo restante real | proteger conversão |
| Próxima ação vencida | data do compromisso | retomar combinado |
| Próxima ação futura | data agendada | manter cadência |
| Sem próxima ação | definir agora | registrar compromisso |
| Ciclo encerrado | sem prazo operacional | revisar resultado |

## Segurança da mudança

- nenhum schema, migration, policy ou dado foi alterado;
- a fórmula de SLA existente foi preservada;
- a próxima ação continua sendo a fonte de prazo do compromisso;
- o relógio é uma camada de apresentação derivada;
- cor nunca é o único sinal: estado, causa, prazo, impacto e ação são textuais.

## Arquivos centrais

- `app/(crm)/pipeline/page.tsx`
- `app/globals.css`
- `config/v3000-phase-43-commercial-clock.json`
- `scripts/check-v3000-phase-43-commercial-clock.mjs`
- `tests/contracts/v3000-phase-43-commercial-clock.test.mjs`
