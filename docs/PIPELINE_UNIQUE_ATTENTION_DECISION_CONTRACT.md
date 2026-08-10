# Pipeline — contrato de atenção única

Data: 23 de julho de 2026

## Objetivo

Reduzir ruído no Kanban sem retirar informação comercial. A faixa **Decisão agora** passa a consolidar sinais sobre a mesma lead antes de apresentar a prioridade.

## Resultado de produto

- A mesma lead não é contada várias vezes quando possui SLA vencido, próxima ação atrasada e risco alto.
- A visão mostra quatro respostas objetivas: prioridade principal, atrasos únicos, leads quentes sem ação e valor financeiro em atenção.
- O botão principal virou um comando operacional: aplica foco, ordenação, modo compacto, modo foco e ocultação de colunas vazias de uma só vez.
- Valores extensos usam formato monetário compacto, mantendo o valor completo disponível ao apontar o cursor.
- O comando possui foco visual para navegação por teclado.

## Regras preservadas

- Sem alteração de banco, schema, API, autenticação, RBAC ou integração.
- Sem execução automática de ações comerciais.
- Sem remoção dos detalhes existentes do Kanban.
- Sem geração de dados fictícios.

## Validação

Executar:

```bash
npm run pipeline-decision-contract:check
```

O verificador protege a deduplicação da atenção, o comando completo da visão e os ajustes de legibilidade e acessibilidade.
