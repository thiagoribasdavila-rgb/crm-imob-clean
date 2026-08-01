# ATLAS AI OS — Fase 88/3000

## Objetivo

Transformar o evento de correção de projeto e origem já gravado na Fase 87 em uma leitura explicável na timeline da Lead 360: antes, agora, motivo, responsável, horário e efeito futuro, sem alterar fatos ou snapshots históricos.

## Problema resolvido

A correção já era segura e auditável, porém aparecia como uma atividade genérica. O gestor precisava interpretar a descrição e não via, no mesmo bloco, o valor anterior, o atual e a política que separa estado corrente de memória histórica.

## Alterações realizadas

- Criado um parser puro e tipado para o metadata do evento `commercial_context_corrected`.
- O parser só aceita eventos com confirmação humana, aplicação apenas ao estado atual, ausência de preenchimento automático e preservação histórica explícita.
- Metadados incompletos, automáticos, sem alteração real ou que aleguem reescrita histórica não recebem aparência de correção validada.
- A timeline identifica se projeto, origem ou ambos mudaram.
- O contexto anterior e o contexto atual aparecem lado a lado.
- O motivo humano aparece em um bloco próprio, sem repetir a descrição genérica do evento.
- Responsável e horário continuam no rodapé original da atividade.
- A interface informa que decisões, recomendações e resultados futuros usam o contexto atual.
- A interface informa que eventos e snapshots anteriores continuam como foram registrados.
- Eventos legados ou malformados preservam a visualização genérica, sem inferência.
- A leitura reutiliza os eventos já carregados pela Lead 360 e não cria nova chamada de rede.

## Impacto operacional

Diretor, gerente e corretor passam a entender em segundos o que foi corrigido e por quê. A separação visual entre estado atual e memória histórica reduz disputas sobre números anteriores e evita interpretar uma correção cadastral como alteração retroativa de resultado.

## Segurança e governança

- A fase é somente de leitura e não adiciona mutation.
- Nenhum contato, mensagem, documento ou dado sensível novo é exposto.
- A timeline mostra somente metadata já devolvido pela API após autenticação, organização e escopo da lead.
- O parser exige as quatro garantias gravadas pela correção governada.
- Metadata desconhecido não é promovido a correção confirmada.
- Não há IA, inferência, score, ranking, automação ou execução autônoma.

## Compatibilidade

- Reutiliza `lead_events.metadata` e o adapter `mapLiveLeadEvent` existentes.
- Não adiciona migration, tabela, coluna, dependência ou variável de ambiente.
- Não muda o contrato de escrita criado na Fase 87.
- Não adiciona fetch e não aumenta a quantidade de consultas ao Supabase.
- O fallback genérico mantém eventos anteriores legíveis.
- Hostinger e base viva V2 permanecem sem alteração estrutural.

## Risco identificado

Eventos antigos ou inseridos manualmente podem não possuir todas as garantias do contrato atual. Apresentar um antes/depois nesses casos criaria uma certeza falsa. Por isso, a leitura especializada é conservadora e usa o renderer genérico quando a evidência está incompleta.

## Checklist de validação

- [x] Projeto e origem anteriores aparecem na timeline.
- [x] Projeto e origem atuais aparecem na timeline.
- [x] A dimensão alterada é identificada sem inferência.
- [x] O motivo humano aparece uma única vez.
- [x] Responsável e horário permanecem visíveis.
- [x] O efeito sobre decisões e resultados futuros está explícito.
- [x] A imutabilidade dos fatos anteriores está explícita.
- [x] Metadata incompleto usa fallback genérico.
- [x] Nenhuma nova requisição, mutation ou alteração de banco foi criada.
- [x] Build e ZIP permanecem reservados ao gate de release.

## Próxima etapa recomendada

Fase 89 — criar um monitoramento operacional compacto das correções contextuais para a gestão, com volume e recência observados, sem ranking de pessoas e sem transformar correção em punição.
