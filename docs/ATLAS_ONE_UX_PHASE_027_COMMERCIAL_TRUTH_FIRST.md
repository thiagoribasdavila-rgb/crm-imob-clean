# ATLAS ONE — Fase 27: verdade comercial primeiro

## Objetivo

Responder, antes de qualquer análise administrativa, às três perguntas que destravam o atendimento: existe unidade disponível, qual é o preço de entrada e o kit comercial está vigente?

## Alterações

- O Hub de Materiais passou a consolidar o estoque canônico de `properties` por empreendimento.
- A primeira faixa de decisão mostra unidades disponíveis, menor preço ofertável e cobertura do kit vigente.
- Preço ausente aparece como **A confirmar**, nunca como `R$ 0`.
- A cobertura por incorporadora permanece disponível como análise secundária.
- Organização, autenticação, rate limit e modelo de materiais foram preservados.

## Impacto operacional

O corretor valida oferta e material antes de abordar o cliente. A gestão mantém a leitura de cobertura sem competir com a decisão comercial imediata.

## Limites

- Nenhuma migration, RLS, usuário ou dado foi alterado.
- Nenhuma publicação ou release foi gerada.
- Os valores refletem somente unidades atualmente classificadas como disponíveis no estoque canônico.

## Validação

- Contrato específico da Fase 27.
- Verificação estrutural da fase.
- TypeScript, lint e suíte integral do projeto.
