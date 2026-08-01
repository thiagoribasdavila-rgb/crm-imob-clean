# Fase 26 — Lead 360

## Missão

Transformar a lead em uma fonte única da verdade. O corretor deve entender em uma tela quem é o cliente, de onde veio, quem atende, qual projeto procura, o que já aconteceu e qual é a próxima ação.

## Mapa unificado

- identidade e dados comerciais;
- origem, campanha e memórias históricas;
- corretor responsável único;
- projeto e incorporadora;
- score, temperatura e prontidão;
- atividades e timeline;
- conversas, mensagens e canais;
- tarefas e próxima ação;
- oportunidades e pipeline;
- qualidade dos dados e lacunas relevantes.

Cada bloco abre o registro operacional correspondente. A tela não copia entidades nem cria uma segunda verdade.

## Segurança

O carregamento começa por `requireLeadAccess`. Leituras de atividades, oportunidades, conversas, mensagens, tarefas, campanha e memória são filtradas por organização; dados comerciais sob RLS usam o cliente autenticado. Labels de projeto e responsável são enriquecidos no servidor apenas depois da autorização da lead.

## Homologação

1. Abrir uma lead própria como corretor e conferir os dez blocos.
2. Tentar abrir uma lead lateral e confirmar bloqueio sem vazamento.
3. Conferir responsável, projeto, campanha e totais de mensagens na fonte original.
4. Registrar atividade e confirmar atualização da timeline e próxima ação.
5. Abrir mensagem, tarefa, projeto e pipeline pelos atalhos do mapa.
6. Validar lead sem projeto, campanha ou histórico e confirmar estados vazios úteis.
7. Medir se o corretor encontra contexto e próxima ação em menos de um minuto.
