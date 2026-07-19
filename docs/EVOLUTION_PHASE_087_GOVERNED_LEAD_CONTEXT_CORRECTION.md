# ATLAS AI OS — Fase 87/3000

## Objetivo

Permitir que a equipe corrija projeto e origem atuais diretamente na Lead 360, com evidência humana, validação de organização, proteção contra alteração concorrente e auditoria, sem reescrever memória histórica.

## Problema resolvido

A fase anterior mostrava as lacunas antes de registrar um resultado, porém o atalho levava ao cadastro geral e a origem ainda podia ser alterada pelo formulário comum sem justificativa específica. Isso tornava a correção mais lenta e permitia que o estado atual mudasse sem um evento contextual próprio.

## Alterações realizadas

- Criado contrato tipado para normalizar, validar, comparar e auditar projeto e origem.
- A Lead 360 recebe a lista de projetos da organização autenticada e mostra o contexto atual em um bloco compacto.
- Projeto e origem são corrigidos juntos ou separadamente no mesmo formulário.
- O motivo possui mínimo de dez caracteres e a confirmação humana é obrigatória.
- A API exige os valores que o usuário revisou e compara com a versão atual antes de salvar.
- Projeto selecionado é validado em `crm_projects` dentro da organização autenticada.
- Divergência concorrente devolve conflito e preserva a correção mais recente.
- Depois da atualização, a timeline recebe o evento `commercial_context_corrected` com antes, depois e motivo.
- Se a auditoria falhar, a API tenta desfazer a atualização usando as mesmas condições de concorrência.
- O formulário geral mantém a origem somente para leitura; qualquer alteração passa pelo fluxo governado.
- Os atalhos de lacuna do Copilot abrem diretamente o bloco `#commercial-context`.

## Impacto operacional

O corretor corrige uma lacuna no ponto em que já está analisando a lead, sem procurar outra tela. O gerente consegue identificar quem corrigiu, por que corrigiu e quais valores eram anteriores. Novos resultados passam a usar o contexto atual revisado, enquanto resultados antigos continuam representando o que era conhecido no momento original.

## Segurança e governança

- Sessão, organização e escopo individual da lead permanecem obrigatórios.
- A lista de projetos é filtrada por `organization_id` e o servidor repete essa validação no salvamento.
- O cliente não pode enviar um projeto de outro tenant.
- Edição concorrente não sobrescreve silenciosamente valor mais recente.
- Justificativa e confirmação humana são obrigatórias.
- A alteração do estado atual e o evento auditável formam uma unidade compensável: falha de auditoria aciona rollback protegido.
- Não há preenchimento por IA, inferência, score, ranking, mensagem automática ou exposição de contato.

## Compatibilidade

- Usa somente `leads.project_id`, `leads.source`, `crm_projects` e `lead_events` já existentes na base viva V2.
- Não adiciona migration, tabela, coluna, dependência ou variável da Hostinger.
- A leitura continua usando o adapter `mapLegacyLead`, que expõe `project_id` como `development_id` para a interface atual.
- Snapshots de resultados comerciais previamente registrados não são atualizados.

## Risco identificado

Duas pessoas podem abrir a mesma lead e revisar valores diferentes. Para impedir perda silenciosa, a API condiciona a escrita ao projeto e à origem vistos pelo usuário. Se eles mudaram, retorna conflito e exige nova revisão.

## Checklist de validação

- [x] Projeto e origem atuais aparecem juntos na Lead 360.
- [x] Somente projetos da organização autenticada podem ser escolhidos.
- [x] Motivo auditável é obrigatório.
- [x] Confirmação humana é obrigatória.
- [x] Alteração concorrente impede sobrescrita silenciosa.
- [x] Origem não pode mais ser alterada pelo formulário comum.
- [x] Timeline recebe evento com contexto anterior e atual.
- [x] Falha da auditoria tenta restaurar o estado anterior.
- [x] Memórias e snapshots históricos permanecem imutáveis.
- [x] Build e ZIP permanecem reservados ao gate de release.

## Próxima etapa recomendada

Fase 88 — apresentar a correção contextual na timeline de modo explicável e deixar claro que seu efeito vale para decisões e resultados futuros, sem alterar fatos históricos.
