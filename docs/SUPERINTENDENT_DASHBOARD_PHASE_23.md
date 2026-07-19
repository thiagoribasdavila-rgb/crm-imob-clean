# Fase 23 — Dashboard do superintendente

## Missão

Dar ao superintendente uma leitura diária das equipes sob seu comando sem abrir números de estruturas paralelas ou da diretoria inteira. O painel compara gerentes diretos, aponta exceções e prepara conversas de gestão.

## O que o cockpit apresenta

- gerentes diretamente subordinados e seus corretores diretos;
- corretores online e disponíveis;
- carteiras ativas, leads quentes e entradas dos últimos sete dias;
- SLA de primeiro contato e follow-up separadamente;
- leads sem próxima ação;
- carga média de leads ativos por corretor e desequilíbrio entre equipes;
- conversão apenas quando a equipe possui pelo menos 30 leads;
- fila priorizada de apoio aos gerentes.

## Governança

O endpoint é exclusivo do perfil `superintendent`, exige organização autenticada e filtra gerentes por `reports_to`. Cada equipe inclui apenas corretores que respondem diretamente ao gerente. Leads sem responsável e estruturas paralelas não entram nos totais.

O painel é somente leitura. Ele não altera metas, não transfere leads e não penaliza gerentes automaticamente. Conversão com amostra baixa não gera comparação de desempenho.

## Homologação

1. Entrar com dois superintendentes de estruturas diferentes.
2. Confirmar que cada um vê somente seus gerentes diretos.
3. Validar presença, SLA, higiene, carga e totais com dados conhecidos.
4. Criar uma equipe com menos de 30 leads e confirmar “Amostra baixa”.
5. Confirmar que a soma das equipes coincide com o total reconciliado.
6. Medir se o superintendente encontra as três prioridades principais em menos de dois minutos.
