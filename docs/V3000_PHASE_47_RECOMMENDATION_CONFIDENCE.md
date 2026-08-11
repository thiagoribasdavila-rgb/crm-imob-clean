# V3000 Fase 47 — confiança e explicação da recomendação

## Objetivo

Tornar a priorização do pipeline auditável sem criar uma falsa promessa de
previsão. O card passa a responder, sob demanda, por que uma oportunidade está
na fila, qual dado originou a leitura e quando a base foi avaliada.

## Quatro conceitos separados

1. **Score cadastrado:** valor operacional já armazenado no CRM. Ele é exibido
   como dado de origem e não como probabilidade de venda.
2. **Prioridade operacional:** ação produzida pelas regras já existentes de SLA,
   agenda, temperatura e estágio.
3. **Confiança da recomendação:** leitura qualitativa da cobertura dos sinais
   registrados. Pode ser evidência inicial, média ou alta.
4. **Confiança da IA:** permanece **Não aferida**, porque esta fase não chama um
   modelo nem possui amostra validada para medir precisão.

## Método e origem

A confiança qualitativa considera até nove sinais factuais: score,
temperatura, etapa, origem/campanha, responsável, última interação, próxima
ação, SLA de primeiro contato e evidência cliente × projeto.

- 0 a 3 sinais: evidência inicial;
- 4 a 6 sinais: evidência média;
- 7 a 9 sinais: evidência alta.

O método é identificado na interface como `Regras operacionais explicáveis` e
a origem como `Dados registrados no CRM`. A data da última atualização usada na
leitura também fica visível.

## Limites deliberados

- nenhuma porcentagem é apresentada como chance de venda;
- o peso percentual da etapa é identificado como peso do forecast;
- nenhuma migration, chamada de IA ou mutação comercial foi adicionada;
- a explicação fica em disclosure progressivo para preservar a leitura compacta;
- `Não representa probabilidade de venda` aparece junto da evidência.

## Validação

```bash
npm run check:v3000:phase47
npm run test:v3000:phase47
npm run check:v3000:phase46
npm run test:v3000:phase46
npm run typecheck
git diff --check
```

O build e o ZIP continuam no gate de release consolidado, evitando um artefato
novo a cada fase visual.
