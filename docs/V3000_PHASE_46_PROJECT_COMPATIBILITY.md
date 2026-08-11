# V3000 — Fase 46: compatibilidade explicável entre cliente e projeto

## Objetivo

Dar ao corretor uma leitura curta e verificável da aderência entre o cliente e
o empreendimento associado ao lead. A entrega evita um falso score de
compatibilidade: cada linha mostra o dado real usado e o principal dado ausente
vira uma pergunta de qualificação.

## Entrega funcional

- o endpoint do Pipeline resolve projetos canônicos em `developments` e mantém
  compatibilidade de leitura com `crm_projects`;
- o enriquecimento usa, quando disponível, `lead_qualification_profiles` e os
  próprios campos operacionais do lead;
- o card compara faixa de preço, região e tipologia somente quando existem
  dados dos dois lados;
- prazo e objetivo aparecem como sinais conhecidos, sem alegar aderência que o
  cadastro do projeto ainda não comprova;
- o painel progressivo lista as evidências e uma única “Pergunta que destrava”.

## Regra de honestidade

A Fase 46 não cria score, percentual ou probabilidade de compatibilidade. Um
dado ausente nunca é convertido em baixa aderência. Ele é removido da lista de
evidências e apresentado como pergunta concreta para o próximo contato.

Uma divergência só recebe o estado `attention` quando ambos os valores são
conhecidos — por exemplo, faixas de preço que não se sobrepõem. Informações
parciais são tratadas como qualificação pendente.

## Segurança operacional

- todas as consultas são limitadas ao `organization_id` autenticado;
- leitura somente leitura, sem mutation e sem migration;
- nenhuma chamada de IA e nenhum custo de modelo;
- falhas nas fontes complementares não derrubam o Pipeline;
- a ação primária única e a continuidade da conversa permanecem intactas.

## Aceite

Ao expandir “Cliente × projeto”, o corretor vê o nome do empreendimento, os
sinais factuais usados e o dado mais importante ainda ausente. A interface não
mostra percentual, chance de venda ou linguagem preditiva sem método e amostra.

## Validação

```bash
npm run check:v3000:phase46
npm run test:v3000:phase46
npm run check:v3000:phase45
npm run test:v3000:phase45
npm run typecheck
git diff --check
```

O build completo e o ZIP continuam reservados ao gate de release do ciclo.
