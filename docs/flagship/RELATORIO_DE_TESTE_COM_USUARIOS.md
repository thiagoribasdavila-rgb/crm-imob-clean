# RELATÓRIO DE TESTE COM USUÁRIOS

**2026-07-31.**

# NÃO EXECUTADO

Os testes pedidos — com um usuário que não conhece o sistema (seção 16) e com um
usuário experiente (seção 17) — **exigem pessoas**. Eu não posso hesitar diante
de um botão, não posso não entender um termo, e não posso cronometrar a minha
própria descoberta de uma tela cujo código eu escrevi.

Simular esses relatórios seria produzir o documento mais perigoso desta entrega:
uma validação de usabilidade que ninguém fez, assinada como se tivesse sido feita.

## O QUE FOI FEITO NO LUGAR, E VALE MENOS

Verificação de comportamento contra a rota real, com usuário descartável — que
prova que o sistema **responde certo**, não que alguém **entende** a tela:

| verificação | resultado |
|---|---|
| lista de leads: paginação, total, filtro, recorte | **8/8** |
| investimento na sala de comando | **13/13** |
| sombra de redistribuição, 3 execuções | fila estabiliza em 20 |
| baseline de conversão, 2 execuções | 370 linhas, 0 duplicatas |

## O PROTOCOLO, PRONTO PARA QUANDO HOUVER GENTE

**Usuário novo** — sem instrução, peça: localizar uma lead · entender a situação
dela · registrar contato · criar follow-up · mover no funil · achar um imóvel ·
ver a agenda · dizer qual é a prioridade de hoje.

Registre, sem ajudar: onde hesitou (>3 s parado) · onde clicou errado · que termo
não entendeu · que informação procurou e não achou · tempo por tarefa · o que
perguntou em voz alta.

**Usuário experiente** — peça velocidade: navegar só por teclado · aplicar e
manter filtros · agir em lote sobre 10 leads · editar sem sair da lista · voltar
ao mesmo ponto depois de salvar · ordenar · mudar status em série.

**A regra:** quem aplica o teste **não** é quem construiu a tela, e não responde
perguntas durante a execução. A primeira dúvida em voz alta é o achado — depois
dela, a pessoa já aprendeu e o dado se perde.
