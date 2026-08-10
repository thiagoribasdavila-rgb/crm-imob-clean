# ATLAS ONE — Fase 364 · Evidência de tempo e equilíbrio

## Objetivo

Fechar o ciclo 360–364 com uma leitura factual do tempo de atribuição e da
distribuição observada por empreendimento, sem modificar a roleta, o banco
remoto ou os responsáveis atuais.

## Entrega

- mediana, P90 e máximo entre criação da lead e evento de atribuição;
- cobertura explícita entre eventos observados e eventos compatíveis;
- concentração histórica das entregas entre corretores habilitados;
- desvio atual da carga ponderada pelo peso configurado na roleta;
- leitura por projeto no painel exclusivo da diretoria;
- estados separados para `medido`, `amostra baixa` e `sem evidência`;
- limite de 100 eventos recentes e ausência de PII na evidência.

## Política de verdade

Uma amostra só é classificada como medida a partir de cinco atribuições com
criação da lead compatível. Uma amostra menor continua visível, mas é marcada
como insuficiente. Ausência de evento não vira zero e concentração histórica
não é apresentada como prova de justiça ou avaliação individual.

## Arquivos alterados

- `lib/crm/distribution-evidence.ts`
- `app/api/v1/crm/distribution/route.ts`
- `app/(crm)/distribution/page.tsx`
- `tests/contracts/distribution-evidence.test.mjs`
- `package.json`
- `config/evolution-phase-364-distribution-evidence.json`

## Segurança e isolamento

O GET da distribuição permanece exclusivo para diretoria. Leads, fila,
projetos e eventos continuam filtrados pela organização obtida da sessão. O
novo cálculo recebe somente identificadores técnicos, datas, pesos e contagens;
nome, telefone e e-mail não fazem parte da evidência.

## Estado do ciclo 360–364

`implemented_local / authenticated_runtime_proof_pending`

O ciclo tem implementação e contratos locais completos. A promoção continua
retida até uma diretora ou um diretor autenticado confirmar a leitura com a
amostra real do tenant após a reconciliação controlada da migration da Fase
363. Nenhum build, ZIP ou deploy foi gerado nesta fase isolada.

## Rollback

Remover o painel da Fase 364 e a propriedade `distributionEvidence` do GET. A
regra transacional, a roleta, a fila, a capacidade e os registros existentes
não foram alterados.

## Próximo ciclo

A Fase 365 inicia a medição factual das linhas, conversas, mensagens e vínculos
do WhatsApp oficial, sem confundir login no Atlas com autenticação de uma linha
WhatsApp e sem declarar integração externa ativa sem prova.
