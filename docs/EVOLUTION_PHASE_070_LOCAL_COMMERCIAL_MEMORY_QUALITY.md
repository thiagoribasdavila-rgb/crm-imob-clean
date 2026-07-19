# ATLAS AI OS — Fase 70/3000

## Objetivo

Identificar tarefas comerciais concluídas pelo Copilot que ainda não possuem um resultado observado registrado. A correção deve ser curta, explicável e sempre confirmada por uma pessoa, sem usar IA generativa, prever conversão ou alterar automaticamente a operação.

## O que existia antes

- O Copilot já registrava a conclusão confirmada de tarefas vinculadas a leads.
- O usuário já podia informar o resultado real depois da execução.
- O resumo local e a comparação temporal mostravam somente resultados já registrados.
- Uma conclusão sem resultado permanecia invisível como lacuna de memória.

## Problema resolvido

Concluir uma tarefa sem registrar o que aconteceu reduz a utilidade do histórico para o próximo atendimento. A nova leitura separa conclusões elegíveis, resultados presentes e lacunas, priorizando as lacunas mais antigas em uma fila máxima de cinco itens.

## Alterações realizadas

### Controle factual de cobertura

- Somente eventos `copilot_task_completed` com confirmação humana entram como conclusão elegível.
- A tarefa precisa estar vinculada a uma lead.
- Um resultado só resolve a lacuna quando é humano, válido e posterior à conclusão considerada.
- A cobertura mostra `com resultado ÷ conclusões elegíveis`; não é score de qualidade, desempenho ou previsão.
- A idade registrada classifica a lacuna como recente, atenção ou antiga, sem inferir chance de venda.

### Fila curta e acionável

- As cinco lacunas mais antigas aparecem no Copilot com tarefa, lead e idade factual.
- `Registrar resultado observado` prepara o formulário governado já existente.
- O usuário escolhe o resultado, pode adicionar uma observação e confirma explicitamente a evidência.
- A API existente preserva validação de tarefa concluída, vínculo com lead, idempotência e auditoria.

### API segura e compatível

- A rota autenticada continua limitada à organização resolvida e ao cliente Supabase da sessão.
- RLS, limite de registros, rate limit e `Cache-Control: no-store` permanecem ativos.
- Rótulos atuais de tarefa e lead enriquecem a resposta em memória, sem alterar a tabela.
- Falha no histórico não bloqueia a fila operacional diária.

## Impacto operacional

- O corretor enxerga exatamente quais execuções ainda precisam de fechamento factual.
- O gerente distingue ausência de resultado de ausência de atividade.
- A memória ganha contexto útil sem contaminar score, pipeline ou comunicação.
- O custo generativo da identificação das lacunas é zero.

## Segurança e governança

- Nenhum resultado é deduzido ou preenchido automaticamente.
- O botão apenas prepara o fluxo; a escrita continua dependente da confirmação humana.
- A visibilidade segue tenant, sessão e RLS.
- Nenhum dado é enviado a um provedor externo.
- Nenhuma lead, tarefa, etapa, score, responsável, mensagem ou projeto foi alterado nesta fase.
- Nenhuma tabela ou coluna foi criada.

O [changelog oficial do Supabase](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) foi revisado em 18/07/2026. A mudança sobre exposição explícita de tabelas novas não afeta esta fase, que reutiliza `lead_events` e `tasks` existentes e não modifica o schema.

## Validação

- verificação dedicada da Fase 70;
- regressão do resumo e da comparação locais;
- regressão do registro governado de resultado;
- segurança das APIs;
- TypeScript sem emissão e sem cache incremental;
- ESLint e revisão das práticas React;
- varredura de segredos;
- `git diff --check`;
- programa contínuo completo.

Build e ZIP permanecem reservados ao gate único de release.

## Risco identificado

A fila mede somente conclusões elegíveis do Copilot que estão dentro da janela lida. Ela não representa toda a qualidade histórica do CRM e não pode ser apresentada como melhora de conversão.

## Checklist de validação

- [x] somente conclusões humanas vinculadas a leads são elegíveis;
- [x] resultados válidos e posteriores removem a lacuna;
- [x] cobertura e idade são cálculos locais e factuais;
- [x] fila curta prioriza as lacunas mais antigas;
- [x] correção exige escolha e confirmação humana;
- [x] idempotência e auditoria existentes foram reutilizadas;
- [x] organização, RLS, rate limit e `no-store` permanecem ativos;
- [x] nenhuma chamada generativa ou previsão é feita;
- [x] nenhuma escrita automática ou mudança de schema foi executada;
- [x] build e ZIP não foram gerados.

## Próxima etapa recomendada

Fase 71 — acrescentar contexto local de projeto e origem aos resultados confirmados, para permitir leituras descritivas úteis sem atribuição causal ou alteração automática.
