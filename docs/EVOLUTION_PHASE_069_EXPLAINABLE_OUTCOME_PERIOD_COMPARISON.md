# ATLAS AI OS — Fase 69/3000

## Objetivo

Comparar os resultados comerciais humanos confirmados dos 30 dias atuais com os 30 dias imediatamente anteriores. A leitura deve ajudar o time a perceber variações reais de execução sem usar IA generativa, atribuir causa, prever conversão ou alterar dados operacionais.

## O que existia antes

- O Copilot já consolidava resultados confirmados como contato, ausência de resposta, visita, proposta e novo acompanhamento.
- O resumo local mostrava o período atual, mas não oferecia uma referência temporal equivalente.
- A fila diária já preservava sessão, organização, RLS e funcionamento independente do histórico.

## Problema resolvido

Um número isolado não mostra se a operação registrou mais ou menos resultados que no período anterior. A comparação agora apresenta valores atuais, anteriores e diferenças absolutas, mantendo a linguagem descritiva e revelando quando a amostra ainda é insuficiente.

## Alterações realizadas

### Comparação determinística

- O motor usa duas janelas de 30 dias sem sobreposição.
- A fronteira entre períodos não pode contar o mesmo evento duas vezes.
- Resultados, avanços, ausência de resposta, acompanhamentos e cobertura possuem valor atual, anterior e diferença absoluta.
- A amostra é classificada como vazia, insuficiente ou descritiva.
- O texto usa `registrou a mais` ou `registrou a menos`; não usa linguagem causal ou preditiva.

### API segura

- A rota autenticada amplia a leitura para 60 dias na mesma tabela `lead_events`.
- Organização, cliente autenticado, RLS, limite de registros e `no-store` permanecem obrigatórios.
- A API continua exclusivamente de leitura e não usa cliente administrativo.
- Uma falha no histórico não bloqueia a fila operacional.

### Experiência do Copilot

- O painel exibe `30 dias atuais × 30 anteriores` logo após o resumo atual.
- Resultados, avanços, ausência de resposta e cobertura ficam em uma tabela compacta.
- A interface diferencia leitura descritiva de amostra inicial.
- O limite é explícito: sem atribuir causa, sem previsão e sem ação automática.

## Impacto operacional

- O corretor entende rapidamente se registrou mais ou menos avanços e ausências de resposta.
- O gerente ganha uma referência temporal sem abrir um relatório técnico.
- A operação começa a separar mudança observada de opinião ou promessa de IA.
- O custo generativo desta leitura permanece zero.

## Segurança e governança

- Somente resultados humanos confirmados entram na comparação.
- A visibilidade segue o tenant e as políticas RLS atuais.
- Nenhum conteúdo é enviado a provedor externo.
- Nenhuma tarefa, lead, etapa, score, mensagem ou memória é alterada.
- Nenhuma tabela, coluna ou dado real foi criado nesta fase.

O [changelog oficial do Supabase](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) foi revisado em 18/07/2026. A mudança sobre permissões explícitas para tabelas novas não afeta esta fase, que reutiliza `lead_events` e não modifica o schema.

## Validação

- verificação dedicada da Fase 69;
- regressão do resumo local da Fase 68;
- regressão da fila e da memória supervisionada;
- segurança das APIs;
- TypeScript sem emissão e sem cache incremental;
- ESLint e revisão React;
- varredura de segredos;
- `git diff --check`;
- programa contínuo completo.

Build e ZIP permanecem reservados ao gate único de release.

## Risco identificado

Uma diferença absoluta pode decorrer de variação no volume de trabalho, cobertura de registro ou composição da carteira. Ela não prova melhora, piora, causalidade ou probabilidade de venda.

## Checklist de validação

- [x] períodos possuem a mesma duração e não se sobrepõem;
- [x] somente fatos humanos confirmados são comparados;
- [x] atual, anterior e diferença absoluta ficam visíveis;
- [x] amostra insuficiente recebe indicação explícita;
- [x] organização, RLS e `no-store` permanecem ativos;
- [x] nenhuma chamada generativa é feita;
- [x] nenhuma causalidade ou previsão é alegada;
- [x] nenhuma escrita ou mudança de schema foi executada;
- [x] build e ZIP não foram gerados.

## Próxima etapa recomendada

Fase 70 — medir localmente a qualidade e as lacunas da memória comercial para orientar o time sobre quais resultados ainda precisam ser registrados, sempre com confirmação humana.
