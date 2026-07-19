# Fase 54 — Transferência controlada entre equipes

Diretor e superintendente podem selecionar uma carteira e escolher um gerente de destino. O gerente funciona como destino organizacional: cada lead é atribuída diretamente a um corretor ativo e elegível de sua equipe, sem criar posse intermediária pelo gerente.

A distribuição considera o projeto da lead, a habilitação e o peso do corretor no projeto, a carga atual ponderada e a última atribuição. O processo é atômico, bloqueia concorrência, respeita a hierarquia, mantém um único responsável, realinha tarefas abertas e grava lote, itens e atividade para auditoria.

Homologar diretor, superintendente, dois tenants, gerente fora do escopo, equipe vazia, corretor inativo, projeto desabilitado, pesos diferentes, 200 leads, concorrência, tarefas e histórico. Execute `npm run team-transfer:check`.
