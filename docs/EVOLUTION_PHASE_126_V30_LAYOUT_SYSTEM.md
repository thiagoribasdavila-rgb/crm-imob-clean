# Fase 126 — V30 Layout System foundation

## Objetivo
Criar uma fundação visual premium para o Atlas V30, reduzindo ruído e tornando a navegação mais decisiva sem reescrever todas as telas manualmente.

## O que mudou
- O shell agora carrega a geração visual `atlas-v30`, preservando a compatibilidade com a base `atlas-core-v2`.
- A barra lateral passou a mostrar o resultado comercial de cada módulo em uma linha curta.
- A navegação ganhou o princípio “uma decisão por tela”.
- O topo agora mostra a decisão/resultado que a página atual deve apoiar.
- Page headers, cards, estados, botões, inputs e tabelas receberam uma camada global mais limpa e premium.

## Impacto operacional
- Corretor entende mais rápido onde agir.
- Gerente enxerga o propósito de cada área com menos cliques.
- Diretor navega por resultado, não por tela técnica.
- Próximas fases podem redesenhar cada módulo com uma base visual consistente.

## Limites desta fase
- Não altera banco de dados.
- Não altera integração Meta, WhatsApp ou IA.
- Não gera ZIP nem build final.
- Não reescreve páginas específicas além do shell e componentes globais.

## Validação
- `npm run evolution:phase-126:check`
- `npm run typecheck`
- `npm run lint`
