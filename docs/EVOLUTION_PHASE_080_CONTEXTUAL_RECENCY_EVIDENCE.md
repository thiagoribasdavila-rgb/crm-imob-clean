# ATLAS AI OS — Fase 80/3000

## Objetivo

Permitir que o usuário confira, sob demanda, os fatos humanos mínimos que sustentam a recência de cada projeto e origem, sem expor identidade, contato ou conteúdo de conversa.

## Problema resolvido

A fase 79 mostrava a idade e o volume de resultados em cada contexto. Essa leitura era útil, mas ainda exigia confiança na contagem agregada. A fase 80 torna a recência auditável: ao abrir um contexto, o usuário vê quais resultados foram registrados e quando, sem transformar o painel em uma lista extensa.

## Alterações realizadas

- Adicionado contrato tipado de evidência mínima dentro de cada segmento de projeto e origem.
- Reutilizada a mesma amostra atual, filtrada, autorizada e humana da fila diária.
- Mantidos, para exibição, os dois resultados confirmados mais recentes de cada contexto visível.
- Preservada a quantidade de fatos adicionais quando a lista curta é atingida.
- Adicionado um segundo nível de progressive disclosure com `details` nativo e navegação por teclado.
- Exibidos somente o tipo de resultado e o horário observado.
- Excluídos nome da lead, título da tarefa, telefone, e-mail e conteúdo de mensagem.
- Nenhuma nova consulta, tabela, migration, chamada de modelo ou escrita operacional foi adicionada.

## Impacto operacional

Corretor e liderança conseguem validar rapidamente por que um projeto ou origem aparece como atual, em atenção ou desatualizado. A confirmação acontece no mesmo lugar, sem abrir outra tela, sem nova espera e sem poluir a rotina com dados pessoais desnecessários.

## Segurança e governança

- Sessão, organização, hierarquia e RLS continuam resolvidos antes da leitura.
- A API continua usando o cliente autenticado e resposta `no-store`.
- Apenas o último resultado humano confirmado por tarefa na janela atual participa.
- A evidência herda o período e o filtro supervisionado selecionados.
- A resposta contextual não inclui identidade, contato ou mensagem.
- O componente permanece somente leitura e não oferece execução automática.
- Não há ranking, nota de qualidade, causalidade, previsão ou ação downstream.
- Não houve mudança de schema nem criação de tabela pública; a mudança de exposição da Data API anunciada pelo Supabase não altera esta fase.

## Risco identificado

O projeto e a origem refletem o cadastro atual da lead no momento da leitura. O fato comprova o resultado e a data, mas não comprova que aquele contexto era o mesmo no momento histórico do registro. Essa proveniência será explicitada na próxima fase.

## Checklist de validação

- [x] Evidências vêm da mesma amostra autorizada da recência contextual.
- [x] Apenas resultados humanos confirmados na janela atual participam.
- [x] O resultado mais recente de cada tarefa prevalece.
- [x] Os fatos ficam em ordem do mais recente para o mais antigo.
- [x] O limite visual é dois fatos por contexto, com contagem preservada.
- [x] Nenhuma consulta adicional é disparada ao abrir os fatos.
- [x] Nome, tarefa, telefone, e-mail e mensagem não são exibidos.
- [x] O controle nativo pode ser operado por teclado.
- [x] Nenhuma ação comercial ou escrita é disparada.
- [x] Build e ZIP permanecem reservados ao gate único de release.

## Próxima etapa recomendada

Fase 81 — tornar explícita a proveniência do projeto e da origem, diferenciando o contexto atual da lead de um contexto historicamente registrado, sem alterar a operação.
