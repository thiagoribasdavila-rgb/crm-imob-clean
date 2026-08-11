# V3000 — Fase 50: objeção e lacuna decisiva

**Status:** implementada e validada em 11/08/2026.

## Objetivo

Reduzir o ruído do card comercial mostrando somente o fato que bloqueia o
próximo avanço. A leitura é individual por oportunidade, usa dados já
registrados e sempre oferece uma pergunta ou ação objetiva.

## Contrato factual

O card exibe no máximo um bloqueio, nesta prioridade:

1. objeção ativa registrada em metadado estruturado;
2. incompatibilidade factual entre cliente e empreendimento;
3. falta de retorno comprovada pelo relógio comercial;
4. primeira lacuna de qualificação necessária ao matching.

Notas livres, observações, resumos e textos de conversa não são evidência de
objeção. A Fase 50 não interpreta esses campos e não chama IA para classificá-los.
Uma objeção estruturada marcada como resolvida também não permanece ativa.

## Decisão mostrada no card

| Bloqueio | Leitura | Pergunta ou ação objetiva |
| --- | --- | --- |
| Preço | faixa ou condição incompatível/ausente | validar faixa e condição |
| Crédito | financiamento ou aprovação pendente | confirmar condição de crédito |
| Prazo | momento da compra ausente | definir prazo de compra |
| Região | prioridade geográfica divergente/ausente | confirmar região e motivo |
| Tipologia | necessidade incompatível/ausente | validar tipologia |
| Falta de retorno | silêncio factual registrado | retomar contato pelo melhor canal |

Quando nenhum desses fatos existe, o bloco não é renderizado. O card permanece
compacto e o Lead 360 continua sendo a fonte do histórico completo.

## Limites preservados

- nenhuma migration ou alteração no banco;
- nenhuma mutação de lead, etapa ou regra comercial;
- nenhuma inferência por IA;
- nenhuma transformação de nota livre em objeção;
- uma única objeção ou lacuna visível por oportunidade.

## Validação

```bash
npm run check:v3000:phase50
npm run test:v3000:phase50
npm run check:v3000:phase49
npm run test:v3000:phase49
npm run typecheck
git diff --check
```
