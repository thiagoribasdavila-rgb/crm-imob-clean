# ATLAS AI OS — Fase 73/3000

## Objetivo

Comparar o volume factual de resultados humanos por projeto e origem entre duas janelas equivalentes, sem transformar diferença de contagem em avaliação de desempenho.

## Problema resolvido

A Fase 71 mostrava o contexto atual e a Fase 72 abria a composição dos resultados, mas a gestão ainda não conseguia verificar se o volume registrado em um projeto ou origem era diferente da janela imediatamente anterior. A nova leitura faz essa comparação sem calcular probabilidade, atribuir causa ou ordenar contextos por qualidade.

## Alterações realizadas

- Criado contrato tipado para comparação contextual.
- Comparados 30 dias atuais com os 30 dias imediatamente anteriores.
- Mantido apenas o resultado humano válido mais recente por tarefa em cada janela.
- Unificados projetos e origens presentes em qualquer uma das janelas.
- Exibidos somente volume atual, volume anterior e diferença numérica assinada.
- Mantidas lacunas de projeto e origem visíveis nos dois períodos.
- Contextos adicionais permanecem agregados e sem exposição individual de leads.
- Adicionado painel compacto no Copilot, depois da leitura factual por contexto.
- API autenticada continua usando o cliente do usuário, escopo da organização, RLS, rate limit e `no-store`.
- Nenhuma tabela, migration, registro comercial ou credencial foi alterado.

## Impacto operacional

Diretor, gerente e corretor podem observar se o volume registrado em projetos e origens mudou entre janelas iguais. A leitura ajuda a formular perguntas de operação, mas não declara melhora, piora, eficiência, conversão ou causa.

## Segurança e governança

- Somente eventos confirmados por pessoa e vinculados a uma lead entram na memória.
- Nenhum nome, telefone, e-mail ou mensagem individual aparece na comparação.
- Projeto e origem refletem o cadastro atual da lead, declarado na própria interface.
- Nenhum modelo generativo é chamado.
- Nenhuma recomendação, ranking, contato, transferência ou mudança de pipeline é executada.
- A consulta permanece limitada ao tenant e às políticas RLS do usuário autenticado.

## Risco identificado

Projeto e origem não são atributos históricos imutáveis no evento. Uma diferença bruta pode refletir tamanho da amostra, preenchimento ou alteração posterior do cadastro. Por isso a interface não usa taxas, cores de sucesso/fracasso nem linguagem causal.

## Checklist de validação

- [x] Janelas temporalmente equivalentes e sem sobreposição.
- [x] Último resultado humano válido por tarefa em cada janela.
- [x] Projeto e origem comparados por contagens brutas.
- [x] Lacunas de contexto preservadas.
- [x] Sem exposição individual de leads.
- [x] Sem chamada de IA externa.
- [x] Sem escrita no banco ou alteração de schema.
- [x] Contrato integrado à rota autenticada e ao Copilot.
- [x] Build e ZIP mantidos para o gate único de release.

## Próxima etapa recomendada

Fase 74 — permitir que a pessoa escolha, de modo supervisionado, uma janela curta, média ou longa para a memória comercial, preservando comparações equivalentes e os mesmos limites de interpretação.
