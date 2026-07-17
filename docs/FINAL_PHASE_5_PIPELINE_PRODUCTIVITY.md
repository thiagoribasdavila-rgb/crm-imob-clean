# Fase Final 5 — Pipeline, Kanban e produtividade

## Resultado

O funil mantém resposta visual imediata, mas agora só permite uma movimentação pendente por vez. Isso elimina o risco de um rollback antigo sobrescrever outra alteração iniciada enquanto a primeira ainda era confirmada.

## Movimentação segura

- O card muda de etapa de forma otimista.
- A API valida a etapa de origem esperada e registra o movimento na timeline.
- Falhas restauram o snapshot anterior.
- O último movimento confirmado pode ser desfeito com referência ao evento original.
- Arrastar, seletor e atalhos de teclado ficam temporariamente bloqueados enquanto a confirmação está em andamento.
- Estado ocupado, confirmação e erro são anunciados de forma acessível.

## Produtividade diária

A fila prioriza SLA do primeiro contato, próxima ação atrasada, ausência de compromisso futuro, temperatura, risco e score. O corretor recebe ação recomendada, motivo e acesso rápido à lead, mensagem e ligação.

## Continuidade

Foco, ordenação, densidade, colunas vazias e etapa móvel permanecem durante a sessão. A busca não é preservada para evitar guardar nome, telefone ou e-mail digitado no navegador.

## Experiência multicanal

O Kanban continua utilizável por arrastar, seletor de etapa, `Alt + ←/→` e abas no celular. Todas as alternativas acionam o mesmo fluxo governado, com rollback e auditoria.
