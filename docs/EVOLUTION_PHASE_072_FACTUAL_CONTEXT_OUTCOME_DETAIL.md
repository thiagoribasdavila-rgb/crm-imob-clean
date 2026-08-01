# ATLAS AI OS — Fase 72/3000

## Objetivo

Permitir que usuários autorizados abram cada projeto ou origem do resumo contextual e entendam quais resultados humanos compõem a contagem. A leitura continua local, agregada e descritiva, sem expor leads individuais, usar modelo generativo, atribuir causa, prever conversão ou alterar a operação.

## O que existia antes

- A Fase 71 agrupava resultados confirmados pelo projeto e pela origem atuais da lead.
- Cada segmento informava quantidade e participação no total observado.
- Avanços, ausência de resposta e acompanhamentos já eram calculados, mas a composição completa permanecia no contrato e não estava disponível na interface.

## Problema resolvido

Uma concentração contextual sem composição pode exigir que corretor ou gestão procurem outros relatórios para entender o que realmente aconteceu. A expansão factual mostra, dentro do próprio Copilot, os resultados observados que formam cada segmento.

## Alterações realizadas

### Composição factual local

- O motor reaproveita somente o último resultado humano válido de cada tarefa.
- As sete categorias governadas são contadas separadamente em cada projeto e origem.
- Categorias com zero ocorrência não entram na resposta do segmento.
- Cada participação é calculada dentro do próprio contexto, sem comparar desempenho ou estimar probabilidade.
- A resposta permanece limitada aos segmentos compactos definidos na Fase 71.

### Detalhamento com divulgação progressiva

- Cada projeto ou origem utiliza um controle nativo expansível e acessível por teclado.
- Fechado, o item mostra apenas contexto, quantidade e participação na amostra geral.
- Aberto, mostra o rótulo do resultado, a contagem e a participação dentro daquele contexto.
- Nenhum nome, telefone, e-mail, mensagem ou identificador de lead aparece no detalhe.
- O texto informa que a composição representa fatos confirmados, não recomendação ou atribuição.

## Impacto operacional

- Corretor e gestão entendem a composição sem sair do fluxo do Copilot.
- A interface permanece compacta e reduz excesso visual.
- A evidência pode orientar uma revisão humana sem acionar automações ou alterar score.
- O detalhamento não aumenta consumo de IA nem cria nova consulta ao banco.

## Segurança e governança

- A mesma rota autenticada, organização resolvida, RLS, rate limit e `Cache-Control: no-store` continuam obrigatórios.
- A agregação usa somente os eventos e leads já visíveis no escopo da sessão.
- Nenhum cliente administrativo ou `service_role` foi introduzido.
- Nenhum dado é enviado a provedor externo.
- Nenhuma lead, tarefa, etapa, score, responsável, mensagem ou projeto é modificado.
- Nenhuma tabela, coluna, view ou migration foi criada.

O [changelog oficial do Supabase](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) foi revisado em 18/07/2026. A alteração de exposição da Data API não afeta esta fase: somente tabelas existentes são lidas pela sessão atual e nenhuma estrutura nova é criada.

## Validação

- verificação dedicada da Fase 72;
- teste funcional da composição e percentuais por contexto;
- regressão das Fases 68 e 71;
- regressão da fila diária autenticada;
- segurança das APIs;
- TypeScript sem emissão e sem cache incremental;
- ESLint e revisão das práticas React;
- varredura de segredos;
- `git diff --check`;
- programa contínuo completo.

Build e ZIP permanecem reservados ao gate único de release.

## Risco identificado

Projeto e origem continuam sendo lidos do cadastro atual da lead. A composição detalhada é uma fotografia factual do contexto visível na consulta e não deve ser tratada como atribuição histórica de campanha, ranking, causalidade ou chance de conversão.

## Checklist de validação

- [x] somente resultados humanos válidos e mais recentes por tarefa entram;
- [x] todas as categorias válidas podem aparecer no detalhe;
- [x] categorias zeradas são omitidas;
- [x] percentuais usam apenas o total do respectivo segmento;
- [x] nenhuma lead individual é exposta no detalhe contextual;
- [x] expansão usa semântica nativa e acesso por teclado;
- [x] organização, RLS, rate limit e `no-store` permanecem ativos;
- [x] nenhuma chamada generativa, recomendação ou escrita downstream foi criada;
- [x] nenhuma mudança de schema ou dado real foi executada;
- [x] build e ZIP não foram gerados.

## Próxima etapa recomendada

Fase 73 — comparar os mesmos contextos entre janelas equivalentes usando diferenças absolutas e amostra explícita, sem transformar variação em causalidade ou previsão.
