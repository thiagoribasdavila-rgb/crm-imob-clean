# ATLAS AI OS — Fase 82/3000

## Objetivo

Preservar, nos novos resultados comerciais confirmados por uma pessoa, o projeto e a origem observados no cadastro da lead naquele momento.

## Problema resolvido

Até a fase 81, o Atlas sabia quando o resultado havia sido confirmado, mas projeto e origem eram resolvidos apenas no momento da consulta. Se a lead mudasse depois, a memória poderia mostrar o contexto atual sem possuir uma fotografia histórica. A ausência era transparente, porém ainda limitava a leitura operacional.

## Alterações realizadas

- Reutilizado o fluxo governado e idempotente já existente para registrar resultado de tarefa concluída.
- Antes de uma nova gravação, a API confirma a lead no mesmo tenant autenticado e lê somente `id`, `project` e `source`.
- Projeto e origem são normalizados e limitados antes de entrar no metadata do evento.
- Criado o objeto versionado `metadata.commercialContextSnapshot` na tabela existente `lead_events`.
- O snapshot registra base, versão e horário da captura, incluindo valores nulos quando o cadastro ainda não os possui.
- A gravação falha de forma segura se o contexto não puder ser confirmado; a tarefa permanece concluída e o usuário pode tentar novamente.
- A leitura aceita como histórica somente a versão conhecida, com base esperada e horário válido.
- Resultados novos usam o contexto preservado na leitura de recência contextual.
- Resultados antigos continuam usando o cadastro atual como fallback explicitamente identificado.
- O Copilot mostra quantos fatos possuem contexto preservado e quantos ainda dependem do fallback legado.
- Cada evidência aberta informa se o contexto foi preservado no resultado ou consultado no cadastro atual, com o respectivo horário.

## Impacto operacional

Os novos aprendizados passam a manter o contexto comercial do momento da confirmação. Isso melhora a auditabilidade por projeto e origem sem atribuir causa, prever conversão ou mudar a operação automaticamente. A gestão também consegue distinguir memória histórica real de compatibilidade legada.

## Segurança e governança

- A captura só ocorre depois de confirmação humana explícita, em tarefa concluída e vinculada a uma lead.
- A chave de idempotência continua impedindo duplicidade do mesmo resultado.
- Sessão, organização, hierarquia e RLS são resolvidos antes da leitura e da escrita.
- O cliente autenticado continua sendo usado; não foi introduzido cliente administrativo.
- O snapshot não armazena nome, telefone, e-mail, mensagem ou outro dado de contato.
- Nenhuma tabela, coluna, migration ou grant foi criada.
- O [changelog oficial do Supabase](https://supabase.com/changelog) foi revisado; as mudanças recentes de gateway self-hosted não alteram este fluxo autenticado na plataforma usada pelo Atlas.
- Não há chamada de IA, score, ranking, disparo de mensagem ou ação downstream.

## Compatibilidade

- Novo resultado: `historical_outcome_snapshot`.
- Resultado antigo sem snapshot: `current_lead_snapshot`.
- Janela com os dois tipos: `mixed`.
- Nenhum evento antigo é regravado, reconstruído ou inferido.
- A fase 82 aplica o snapshot à recência contextual. As demais leituras contextuais anteriores continuam no contrato atual até a propagação controlada da fase 83.

## Risco identificado

Os resultados anteriores à fase 82 não ganham contexto histórico retroativamente. Além disso, o snapshot preserva os rótulos textuais disponíveis no momento, não identificadores imutáveis de projeto ou campanha. Essa limitação permanece visível e será considerada nas fases seguintes.

## Checklist de validação

- [x] A captura reutiliza a escrita governada existente.
- [x] Lead, organização e contexto são confirmados antes da gravação.
- [x] Snapshot é versionado, sanitizado e não contém contato pessoal.
- [x] Falha de contexto impede gravação parcial do resultado.
- [x] Repetição idempotente não cria nem altera outro evento.
- [x] Eventos novos e antigos permanecem legíveis na mesma janela.
- [x] Contexto histórico tem precedência somente quando comprovado no metadata.
- [x] Fallback legado e janela mista ficam explícitos no contrato e na interface.
- [x] Evidências exibem a base e o horário do contexto sem revelar identidade.
- [x] Nenhuma migration, tabela, coluna ou chamada de modelo foi adicionada.
- [x] Build e ZIP permanecem reservados ao gate único de release.

## Próxima etapa recomendada

Fase 83 — propagar, de forma controlada, a preferência pelo contexto histórico comprovado para os demais resumos, comparações e evidências comerciais, mantendo o fallback legado e seus limites visíveis.
