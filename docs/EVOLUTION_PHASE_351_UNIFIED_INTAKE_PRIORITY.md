# Fase 351 — Prioridade unificada da entrada

## Resultado desta entrega

A Sala de Comando passa a apresentar uma única próxima decisão para a entrada de leads, calculada com os agregados já existentes da fase 350. A leitura deixa de competir com vários alertas simultâneos e direciona o usuário para a fila compatível com seu papel.

Ordem determinística aplicada:

1. leads operacionais sem responsável;
2. origem ambígua que impede decisão confiável;
3. ausência de amostra operacional;
4. leads sem próxima ação;
5. primeira ação ainda não medida;
6. primeira ação acima de 15 minutos;
7. distribuição desequilibrada;
8. manutenção da cadência quando não há desvio comprovado.

## Segurança operacional

- A prioridade apenas recomenda e abre uma rota já existente.
- Nenhuma lead é distribuída, alterada ou contatada automaticamente.
- Toda decisão continua humana e auditável.
- Corretores nunca recebem atalho para a fila gerencial de distribuição.
- Bases históricas e reativações permanecem fora das métricas operacionais.
- Ausência de amostra aparece como “Aguardando amostra”, nunca como desempenho zero.
- A API continua protegida por organização, papel e hierarquia.

## Arquivos alterados

- `lib/analytics/lead-intake.ts`
- `app/api/v1/analytics/lead-intake/route.ts`
- `app/(crm)/dashboard/page.tsx`
- `app/globals.css`
- `tests/contracts/lead-intake-analytics.test.mjs`
- `config/value-delivery-phase-351-unified-intake-priority.json`

## Validações locais

- Regressão específica: 13/13 cenários aprovados.
- TypeScript ativo: aprovado.
- ESLint dos arquivos TypeScript alterados: aprovado, sem warnings.
- Responsividade: a decisão passa para uma coluna e alinha a ação à esquerda em telas estreitas.
- Contrato do programa: 10 ciclos, 50 fases e cobertura contínua de 350 a 399.
- Segurança: 4.346 arquivos verificados e nenhuma credencial detectada.

O build permanece reservado ao fechamento da release/ZIP, conforme a política do programa.

## Evidência real pendente

As seis variáveis locais necessárias à leitura autenticada continuam sem valor. Por isso, a implementação está validada, mas a decisão ainda não foi comprovada contra a operação real.

Enquanto essa evidência estiver ausente:

- a fase 351 não é marcada como homologada;
- `currentPhase` permanece em 349;
- nenhum percentual operacional é alegado;
- nenhum ZIP, deploy, migration ou escrita remota é executado.

## Prova de retomada

Após preencher as credenciais somente no ambiente seguro, executar uma leitura autenticada de `GET /api/v1/analytics/lead-intake?days=14` para diretor e corretor e registrar apenas:

- código e severidade da prioridade;
- rota de ação compatível com o papel;
- amostra agregada que fundamentou a decisão;
- confirmação de que nenhuma informação pessoal ou token foi retornado.

Somente após a prova das fases 350 e 351 o marcador oficial poderá avançar.

## Reversão segura

O campo `priority` é aditivo. A reversão consiste em retirar o bloco da Sala de Comando e o campo da resposta. Não há mudança de schema, migration nem dado remoto a desfazer.
