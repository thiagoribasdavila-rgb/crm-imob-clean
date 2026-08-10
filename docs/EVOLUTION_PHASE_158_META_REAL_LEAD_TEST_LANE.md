# Fase 158 — Meta Real Lead Test Lane

## Objetivo

Transformar a validação das campanhas Meta em uma esteira objetiva de teste real de lead: entrada no Atlas, qualificação, handoff comercial e feedback de conversão.

## Problema resolvido

Antes a operação podia enxergar a campanha como “publicada”, mas ainda faltava um caminho simples para confirmar se uma lead real entrou corretamente, foi qualificada e gerou sinal útil para aprendizado de público.

## Alterações realizadas

- Criada a seção `Teste real de lead Meta` na tela de campanhas.
- Adicionada régua com quatro etapas:
  - entrada real Meta;
  - qualificação do cliente;
  - handoff comercial;
  - feedback de conversão.
- Adicionada métrica de prontidão do teste real.
- Criado checklist do diretor para aprovar a validação antes de escala.
- Reforçada a regra de negócio: Andromeda melhora com sinais limpos do CRM, não com lead bruto isolado.

## Impacto operacional

- O diretor consegue decidir se a campanha está pronta para escalar.
- O time sabe exatamente o que falta para validar uma campanha.
- A IA e o CRM ficam orientados para conversão real: qualificado, visita, proposta e venda.
- Reduz ruído entre marketing e comercial.

## Segurança e governança

- Nenhuma API externa foi acionada.
- Nenhuma campanha real foi alterada.
- Nenhuma migration foi criada.
- Nenhum segredo foi exposto.
- A etapa é visual e operacional, usando sinais já existentes do snapshot.

## Checklist de validação

- `npm run evolution:phase-158:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa recomendada

Fase 159 — criar o painel de conversões enviáveis para Meta, separando eventos fracos e fortes para preparar o feedback de aprendizado sem automação indevida de verba.
