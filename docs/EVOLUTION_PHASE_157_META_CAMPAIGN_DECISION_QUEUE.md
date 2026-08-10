# Fase 157 — Meta Campaign Decision Queue

## Objetivo

Transformar a análise de campanhas Meta em uma fila operacional clara para o diretor decidir: testar, ajustar, escalar ou pausar.

## Problema resolvido

Depois que a campanha é criada e o pacote de aprovação existe, ainda faltava uma ponte prática entre análise e execução. A Fase 157 reduz ambiguidade: cada campanha precisa cair em uma rota de decisão com próxima ação evidente.

## Alterações realizadas

- A página de campanhas ganhou a seção **Fila operacional pós-aprovação**.
- Foram criadas quatro rotas de decisão:
  - pronta para teste real;
  - em ajuste;
  - candidata a escala;
  - pausar ruído.
- A tela ganhou regras executivas para proteger conversão:
  - escalar só com evidência de comprador;
  - pausar sem perder histórico;
  - ajustar promessa quando a qualificação cair;
  - registrar decisão humana antes de mexer em verba.
- Foi criado o componente `DecisionQueueCard` para padronizar decisões e próximas ações.

## Impacto operacional

O diretor passa a decidir mais rápido, com menos ruído e mais clareza sobre o que fazer com cada campanha. A equipe deixa de tratar campanhas como “ativas ou inativas” e passa a operar com inteligência: testar, ajustar, escalar ou pausar conforme evidência comercial.

## Segurança e governança

- Nenhuma campanha real é alterada.
- Nenhuma verba é modificada.
- Nenhuma API externa é chamada.
- Nenhuma migration foi criada.
- A fila é uma camada de decisão visual e operacional, com execução humana.

## Checklist de validação

- `npm run evolution:phase-157:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa recomendada

Adicionar persistência segura para registrar a decisão do diretor: quem decidiu, quando decidiu, motivo, campanha, hipótese e próxima revisão.
