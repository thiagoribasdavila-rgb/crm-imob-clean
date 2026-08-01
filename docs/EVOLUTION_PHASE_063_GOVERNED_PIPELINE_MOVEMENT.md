# ATLAS AI OS — Fase 63/3000

## Objetivo da fase

Permitir que o **ATLAS COPILOT AI** prepare uma movimentação de pipeline para uma lead contextual, mantendo etapa atual, destino, confirmação humana, concorrência, auditoria e reversão sob controle.

## O que existia hoje

- Copilot contextual conectado ao Lead 360 e Clientes 360.
- Criação governada de tarefas concluída na fase 62.
- Pipeline real com etapas canônicas, isolamento por organização e visibilidade hierárquica.
- Contrato de movimentação com bloqueio otimista por etapa atual, histórico e reversão.

## Problema resolvido

Uma recomendação de avanço exigia sair do Copilot, localizar a lead no Kanban e repetir a decisão. Autorizar a IA a movimentar silenciosamente seria inseguro, especialmente quando duas pessoas trabalhassem na mesma lead.

## Alterações realizadas

1. Depois da resposta contextual, o Copilot consulta a lead autorizada e confirma sua etapa canônica atual.
2. A interface apresenta uma ação separada de pipeline, com etapa atual e destino editável.
3. A gravação exige revisão marcada e um comando explícito de confirmação.
4. A API recusa qualquer origem `atlas-copilot` sem `humanConfirmed: true`.
5. A movimentação reutiliza o contrato real do pipeline e informa `expectedFromStage`.
6. Se outra pessoa já movimentou a lead, a tentativa recebe conflito, atualiza a etapa visível e não sobrescreve o trabalho concorrente.
7. O histórico comercial registra origem, confirmação humana, etapa anterior, nova etapa e identificador da movimentação.
8. A interface oferece desfazer; a reversão só ocorre se a movimentação original continuar sendo a última etapa válida.
9. Falhas de auditoria mantêm a proteção compensatória já existente: a mudança é revertida para não deixar o pipeline sem histórico.

## Impacto operacional

- O corretor consegue avançar uma oportunidade a partir do contexto da IA sem perder o controle da decisão.
- O gerente preserva um Kanban confiável mesmo com trabalho simultâneo da equipe.
- Movimentos confirmados e reversões continuam explicáveis no histórico da lead.
- A ação economiza navegação sem transformar recomendação em automação silenciosa.

## Segurança e governança

- Nenhuma tabela, migration ou política de banco foi alterada.
- Nenhum dado real foi movimentado durante a implementação ou validação.
- A leitura da lead continua protegida por autenticação, tenant, perfil e escopo comercial.
- A escrita passa novamente por `requireLeadAccess` e pelo filtro de `organization_id`.
- A etapa esperada funciona como trava contra concorrência.
- A origem `atlas-copilot` exige confirmação humana também no servidor, não apenas na interface.
- O desfazer usa o identificador auditado da movimentação original e não apaga o histórico.

## Checklist de validação

- [x] Etapa atual carregada a partir da lead autorizada.
- [x] Prévia de destino separada da resposta gerada.
- [x] Confirmação humana obrigatória na interface e no backend.
- [x] Escopo de tenant e hierarquia preservado.
- [x] Bloqueio de alteração concorrente.
- [x] Histórico com origem e confirmação.
- [x] Opção segura de desfazer.
- [x] Falha de auditoria não deixa mudança órfã.
- [x] Nenhuma mudança de schema ou dado real.
- [x] Build e ZIP preservados para o gate de release.

## Risco identificado

Enviar mensagens externas ou concluir tarefas produz efeitos diferentes de movimentar o Kanban. Essas ações continuam somente em preparação até receberem contratos próprios de confirmação, idempotência, consentimento e recuperação.

## Próxima etapa recomendada

Fase 64: consolidar tarefas, atrasos e oportunidades contextuais em uma fila diária curta do Copilot, com prioridade explicável e ações governadas já disponíveis.
