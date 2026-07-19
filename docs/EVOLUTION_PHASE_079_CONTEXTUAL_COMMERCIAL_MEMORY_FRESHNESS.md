# ATLAS AI OS — Fase 79/3000

## Objetivo

Mostrar em quais projetos e origens a memória comercial possui fatos humanos recentes, precisa de atualização ou está desatualizada, mantendo a leitura estritamente descritiva.

## Problema resolvido

A fase 78 tornou visível a idade do último fato do recorte completo. Porém, um único registro recente poderia ocultar que outro projeto ou outra origem estava sem aprendizado atual. A fase 79 separa essa recência pelos contextos já existentes no cadastro atual das leads.

## Alterações realizadas

- Criado contrato tipado de recência contextual por projeto e origem.
- Reutilizada a mesma amostra filtrada, autorizada e humana da fila diária.
- Mantidos os limites transparentes: atual até 72 horas, atenção entre 72 e 168 horas e desatualizada após 168 horas.
- Exibidos o último fato, a idade e o número de resultados confirmados de cada contexto.
- Tornados explícitos os resultados cujo projeto ou origem ainda não estão preenchidos.
- Preservadas as quantidades dos contextos recolhidos quando o limite visual é atingido.
- Adotada ordem alfabética para impedir interpretação como ranking de desempenho.
- Aplicado progressive disclosure com um bloco recolhido por padrão no Copilot.
- Nenhuma consulta, tabela, migration, chamada de modelo ou escrita operacional foi adicionada.

## Impacto operacional

Corretor e liderança conseguem perceber onde a memória precisa ser alimentada sem navegar por painéis extensos. Isso reduz a falsa impressão de que toda a operação está atual porque um único projeto recebeu um registro recente.

## Segurança e governança

- Sessão, organização, hierarquia e RLS continuam resolvidos antes do cálculo.
- O cálculo usa apenas o último resultado humano confirmado por tarefa na janela atual.
- Projeto e origem vêm do contexto atual da lead já lido pela rota autorizada.
- O filtro supervisionado de resultado também recorta a nova leitura.
- Nenhum telefone, e-mail, mensagem ou credencial é incluído.
- Não há ranking, nota de qualidade, causalidade, previsão ou ação downstream.
- Não houve mudança de schema nem criação de tabela pública.

## Risco identificado

A idade de um contexto representa o fato confirmado mais recente associado a ele. Ela não comprova que todas as leads daquele projeto ou origem estejam atualizadas e não deve ser usada como nota de desempenho ou conversão.

## Checklist de validação

- [x] Recência usa somente a janela atual selecionada.
- [x] Apenas o último resultado humano confirmado por tarefa participa.
- [x] Eventos futuros, inválidos, duplicados ou não confirmados não participam.
- [x] Projeto e origem são calculados separadamente.
- [x] Contextos ausentes permanecem visíveis como lacuna de cadastro.
- [x] Ordem visual é alfabética e não representa ranking.
- [x] Contextos recolhidos preservam contagem e quantidade de fatos.
- [x] Filtro supervisionado também recorta a recência contextual.
- [x] Sem nova consulta, IA externa, escrita no banco ou alteração de schema.
- [x] Build e ZIP mantidos para o gate único de release.

## Próxima etapa recomendada

Fase 80 — permitir conferir, sob demanda, as evidências humanas que sustentam a recência de um projeto ou origem, mantendo dados pessoais protegidos e nenhuma ação automática.
