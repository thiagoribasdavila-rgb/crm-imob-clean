# Fase 159 — Meta Conversion Feedback Panel

## Objetivo

Criar um painel para separar eventos fracos e fortes de conversão antes de preparar qualquer feedback para Meta/Andromeda.

## Problema resolvido

Campanhas podem parecer boas quando geram volume, mas volume de lead bruto não é o mesmo que comprador real. A fase 159 cria uma leitura clara para o diretor entender quais sinais devem orientar aprendizado: lead recebido, lead qualificado, visita, proposta e venda.

## Alterações realizadas

- Criada seção `Feedback Meta · Andromeda` na tela de campanhas.
- Adicionados cards de eventos de conversão:
  - Lead recebido;
  - Lead qualificado;
  - Visita marcada;
  - Proposta enviada;
  - Venda ganha.
- Classificação dos eventos em:
  - sinal fraco;
  - sinal médio;
  - sinal forte;
  - sinal ouro.
- Criada métrica de maturidade de feedback.
- Adicionadas regras de governança para evitar automação cega.

## Impacto operacional

- O diretor sabe o que pode ser usado como aprendizado de público.
- O time evita escalar campanha com base apenas em lead barato.
- O CRM passa a orientar a Meta por qualidade comercial, não vaidade.
- Prepara a próxima camada: fila auditável de eventos candidatos.

## Segurança e governança

- Nenhuma Meta API foi acionada.
- Nenhum evento real foi enviado.
- Nenhuma campanha real foi alterada.
- Nenhuma migration foi criada.
- Nenhum dado pessoal foi exposto.

## Checklist de validação

- `npm run evolution:phase-159:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa recomendada

Fase 160 — criar a fila auditável de eventos candidatos para Meta, com deduplicação, consentimento, origem preservada e aprovação humana antes de envio real.
