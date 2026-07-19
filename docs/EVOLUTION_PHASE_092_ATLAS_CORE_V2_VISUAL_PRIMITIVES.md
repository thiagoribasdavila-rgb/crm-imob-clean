# ATLAS AI OS — Fase 92/3000

## Objetivo

Tornar o ATLAS mais intuitivo, moderno e silencioso visualmente sem esconder as informações que ajudam a converter leads em vendas.

Esta fase consolida o sistema visual do Core V2. Ela não cria uma interface paralela, não altera autenticação, banco ou regras comerciais e não redesenha cada página isoladamente.

## Problema resolvido

As telas possuíam boa riqueza de informação, mas vários elementos competiam pela atenção: gradientes, brilhos, elevação, orbes, títulos grandes, cards altos e muitas cores de destaque.

O custo para o usuário era alto:

- mais tempo para entender o que exige ação;
- métricas importantes e auxiliares pareciam ter o mesmo peso;
- estados vazios e falhas ocupavam espaço excessivo;
- cada módulo podia repetir uma solução visual diferente.

## Modelo de informação

O Core V2 agora organiza conteúdo em três profundidades:

1. **Visão rápida:** propósito da página, uma ação principal e até cinco indicadores para decisão.
2. **Área de trabalho:** fila de prioridades e a lista, tabela ou quadro usado para executar.
3. **Contexto:** histórico, evidências e configurações sob demanda.

Detalhes continuam disponíveis, mas deixam de concorrer com a próxima ação.

## Alterações realizadas

### Tokens semânticos

Foram definidos tokens oficiais para:

- canvas, navegação e superfícies;
- três níveis de texto;
- bordas, foco e elevação;
- espaços, densidade e controles;
- movimento e redução de movimento;
- azul Atlas como cor de ação;
- verde, âmbar e rosa apenas para estados.

### Shell calmo e contido

O App Shell autenticado recebeu uma identidade Core V2 explícita. Dentro dele:

- orbes de fundo foram desativados;
- cards ficaram planos e com borda fina;
- elevação e brilho no hover foram removidos;
- o botão principal usa uma cor sólida;
- títulos e cabeçalhos ficaram menores;
- números usam alinhamento tabular;
- a ação móvel principal deixou de flutuar visualmente.

A tela de login não foi afetada por essa camada.

### Primitivos oficiais

Foram consolidados:

- `AtlasCard` com densidade e ênfase explícitas;
- `AtlasMetric` com relevância primária ou auxiliar;
- `AtlasDecisionStrip` limitado visualmente a cinco indicadores;
- `AtlasSection` para seções consistentes;
- `AtlasPriorityQueue` para o que precisa de ação;
- `AtlasDetailDisclosure` para detalhes progressivos;
- estados compactos de carregamento, vazio, erro e recuperação.

### Resiliência

O estado de erro compartilhado agora remove mensagens técnicas de schema, Postgres, Prisma e cache antes de exibi-las. Uma falha local deve orientar recuperação sem transformar a página inteira em erro.

## Impacto operacional

- o corretor identifica mais rápido a próxima ação;
- o gerente distingue prioridade de informação de apoio;
- o diretor enxerga menos cards, mas com maior poder de decisão;
- futuras páginas reutilizam uma linguagem única;
- informações extensas permanecem acessíveis sem poluir a visão principal;
- o redesign deixa de depender de ajustes repetidos tela a tela.

## Riscos identificados

- módulos antigos ainda podem conter estilos específicos; a camada final do Core V2 impede que eles reintroduzam brilho e elevação no shell oficial;
- componentes novos precisam usar os primitivos para manter a consistência;
- limitar a faixa de indicadores não autoriza ocultar métricas críticas: o contrato de cada página define quais cinco entram na visão rápida;
- validação visual completa permanece no gate de jornadas reais antes da fase 100.

## Checklist de validação

- [x] tokens semânticos oficiais;
- [x] shell Core V2 marcado e isolado;
- [x] azul reservado à ação;
- [x] cores de estado com significado;
- [x] orbes e elevação decorativa removidos do shell;
- [x] limite de cinco indicadores na visão rápida;
- [x] detalhes progressivos disponíveis;
- [x] estados resilientes compactos;
- [x] foco visível e movimento reduzido;
- [x] banco, autenticação e dados preservados;
- [x] build e ZIP mantidos para o gate da fase 100.

## Próxima etapa recomendada

Fase 93: classificar a superfície canônica, simplificar a navegação e completar os contratos dos módulos primários. Isso permitirá aplicar os novos primitivos apenas às jornadas de operação real.
