# ATLAS AI OS — Fase 76/3000

## Objetivo

Mostrar se cada janela da comparação comercial possui evidência factual suficiente para uma leitura descritiva responsável.

## Problema resolvido

O Atlas já diferenciava amostra inicial de leitura descritiva pela soma dos resultados atuais e anteriores. Esse critério permitia que uma janela muito grande compensasse outra quase vazia. A fase 76 passa a avaliar cada período separadamente e mostra ao usuário a contagem real e o que ainda falta.

## Alterações realizadas

- Definido um mínimo operacional transparente de 10 resultados humanos confirmados em cada janela.
- Substituída a suficiência baseada no total combinado pela suficiência por janela.
- Criado contrato tipado com status, contagens atuais e anteriores, faltantes e política de uso.
- Calculado o indicador localmente sobre a comparação já filtrada e autenticada.
- Mantidas as mesmas janelas equivalentes do controle de 7, 30 ou 90 dias.
- Adicionado card compacto e acessível no Copilot com os estados Sem amostra, Amostra inicial e Base disponível.
- Exibidos o total observado e o mínimo operacional lado a lado em cada período.
- Declarado de forma explícita que o critério não representa significância estatística, causa, previsão ou desempenho.
- Nenhum modelo, tabela, migration, registro comercial ou credencial foi alterado.

## Impacto operacional

Corretor, gerente e diretor passam a saber quando uma comparação está apoiada por evidência distribuída entre as duas janelas. Isso evita decisões precipitadas sobre recortes pequenos, principalmente quando um resultado específico foi selecionado, sem esconder os fatos disponíveis.

## Segurança e governança

- A leitura exige sessão válida e continua limitada à organização e ao escopo hierárquico.
- A API usa o cliente Supabase do usuário, o filtro de organização, RLS e resposta sem cache.
- O cálculo é local e determinístico; não chama OpenAI, Kimi ou qualquer outro provedor.
- Nenhuma mensagem é enviada, nenhuma tarefa é criada e nenhum card é movimentado.
- O limite é um guardrail de comunicação e não um teste estatístico.
- A cobertura e a fila de lacunas continuam globais, sem serem alteradas pelo filtro.

## Risco identificado

Um mínimo fixo não garante representatividade, qualidade do cadastro ou significância estatística. Por isso o Atlas usa o termo base descritiva, apresenta as duas contagens, mantém as limitações visíveis e não converte o indicador em score, taxa, ranking ou recomendação automática.

## Checklist de validação

- [x] Cada janela é avaliada separadamente.
- [x] O mínimo de 10 resultados por janela está explícito.
- [x] A janela maior não compensa uma janela insuficiente.
- [x] O recorte selecionado é respeitado.
- [x] Período atual e anterior continuam equivalentes.
- [x] Contagens e faltantes são expostos no contrato da API.
- [x] O componente possui rótulo acessível e estados claros.
- [x] Sem alegação de significância, causalidade, previsão ou desempenho.
- [x] Sem chamada de IA externa.
- [x] Sem escrita no banco ou alteração de schema.
- [x] Build e ZIP mantidos para o gate único de release.

## Próxima etapa recomendada

Fase 77 — permitir que a liderança consulte, em modo somente leitura, as evidências humanas que compõem o recorte atual para conferir a origem de cada contagem sem expor dados fora do seu escopo.
