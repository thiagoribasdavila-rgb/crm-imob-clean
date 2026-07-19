# ATLAS AI OS — Fase 71/3000

## Objetivo

Acrescentar projeto e origem ao resumo dos resultados comerciais confirmados para que corretor e gestão entendam onde os fatos observados estão concentrados. A leitura permanece local, descritiva e sem custo generativo, atribuição causal, previsão ou ação automática.

## O que existia antes

- O Copilot consolidava resultados registrados por pessoas.
- A comparação temporal mostrava diferenças absolutas entre períodos equivalentes.
- A fila de qualidade indicava tarefas concluídas sem resultado.
- Projeto e origem existiam no cadastro da lead, mas não acompanhavam a leitura dos resultados.

## Problema resolvido

Uma contagem geral informa o que aconteceu, mas não ajuda a localizar o contexto operacional. A nova leitura relaciona os resultados confirmados ao projeto e à origem disponíveis no cadastro atual da lead, preservando também a quantidade sem classificação.

## Alterações realizadas

### Contexto atual da lead

- A rota autenticada reutiliza os campos `project` e `source` já lidos da base de leads.
- O enriquecimento acontece somente em memória, sem atualizar evento, lead ou projeto.
- O rótulo da interface informa que o contexto representa o cadastro atual, não necessariamente o valor histórico no momento do resultado.

### Agregação local e explicável

- Somente o resultado humano válido mais recente por tarefa entra na leitura.
- Projetos e origens são normalizados apenas para agrupamento de rótulos equivalentes.
- Cada segmento apresenta quantidade e participação sobre todos os resultados observados.
- Avanços, ausência de resposta e necessidade de acompanhamento permanecem disponíveis no contrato tipado.
- Contextos não informados são contados separadamente, sem inventar classificação.
- Cada dimensão retorna no máximo quatro segmentos e resume o restante para manter a interface compacta.

### Experiência no Copilot

- Um painel compacto apresenta projetos e origens em blocos separados.
- A quantidade classificada fica visível em relação à amostra observada.
- A interface explica que concentração é uma descrição, não prova de causa ou chance de conversão.
- Amostra vazia recebe orientação própria e não exibe métricas simuladas.

## Impacto operacional

- O corretor identifica rapidamente em quais contextos existem resultados registrados.
- A gestão consegue perceber lacunas de projeto ou origem sem abrir relatórios extensos.
- A memória fica mais útil para revisão comercial sem contaminar score ou automações.
- A análise não gera consumo de modelos externos.

## Segurança e governança

- Sessão, organização, RLS, rate limit e `Cache-Control: no-store` continuam obrigatórios.
- Nenhum cliente administrativo ou `service_role` foi introduzido.
- Nenhum dado é enviado a provedor de IA.
- Nenhuma lead, tarefa, etapa, score, responsável, mensagem ou projeto é modificado.
- Nenhuma tabela, coluna, view ou migration foi criada.

O [changelog oficial do Supabase](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) foi revisado em 18/07/2026. A mudança sobre exposição explícita de tabelas novas não afeta esta fase porque ela reutiliza `leads` e `lead_events` já existentes, respeitando o acesso da sessão e sem alterar o schema.

## Validação

- verificação dedicada da Fase 71;
- teste funcional da agregação por projeto e origem;
- regressão das Fases 64, 68, 69 e 70;
- segurança das APIs;
- TypeScript sem emissão e sem cache incremental;
- ESLint e revisão das práticas React;
- varredura de segredos;
- `git diff --check`;
- programa contínuo completo.

Build e ZIP permanecem reservados ao gate único de release.

## Risco identificado

Projeto e origem são lidos do cadastro atual da lead. Se o cadastro mudar depois do resultado, o agrupamento acompanha o valor atual. Por isso, o painel não deve ser usado como atribuição histórica de campanha nem como evidência causal de conversão.

## Checklist de validação

- [x] somente resultados humanos válidos entram no contexto;
- [x] apenas o resultado mais recente por tarefa é contado;
- [x] projeto e origem vêm do cadastro atual da lead;
- [x] contextos ausentes permanecem explicitamente não classificados;
- [x] a resposta é curta e limitada;
- [x] a interface não atribui causa nem prevê conversão;
- [x] organização, RLS, rate limit e `no-store` permanecem ativos;
- [x] nenhuma chamada generativa ou escrita downstream foi criada;
- [x] nenhuma mudança de schema ou dado real foi executada;
- [x] build e ZIP não foram gerados.

## Próxima etapa recomendada

Fase 72 — permitir o detalhamento factual dos segmentos contextuais sem expor dados fora da hierarquia e sem transformar concentração descritiva em recomendação automática.
