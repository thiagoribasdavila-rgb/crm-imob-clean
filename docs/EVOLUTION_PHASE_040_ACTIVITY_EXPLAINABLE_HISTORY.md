# Fase 040 — Histórico comercial explicável

## Resultado

A página Atividades deixou de ser um título vazio e agora apresenta o histórico comercial autorizado como uma linha do tempo útil. A primeira leitura mostra quatro sinais objetivos: registros do dia, contatos, clientes movimentados e total de registros visíveis.

As três movimentações mais recentes aparecem em ordem cronológica. Essa posição não representa score, risco, probabilidade ou previsão.

## Pesquisa e contexto

O histórico pode ser filtrado por hoje, sete dias, trinta dias ou pelo recorte carregado de até 500 registros. Também pode ser pesquisado por cliente, atividade e responsável e separado em seis categorias:

- contatos;
- movimentações;
- propostas;
- transferências;
- inteligência;
- integrações.

Os registros são agrupados por dia, com horário semântico, contexto disponível e acesso direto ao Lead 360 quando existe uma lead vinculada. A composição completa fica em divulgação progressiva, reduzindo a densidade inicial sem esconder informação.

## Fonte única e compatibilidade

A nova API autenticada consulta `public.activities` pela sessão do próprio usuário. A política RLS existente continua decidindo quais registros podem ser vistos conforme organização e hierarquia.

Depois da seleção autorizada, nomes de leads e responsáveis são enriquecidos no servidor somente para os identificadores já visíveis, dentro da mesma organização e pela mesma sessão com RLS. Metadados brutos não são devolvidos à tela. O mesmo classificador de categorias agora é compartilhado com a timeline do Lead 360, evitando interpretações divergentes.

## Decisão humana e segurança

A tela é somente leitura. Nenhuma atividade, tarefa, contato, mensagem, distribuição ou decisão é criada automaticamente. Abrir o Lead 360 e realizar qualquer ação comercial exige decisão humana explícita.

Não houve mudança de banco, schema, autenticação, RBAC, tenant ou RLS. Nenhum segredo ou metadado bruto foi exposto. Erros técnicos permanecem redigidos para o usuário e registrados somente na observabilidade do servidor. O bloqueio de homologação da Fase 020 não foi contornado.

## Experiência e acessibilidade

- Filtros usam botões nativos com `aria-pressed`.
- Carregamento usa `aria-busy` e atualizações usam região educada.
- Datas usam seções e horários usam o elemento `time`.
- Busca possui rótulo persistente.
- Novos alvos interativos possuem pelo menos 44 px.
- Celular e tablet preservam busca, filtros e contexto.
- A política de movimento reduzido continua respeitada.
- Realtime atualiza o histórico e a atualização manual permanece disponível como alternativa.

## Revisão React

A tela usa uma única leitura autenticada e uma única assinatura realtime. Filtros, grupos, sinais recentes e categorias são derivados do payload com `useMemo`; a função de carregamento é estável e reutilizada pela atualização manual e pelo realtime.

Não existe gravação no efeito nem cadeia de requisições por registro. O enriquecimento é realizado em lote no servidor.

## Medição

A fase melhora estruturalmente a explicação do histórico, mas não publica alegação de produtividade, velocidade ou conversão. O tempo real para localizar contexto depende de telemetria e homologação com perfis autorizados.

## Próxima fase

Fase 041 — **Melhorar Clientes 360**.

O próximo avanço deve tornar a visão unificada de clientes mais rápida para localizar relacionamento, lacunas de dados e próxima ação, sem misturar compradores, leads ativos e base de reativação.
