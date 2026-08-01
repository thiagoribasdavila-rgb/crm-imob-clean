# ATLAS AI OS — Fase 83/3000

## Objetivo

Fazer evidências, agrupamentos, comparações e recência comercial resolverem projeto e origem pela mesma regra governada: contexto histórico comprovado primeiro e fallback atual somente para eventos legados.

## Problema resolvido

A fase 82 preservou projeto e origem nos novos resultados humanos e já aplicava essa fotografia à recência contextual. Porém, outras leituras ainda consultavam diretamente o cadastro atual da lead. Assim, a mesma confirmação poderia aparecer com um contexto na recência e outro nas evidências ou comparações.

## Alterações realizadas

- Criado um resolvedor central e tipado para o contexto de cada resultado comercial.
- Eventos com snapshot válido usam exclusivamente projeto, origem e horário preservados no momento da confirmação humana.
- Eventos anteriores à fase 82 continuam usando o cadastro atual como fallback legado explicitamente identificado.
- Um valor nulo dentro de snapshot histórico permanece nulo; o Atlas não completa a lacuna com o cadastro atual nem fabrica associação retroativa.
- Evidências auditáveis passaram a expor a base do contexto e seu horário quando disponível.
- Recência por contexto deixou de fabricar horário de captura quando ele não existe.
- Agrupamentos por projeto e origem usam o resolvedor único.
- Comparações entre períodos usam o mesmo contrato.
- Políticas antigas que afirmavam uso exclusivo do cadastro atual foram substituídas pelo contrato histórico preferencial com fallback legado.
- O Copilot identifica cada fato como `Contexto preservado` ou `Fallback legado` e mantém os limites semânticos visíveis.

## Impacto operacional

Diretor, gerente e corretor passam a ver a mesma identidade contextual em todas as leituras de memória comercial. Uma mudança posterior no projeto ou na origem da lead não altera o significado dos novos fatos já preservados. A compatibilidade com registros antigos é mantida sem migração destrutiva ou paralisação da operação.

## Segurança e governança

- A resolução ocorre somente sobre eventos já visíveis no tenant autenticado.
- Sessão, organização, hierarquia e RLS continuam sendo aplicados antes dos resumos.
- Não foi introduzido cliente administrativo, nova rota pública ou cache compartilhado.
- O snapshot continua sem nome, telefone, e-mail, mensagem ou outro contato pessoal.
- Nenhum evento antigo foi regravado, inferido ou enriquecido automaticamente.
- Não houve migration, alteração de tabela, chamada a modelo, score, ranking ou ação downstream.
- O [changelog oficial do Supabase](https://supabase.com/changelog) foi revisado. A mudança recente de gateway padrão é específica de instalações self-hosted e não altera o fluxo autenticado da plataforma usado aqui; o aviso futuro do `supabase-js` sobre TypeScript 5 também já é atendido pelo projeto.

## Compatibilidade

- Novo resultado com snapshot válido: `historical_outcome_snapshot`.
- Resultado legado: `current_lead_snapshot`.
- Janela contendo os dois: cobertura mista explícita.
- Snapshot histórico com projeto ou origem nulos: permanece sem classificação nessa dimensão.
- Não existe backfill automático nem inferência histórica.
- As respostas da API continuam compatíveis, apenas com proveniência mais fiel nos campos já tipados.

## Risco identificado

Resultados anteriores à fase 82 ainda refletem projeto e origem atuais na hora da leitura. Esses rótulos podem mudar. Além disso, o snapshot preserva texto, não identificadores imutáveis de projeto ou campanha. A interface sinaliza essa limitação e a fase não tenta corrigi-la retroativamente.

## Checklist de validação

- [x] Um único resolvedor governa projeto, origem, base e horário contextual.
- [x] Evidências usam contexto histórico quando comprovado.
- [x] Agrupamentos por projeto e origem usam o mesmo contrato.
- [x] Comparações de períodos usam o mesmo contrato.
- [x] Recência contextual usa o mesmo contrato.
- [x] Valor histórico nulo não recebe fallback atual.
- [x] Eventos legados permanecem legíveis e explicitamente identificados.
- [x] Nenhum horário de captura inexistente é fabricado.
- [x] Autenticação, tenant, hierarquia, RLS e `no-store` permanecem obrigatórios.
- [x] Nenhuma migration, backfill, chamada de modelo ou automação foi adicionada.
- [x] Build e ZIP permanecem reservados ao gate único de release.

## Próxima etapa recomendada

Fase 84 — medir a cobertura de contexto preservado por dimensão e período, separando projeto, origem, histórico e fallback legado sem transformar ausência de dado em score de qualidade ou previsão.
