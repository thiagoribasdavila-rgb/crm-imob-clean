# V3000 — Fase 49: atribuição da campanha até a oportunidade

## Objetivo

Permitir que a diretoria acompanhe, dentro do card da oportunidade, o caminho
factual **campanha → lead → corretor → etapa**, sem duplicar contagens, misturar
incorporadoras ou criar atribuições por inferência.

## O que foi adotado

- rastro individual por oportunidade, sem agregação no card;
- campanha, lead, corretor e etapa em ordem operacional;
- origem, projeto e incorporadora como contexto explícito;
- estado parcial quando qualquer vínculo registrado estiver ausente;
- estado de conflito quando campanha e projeto apontarem para incorporadoras
  diferentes;
- abertura progressiva para preservar a leitura principal do Kanban;
- Lead 360 e histórico comercial mantidos sem alteração.

## Regra factual

O rastro consome somente campos e metadados já registrados no CRM. Ausência de
campanha, responsável, origem, projeto ou incorporadora é exibida como ausência;
nenhum vínculo é criado por texto parecido, proximidade temporal ou sugestão da
IA.

Cada card representa uma oportunidade. A Fase 49 não soma leads, custos ou
receitas e, portanto, não cria uma segunda contagem paralela aos relatórios.

## Proteção entre incorporadoras

Quando o identificador da incorporadora associado ao projeto diverge do
identificador registrado na campanha, o rastro assume `conflict`, orienta a
revisão humana e impede a exibição financeira. Isso evita atribuir resultado de
uma incorporadora a outra.

## Custos e receita

Valores financeiros aparecem somente quando todas as condições abaixo são
verdadeiras:

1. o rastro está completo e sem conflito;
2. início e fim do período são datas válidas e ordenadas;
3. custo e receita são valores explícitos, finitos e não negativos.

O pipeline atual não fornece ao card um período financeiro validado. Por isso,
custos e receita permanecem ocultos por desenho, mesmo quando a identificação
comercial está completa. A interface não estima nem inventa valores.

## Impacto técnico

- nenhuma migration;
- nenhuma alteração de API ou banco;
- nenhuma mutação comercial;
- nenhuma chamada de IA;
- leitura compatível com os dados existentes;
- contrato e testes isolados para evitar regressão.

## Aceite

A diretoria consegue abrir o rastro de uma oportunidade e seguir campanha,
lead, corretor e etapa, com projeto e incorporadora visíveis, sem contagem
duplicada e sem cruzamento silencioso entre incorporadoras.
