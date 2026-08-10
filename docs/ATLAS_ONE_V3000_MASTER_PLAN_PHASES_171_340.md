# ATLAS ONE V3000 — Plano mestre das fases 171–340

## Propósito

Estas são **170 fases novas**, numeradas de 171 a 340, que continuam o programa atual sem apagar, renumerar ou declarar como concluído o que ainda depende de prova real. O plano foi cruzado com os backlogs já existentes de consolidação V30, UX operacional e Meta/Andromeda para evitar repetição.

O objetivo do V3000 não é aumentar o número de telas. É criar um ciclo fechado e mensurável:

**campanha → lead íntegra → atendimento rápido → avanço comprovado → venda → sinal de qualidade para Meta → aprendizado supervisionado → decisão do diretor.**

## O que torna este plano diferente

- cada fase precisa mudar um comportamento operacional observável;
- nenhuma fase é aprovada apenas por existir código, rota, card ou texto;
- IA começa em **observar**, avança para **recomendar** e só executa com autorização e calibração comprovadas;
- dados e módulos existentes são consolidados antes de qualquer expansão;
- toda alteração de operação real nasce atrás de flag, shadow mode ou gate humano;
- um único build completo é permitido no fechamento de cada onda de dez fases;
- cada onda gera um candidato instalável com rollback, nunca um ZIP “por aparência”;
- o Digital Twin simula decisões, mas nunca altera campanha, lead ou orçamento real;
- suspeitas comerciais são sinais explicáveis para revisão, nunca acusações automáticas.

## Critério de prioridade

Cada fase recebe prioridade pela seguinte ordem:

1. impacto em conversão e receita;
2. redução de perda de lead e tempo de resposta;
3. qualidade do sinal entregue à Meta;
4. tempo economizado pelo corretor e gerente;
5. segurança, confiabilidade e custo;
6. refinamento visual que melhora decisão.

## Contrato comum de conclusão

Uma fase só conta como concluída quando possui:

- mudança funcional ou decisão documental verificável;
- dado real ou fixture isolada, sem mock apresentado como produção;
- persistência e isolamento por `organization_id` quando aplicável;
- estado de loading, vazio e erro quando houver interface;
- teste direcionado da mudança;
- evidência antes/depois ou recibo técnico;
- rollback ou desligamento seguro;
- nenhuma regressão no fluxo canônico de lead até venda.

## Cadência instalável

O programa tem **17 ondas de 10 fases**. Dentro de cada onda não se gera ZIP. No décimo passo executa-se regressão, build limpo e, se aprovado, pacote Hostinger com manifesto e checksum.

Padrão do artefato: `ATLAS_ONE_V3000_WXX_PNNN_HOSTINGER.zip`.

---

## Onda 01 — Verdade comercial e linha de base (171–180)

Resultado: todos os painéis, relatórios, IAs e integrações passam a usar a mesma definição de conversão.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 171 | Definir o evento canônico de venda e os eventos intermediários que realmente indicam avanço. | Dicionário versionado aprovado pela diretoria e usado pelos contratos ativos. |
| 172 | Consolidar um catálogo único de eventos de CRM, WhatsApp, Meta, tarefas e pipeline. | Zero eventos ativos sem nome, origem, tenant, responsável e timestamp definidos. |
| 173 | Medir a completude de atribuição por lead, sem preencher lacunas com suposição. | Painel técnico mostra campanha, conjunto, anúncio, formulário e projeto presentes ou ausentes. |
| 174 | Definir evidência mínima de entrada e saída para cada etapa do funil. | Movimentos inválidos são explicados e movimentos válidos deixam recibo. |
| 175 | Criar a linha de base de tempo de resposta por origem, projeto e corretor. | Mediana e percentis calculados sobre dados reais do período escolhido. |
| 176 | Consolidar motivos de perda, descarte, compra externa e telefone inválido. | Taxonomia única, auditável e sem categorias duplicadas. |
| 177 | Medir confiança da identidade única da lead e origem de possíveis duplicidades. | Relatório separa duplicata confirmada, provável e contato distinto. |
| 178 | Expor frescor dos dados usados em cada indicador executivo. | Todo KPI crítico informa última atualização e fonte. |
| 179 | Congelar o contrato da sala de comando do diretor: decisão, motivo e ação. | Cada bloco executivo responde “o que mudou, por quê e o que decidir”. |
| 180 | Fechar a onda com baseline, testes e pacote apenas se todas as fontes reconciliam. | Gate verde, relatório antes/depois, build único e rollback documentado. |

## Onda 02 — Entrada de leads sem perda (181–190)

Resultado: toda lead recebida é identificada, atribuída, deduplicada e recuperável.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 181 | Consolidar o mapa formulário Meta × projeto × incorporadora × campanha. | Todos os formulários ativos resolvem um destino ou entram em quarentena. |
| 182 | Tornar a ingestão idempotente por evento e origem. | Reenvio da mesma lead controlada não cria duplicidade. |
| 183 | Unificar normalização de telefone, e-mail, DDD e país antes da persistência. | Amostra de entradas equivalentes converge para a mesma identidade. |
| 184 | Criar prévia de fusão de duplicatas preservando histórico e proprietário. | Nenhuma fusão ocorre silenciosamente; recibo mostra campos mantidos. |
| 185 | Preservar campanha, conjunto, anúncio, criativo e formulário desde a entrada. | Atribuição original permanece imutável e visível no Lead 360. |
| 186 | Resolver projeto e incorporadora com nível de confiança e justificativa. | Associação incerta vai para revisão, sem inventar projeto. |
| 187 | Criar fila clara de leads não resolvidas com motivo e ação de correção. | Diretoria vê volume, idade e causa da quarentena. |
| 188 | Permitir replay seguro de ingestões falhas sem duplicar distribuição. | Reprocessamento controlado gera um único registro final. |
| 189 | Reconciliar diariamente leads declaradas pela origem contra as persistidas no CRM. | Diferença é quantificada por origem e gera alerta acionável. |
| 190 | Provar entrada completa com lote controlado e fechar a onda. | Zero perda e zero duplicação no lote; build e ZIP somente após regressão. |

## Onda 03 — Distribuição inteligente e governada (191–200)

Resultado: a lead certa chega rapidamente ao corretor elegível, com controle da diretoria.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 191 | Consolidar matriz incorporadora × projeto × corretor elegível. | Diretoria consegue revisar e alterar elegibilidade sem editar código. |
| 192 | Garantir que configuração e fila de distribuição sejam exclusivas da diretoria. | Testes RBAC negam escrita a gerente e corretor. |
| 193 | Medir disponibilidade real do corretor com estado, validade e última atividade. | Corretor offline ou com presença vencida não recebe lead nova. |
| 194 | Aplicar capacidade, carga atual e especialidade ao round-robin existente. | Simulação explica por que cada corretor foi escolhido. |
| 195 | Reforçar a regra uma lead, um corretor e um Copilot responsável. | Não há dois proprietários ativos para a mesma lead. |
| 196 | Melhorar transferência individual e em massa com prévia, motivo e recibo. | Origem, destino, autor e histórico ficam preservados. |
| 197 | Criar escalonamento por SLA sem retirar a lead silenciosamente. | Corretor e diretor recebem alerta antes de qualquer redistribuição. |
| 198 | Definir corretor reserva por projeto e janela de ausência. | Falha do titular segue regra aprovada e auditável. |
| 199 | Medir equilíbrio da fila junto com resultado, não apenas quantidade. | Relatório compara carga, velocidade e avanço por corretor/projeto. |
| 200 | Provar distribuição real controlada para o conjunto de corretores aprovado. | Uma lead de teste chega a um único elegível; regressão e pacote aprovados. |

## Onda 04 — Área de trabalho decisiva do corretor (201–210)

Resultado: o corretor identifica e executa a próxima melhor ação em poucos segundos.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 201 | Redesenhar o card essencial da lead com projeto e incorporadora inequívocos. | Identificação aparece no Kanban sem abrir detalhes e sem aumentar ruído. |
| 202 | Colocar uma única próxima melhor ação no topo do atendimento. | A ação tem motivo, prazo, confiança e opção de discordar. |
| 203 | Reduzir registro de ligação, WhatsApp, visita e retorno a uma interação curta. | Tempo de registro medido cai versus baseline. |
| 204 | Tornar movimento do Kanban otimista, persistente e reversível quando falhar. | Falha de API restaura o card e informa causa sem perder dados. |
| 205 | Aplicar checklist progressivo apenas quando a etapa exigir evidência. | Corretor não preenche campos irrelevantes antes da hora. |
| 206 | Criar tratamento operacional de cards parados por prazo e ausência de próxima ação. | Fila diária mostra somente itens que exigem decisão. |
| 207 | Levar book, tabela vigente, planta e espelho ao contexto da lead. | Material correto é encontrado e compartilhado sem sair do atendimento. |
| 208 | Encadear simulação, proposta e retorno no mesmo fluxo. | Proposta criada gera próxima ação e histórico automaticamente. |
| 209 | Consolidar a fila “Meu dia” com prioridade, compromisso e risco. | Corretor conclui a rotina sem alternar entre módulos redundantes. |
| 210 | Homologar a jornada em desktop e celular e fechar a onda. | Teste de tempo de tarefa, erros e regressão aprova o pacote. |

## Onda 05 — WhatsApp e memória conversacional (211–220)

Resultado: conversas oficiais entram no CRM com identidade, consentimento e contexto útil.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 211 | Consolidar cadastro de linha do corretor com aprovação e visibilidade da diretoria. | Linha possui dono, status, provedor, escopo e trilha de aprovação. |
| 212 | Resolver número oficial e corretor responsável sem depender do login visual do WhatsApp Web. | Cada número da Cloud API mapeia para um único contexto operacional. |
| 213 | Tornar webhook de mensagens idempotente e observável. | Reentrega do webhook não duplica mensagem nem atividade. |
| 214 | Vincular conversa à lead por identidade confiável, com fila para ambiguidade. | Associação automática tem justificativa; dúvida exige revisão. |
| 215 | Exibir mensagens recebidas, enviadas e status na timeline do cliente. | Timeline ordenada reproduz a conversa oficial sem omissões do teste. |
| 216 | Aplicar consentimento, janela de atendimento e opt-out em cada envio. | Envio bloqueado informa regra e não tenta contornar a política. |
| 217 | Organizar templates aprovados por projeto, objetivo e etapa. | Corretor encontra apenas templates válidos para aquele contexto. |
| 218 | Registrar resultado de ligação e tentativa quando a conversa ocorrer fora do canal oficial. | Histórico diferencia prova automática de registro manual. |
| 219 | Gerar resumo conversacional citável e memória comercial estruturada. | Resumo aponta mensagens-fonte e nunca substitui o histórico bruto. |
| 220 | Provar captura, envio, consentimento e handoff humano e fechar a onda. | Cenário controlado completo, regressão verde e pacote instalável. |

## Onda 06 — Copilot proativo e supervisionado (221–230)

Resultado: a IA ajuda a vender com contexto, baixo custo e aprendizado verificável.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 221 | Consolidar o pacote de contexto por lead, projeto, histórico e papel. | Resposta do Copilot lista as fontes realmente usadas. |
| 222 | Minimizar PII e bloquear contexto fora do tenant antes de chamar modelos. | Testes de isolamento e redaction passam para todos os papéis. |
| 223 | Aplicar roteamento de modelos por tarefa, custo, latência e sensibilidade. | Health Center mostra escolha, fallback, custo e resultado. |
| 224 | Tornar a próxima melhor ação explicável e contestável. | Usuário vê sinais, limitações e registra aceite ou discordância. |
| 225 | Gerar abordagem com base em materiais vigentes do projeto. | Texto cita tabela/book atuais e recusa informação ausente. |
| 226 | Criar assistência de objeções usando histórico e política comercial. | Sugestão diferencia fato do projeto, inferência e pergunta ao cliente. |
| 227 | Entregar ao gerente coaching priorizado por gargalo real. | Recomendação aponta evidência e impacto esperado, não volume genérico. |
| 228 | Entregar ao diretor resumo executivo de mudanças e decisões. | Brief diário destaca exceções, causa provável e ação aprovável. |
| 229 | Fechar loop sugestão × decisão humana × resultado comercial. | Ledger permite medir aceite e desfecho sem reescrever o passado. |
| 230 | Calibrar utilidade, custo, segurança e fechar a onda. | Somente casos aprovados avançam de observar para recomendar. |

## Onda 07 — Meta CAPI e sinal para Andromeda (231–240)

Resultado: a Meta recebe sinais CRM confiáveis sobre qualidade e venda, não apenas volume de formulário.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 231 | Congelar contrato canônico dos eventos Meta derivados do CRM. | Evento, momento, origem, consentimento e valor têm definição única. |
| 232 | Unificar `event_id` e deduplicação entre navegador, webhook e servidor. | Teste controlado produz um evento lógico na reconciliação. |
| 233 | Normalizar e proteger dados de matching antes do envio. | Diagnóstico mede cobertura sem exibir PII em log. |
| 234 | Aplicar governança de consentimento e uso de dados por evento. | Evento sem base válida é retido com motivo auditável. |
| 235 | Mapear qualificação, visita, proposta, ganho e perda para feedback de campanha. | Cada evento nasce de evidência persistida no CRM. |
| 236 | Expor qualidade de sinal, deduplicação, atraso e rejeição por origem. | Diretor vê saúde do sinal antes de avaliar performance. |
| 237 | Preparar conversão offline de venda com valor e moeda reconciliados. | Evento de venda só é elegível após validação comercial. |
| 238 | Consolidar retry, dead letter e reprocessamento governado da CAPI. | Falha não some e não é reenviada infinitamente. |
| 239 | Relacionar resultado CRM a campanha, conjunto, anúncio e criativo. | Relatório separa volume, qualidade e receita atribuída. |
| 240 | Executar teste oficial controlado e fechar a onda mediante aprovação. | Recibo Meta, event ID, latência, match e decisão humana registrados. |

## Onda 08 — Laboratório de receita de campanhas (241–250)

Resultado: marketing e diretoria decidem orçamento pelo avanço comercial e receita.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 241 | Consolidar campanha interna e identidade externa em um registro canônico. | Não há duplicidade de campanha entre relatórios e operação. |
| 242 | Registrar incorporadora financiadora, projeto e regras da verba. | Todo gasto exibido possui responsável comercial e período. |
| 243 | Reconciliar investimento importado com o período e moeda corretos. | Diferença entre fonte e CRM fica explícita. |
| 244 | Calcular CPL, custo por qualificada, visita, proposta e venda. | Fórmulas usam denominadores visíveis e dados reais. |
| 245 | Criar análise de coorte do formulário até o estágio final. | Conversão respeita janela temporal e não mistura safras. |
| 246 | Comparar criativos por qualidade da lead e desfecho. | Ranking não favorece apenas menor CPL. |
| 247 | Medir qualidade por origem, projeto, corretor e tempo de resposta. | Diretor identifica se o gargalo é mídia ou operação. |
| 248 | Gerar recomendação de campanha com confiança e impacto estimado. | Recomendação mostra evidências, risco e necessidade de aprovação. |
| 249 | Registrar decisão do diretor e hipótese do experimento. | Aumento, redução ou pausa deixa justificativa e janela de avaliação. |
| 250 | Gerar relatório semanal por incorporadora e fechar a onda. | Exportação reconcilia gasto, leads, corretores, funil e vendas. |

## Onda 09 — Projetos, estoque e materiais na venda (251–260)

Resultado: o corretor encontra o imóvel e o material certos sem risco de versão vencida.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 251 | Consolidar cadastro único de incorporadora e relacionamentos ativos. | Busca e seleção não apresentam cadastros duplicados. |
| 252 | Unificar identidade de projeto, aliases e materiais vinculados. | Lead, campanha e relatório resolvem o mesmo projeto canônico. |
| 253 | Marcar tabela vigente, validade e histórico de substituições. | Compartilhamento padrão sempre usa a versão aprovada mais recente. |
| 254 | Expor frescor do estoque, origem e responsável pela atualização. | Unidade desatualizada recebe alerta antes da recomendação. |
| 255 | Melhorar matching cliente × unidade com explicação dos critérios. | Corretor vê compatibilidades e lacunas sem promessa automática. |
| 256 | Criar seleção rápida de pacote comercial por atendimento. | Book, tabela, planta e fluxo saem juntos com versão registrada. |
| 257 | Alertar mudança relevante de preço, estoque ou condição para leads afetadas. | Lista de impacto é revisável antes de qualquer contato. |
| 258 | Adaptar qualificação às perguntas específicas de cada projeto. | Perguntas extras só aparecem quando mudam o matching. |
| 259 | Consolidar relatório do projeto para a incorporadora. | Funil, mídia, equipe, estoque e receita usam a mesma janela. |
| 260 | Provar atualização e compartilhamento reais e fechar a onda. | Upload, versão, leitura, vínculo e rollback passam na regressão. |

## Onda 10 — Gestão de equipe orientada a resultado (261–270)

Resultado: gerente corrige gargalos e capacidade sem microgerenciar atividade vazia.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 261 | Reconciliar hierarquia diretor × gerente × corretor. | Visibilidade e escrita passam na matriz RBAC real. |
| 262 | Medir carga por estágio, projeto, atraso e complexidade. | Capacidade não é reduzida a contagem bruta de leads. |
| 263 | Criar fila de violações de SLA com dono e recuperação. | Cada item tem prazo, responsável e resultado. |
| 264 | Comparar avanço de funil por corretor e projeto com amostra explícita. | Ranking informa volume e evita conclusão com base insuficiente. |
| 265 | Distinguir quantidade de atividade de qualidade do atendimento. | Relatório relaciona ações a avanço ou perda observada. |
| 266 | Criar fila de coaching baseada nos maiores gargalos. | Gerente recebe poucos casos prioritários e roteiro objetivo. |
| 267 | Medir efeito de transferências sobre SLA e conversão. | Decisão de transferir pode ser auditada depois. |
| 268 | Expor cobertura online por projeto e horário. | Falta de cobertura é detectada antes de novas entradas. |
| 269 | Relacionar metas, capacidade e carteira real. | Meta incompatível aparece como risco, não como falha individual automática. |
| 270 | Homologar o cockpit do gerente e fechar a onda. | Gerente executa rotina completa sem acesso indevido. |

## Onda 11 — Sala de comando do diretor (271–280)

Resultado: o diretor recebe uma leitura curta, explicável e acionável da operação.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 271 | Criar brief executivo diário com mudança, causa provável e decisão. | Brief usa somente dados reconciliados e fontes citadas. |
| 272 | Priorizar indicadores antecedentes de venda, não apenas resultados atrasados. | Tempo de resposta, avanço, próxima ação e cobertura aparecem antes de VGV. |
| 273 | Classificar campanhas por receita, qualidade e eficiência. | Ranking explica pesos e separa dado ausente de zero. |
| 274 | Mostrar consumo de verba por incorporadora, projeto e ritmo esperado. | Desvio de pacing gera ação e não apenas gráfico. |
| 275 | Criar sinais explicáveis de possível negociação fora da plataforma. | Sinal informa evidências, limitações e nunca acusa automaticamente. |
| 276 | Criar revisão humana e desfecho para sinais de suspeita. | Diretor classifica, justifica e encerra o caso com trilha restrita. |
| 277 | Medir vazamentos de receita por etapa, SLA e ausência de follow-up. | Estimativa mostra método e faixa, sem falsa precisão. |
| 278 | Detectar anomalias em origem, projeto, corretor e campanha. | Alerta compara baseline e exige amostra mínima. |
| 279 | Unificar relatórios diário, semanal e mensal com drill-down. | Totais permanecem iguais entre resumo e detalhe. |
| 280 | Homologar decisões reais do diretor e fechar a onda. | Usuário resolve cenários de orçamento, equipe e risco com evidência. |

## Onda 12 — Reativação responsável da base (281–290)

Resultado: base antiga vira oportunidade mensurável sem poluir a carteira ativa.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 281 | Segmentar a base por origem, última interação, interesse e qualidade. | Segmentos são reproduzíveis e não misturam lead ativa. |
| 282 | Calcular elegibilidade de contato por consentimento e canal. | Somente elegíveis entram em campanha. |
| 283 | Reforçar supressão de telefone inválido, opt-out e histórico de limpeza. | Contato suprimido não reentra em nova importação. |
| 284 | Preservar proprietário atual e histórico ao detectar duplicata. | Reativação não rouba lead nem apaga atendimento. |
| 285 | Criar coortes pequenas de reativação com grupo de comparação. | Resultado mede incremento, não apenas respostas brutas. |
| 286 | Separar base própria do corretor da base institucional. | Permissões e atribuição deixam origem explícita. |
| 287 | Gerar variações de mensagem supervisionadas por perfil e projeto. | Toda mensagem exige aprovação e registra variante. |
| 288 | Roteirizar resposta, pedido de troca de corretor e handoff. | Cliente pode manter ou trocar atendimento com trilha clara. |
| 289 | Medir resposta, qualificação, visita, venda, custo e opt-out. | Relatório mostra ganho e risco por coorte. |
| 290 | Homologar uma coorte controlada e fechar a onda. | Consentimento, entrega, resposta, roteamento e rollback comprovados. |

## Onda 13 — Forecast, venda e comissão confiáveis (291–300)

Resultado: previsão e comissão passam a refletir evidência comercial real.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 291 | Definir origem e validade do valor de cada oportunidade. | Valor manual, tabela e proposta são distinguíveis. |
| 292 | Calibrar probabilidade por etapa e histórico observado. | Forecast compara previsão anterior com resultado posterior. |
| 293 | Consolidar categorias de forecast com critérios verificáveis. | Negócio não muda de categoria sem evidência. |
| 294 | Aplicar SLA de comissão por incorporadora e regra de recebimento. | Venda ganha gera previsão de comissão e vencimento rastreável. |
| 295 | Exigir evidência mínima para venda ganha. | Contrato, unidade, valor, projeto e responsável são reconciliados. |
| 296 | Preservar aprendizado de compra externa sem somar receita própria. | Relatórios separam conversão externa de venda Atlas. |
| 297 | Criar análise forecast × realizado por corte temporal. | Erro e viés são visíveis por projeto e equipe. |
| 298 | Expor aging de comissão a receber e risco de atraso. | Diretoria vê valor, vencimento, incorporadora e evidência. |
| 299 | Consolidar pack executivo de receita e recebíveis. | Totais conciliam vendas, comissões e forecast. |
| 300 | Homologar cenário financeiro completo e fechar a onda. | Venda, forecast e comissão passam em teste ponta a ponta. |

## Onda 14 — Confiabilidade, segurança e operação Hostinger (301–310)

Resultado: o sistema instala e roda de forma determinística, observável e recuperável.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 301 | Verificar contratos de schema usados pelo código antes do build. | Query para tabela ou coluna ausente falha no preflight, não na produção. |
| 302 | Reconciliar migrations locais e remotas de forma idempotente. | Ledger mostra aplicada, pendente, divergente e rollback. |
| 303 | Revalidar RLS por organização, papel e operação crítica. | Matriz dinâmica prova negação e permissão esperadas. |
| 304 | Validar paridade de variáveis entre local e Hostinger sem expor valores. | Relatório mostra apenas presença, formato e escopo. |
| 305 | Tornar instalação de dependências determinística, incluindo toolchain CSS. | `npm ci` em pasta limpa encontra todas as dependências de build. |
| 306 | Aplicar idempotência, rate limit e validação às APIs críticas. | Testes de repetição e abuso não alteram dados indevidamente. |
| 307 | Unificar correlação de logs entre entrada, distribuição, ação e integração. | Um ID permite seguir fluxo sem registrar PII. |
| 308 | Ensaiar backup e restauração em ambiente isolado. | Schema, dados aplicáveis, policies, funções e storage são verificados. |
| 309 | Medir carga realista e gargalos de banco, API e renderização. | SLO e limites são documentados com plano de correção. |
| 310 | Executar preflight Hostinger, build limpo e fechar a onda. | Instalação reproduzível sem erro 118/56 e pacote com checksum. |

## Onda 15 — Experiência premium, rápida e inclusiva (311–320)

Resultado: menos ruído visual, mais decisão e fluidez no desktop e celular.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 311 | Consolidar hierarquia visual em ação, contexto e detalhe. | Teste de tarefa mostra menor procura e menos rolagem. |
| 312 | Aplicar revelação progressiva aos dados secundários. | Informação permanece acessível sem competir com a decisão principal. |
| 313 | Unificar busca e command palette para pessoas, projetos e ações. | Usuário chega a destinos críticos por teclado ou toque. |
| 314 | Ajustar densidade de tabelas, cards e Kanban por tamanho de tela. | Conteúdo essencial permanece legível sem overflow quebrado. |
| 315 | Otimizar ações móveis para uso com uma mão. | Corretor registra contato e próxima ação no celular. |
| 316 | Corrigir contraste, foco, rótulos, teclado e leitor de tela. | Auditoria de acessibilidade passa nos fluxos canônicos. |
| 317 | Padronizar skeleton, vazio útil, erro recuperável e sucesso discreto. | Nenhum módulo crítico mostra stack ou tela muda. |
| 318 | Adicionar atalhos seguros para rotina de alto volume. | Atalho nunca contorna confirmação ou permissão. |
| 319 | Definir orçamento de performance percebida por jornada. | Métricas de carregamento e interação respeitam o baseline aprovado. |
| 320 | Executar regressão visual e comportamental e fechar a onda. | Comparação aprovada, sem perda de função e pacote instalável. |

## Onda 16 — Digital Twin comercial em shadow mode (321–330)

Resultado: diretoria testa cenários antes de alterar pessoas, verba ou operação real.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 321 | Definir dados permitidos, limitações e contrato do Digital Twin. | Simulação é claramente separada de previsão e execução real. |
| 322 | Criar baseline histórico reproduzível para comparação. | Cenário pode ser recalculado com os mesmos dados e versão. |
| 323 | Simular regras de distribuição e seus efeitos em carga e SLA. | Resultado mostra hipóteses e não grava atribuições. |
| 324 | Simular alterações de SLA e cobertura de horário. | Diretoria compara impacto e risco antes de aprovar. |
| 325 | Simular realocação de verba entre campanhas e projetos. | Saída usa faixas e sensibilidade, sem prometer receita. |
| 326 | Simular capacidade de corretores por projeto e demanda. | Gargalos aparecem com premissas ajustáveis. |
| 327 | Simular efeito de preço, estoque e validade de material no matching. | Cenário não modifica tabela nem unidade real. |
| 328 | Simular tamanho e cadência de coortes de reativação. | Risco de opt-out, custo e capacidade são comparáveis. |
| 329 | Comparar cenário, decisão humana e resultado posterior. | Erro da simulação alimenta calibração, não memória promocional automática. |
| 330 | Homologar Digital Twin somente em shadow mode e fechar a onda. | Zero escrita operacional, trilha de versão e pacote aprovado. |

## Onda 17 — Homologação real e release V3000 (331–340)

Resultado: uma release única, rastreável e apta a operar com dados reais.

| Fase | Entrega objetiva | Evidência de conclusão |
|---:|---|---|
| 331 | Executar lead sintética ponta a ponta em tenant de teste. | Entrada, distribuição, atendimento, funil e relatório reconciliam. |
| 332 | Executar uma lead Meta real controlada com autorização. | Webhook, atribuição, SLA, proprietário e recibos comprovados. |
| 333 | Executar conversa WhatsApp oficial controlada. | Consentimento, mensagens, status, timeline e memória reconciliam. |
| 334 | Homologar jornada completa do corretor. | Corretor não vê outros donos e conclui sua rotina crítica. |
| 335 | Homologar jornada completa do gerente. | Gerente vê equipe correta, coaching, SLA e transferências permitidas. |
| 336 | Homologar jornada completa do diretor. | Diretoria controla fila, campanha, relatórios, riscos e aprovações. |
| 337 | Validar relatório real de uma incorporadora. | Gasto, leads, corretores, etapas, vendas e materiais conciliam. |
| 338 | Ensaiar incidente, rollback e recuperação. | Tempo, responsáveis, backup e retorno são registrados. |
| 339 | Calcular readiness por evidência e decidir GO/NO-GO. | Ausência aparece como pendência; nenhuma porcentagem é presumida. |
| 340 | Executar regressão final, build único e ZIP V3000. | Testes, manifesto, migrations, documentação, checksum e decisão humana aprovados. |

---

## Painel de acompanhamento do programa

O progresso deve ser medido em cinco dimensões, sem média artificial quando houver bloqueador:

- **Receita e conversão:** avanço qualificado, visita, proposta, venda e comissão;
- **Velocidade operacional:** tempo de resposta, próxima ação e SLA;
- **Qualidade de dados e sinal:** atribuição, identidade, reconciliação e CAPI;
- **Adoção e produtividade:** tempo de tarefa, uso útil do Copilot e aceite de recomendações;
- **Confiabilidade:** testes, RLS, erros, reprocessamento, backup e rollback.

## Política de IA V3000

1. **Observe:** a IA lê e gera diagnóstico sem sugerir ação externa.
2. **Recommend:** após evidência mínima, sugere ação explicável para aprovação humana.
3. **Execute with approval:** somente integrações homologadas executam uma ação autorizada, limitada e auditável.
4. **Learn:** resultado real é comparado com sugestão e decisão; memória só é promovida com regra explícita.

Nenhuma fase autoriza orçamento, mensagem, transferência, alteração de lead ou envio Meta automaticamente por existir uma chave no ambiente.

## Marcos de release

| Onda | Fases | Release candidata | Decisão principal |
|---:|---:|---|---|
| 01 | 171–180 | W01/P180 | Os números têm uma verdade única? |
| 02 | 181–190 | W02/P190 | Toda lead entra sem perda ou duplicidade? |
| 03 | 191–200 | W03/P200 | A distribuição é rápida, justa e governada? |
| 04 | 201–210 | W04/P210 | O corretor sabe o que fazer agora? |
| 05 | 211–220 | W05/P220 | A conversa oficial vira histórico confiável? |
| 06 | 221–230 | W06/P230 | A IA gera valor seguro e mensurável? |
| 07 | 231–240 | W07/P240 | A Meta recebe sinal CRM confiável? |
| 08 | 241–250 | W08/P250 | A diretoria decide mídia por receita? |
| 09 | 251–260 | W09/P260 | Projeto, estoque e material ajudam a fechar? |
| 10 | 261–270 | W10/P270 | O gerente corrige gargalos reais? |
| 11 | 271–280 | W11/P280 | O diretor decide com menos ruído? |
| 12 | 281–290 | W12/P290 | A base antiga gera incremento responsável? |
| 13 | 291–300 | W13/P300 | Forecast e comissão reconciliam com vendas? |
| 14 | 301–310 | W14/P310 | O pacote instala, roda e recupera sem surpresa? |
| 15 | 311–320 | W15/P320 | A experiência é rápida, acessível e decisiva? |
| 16 | 321–330 | W16/P330 | Cenários podem ser testados sem risco real? |
| 17 | 331–340 | W17/P340 | O Atlas One está comprovado para operação? |

## Regra de início

A fase 171 só deve começar após o fechamento factual das fases 166–170 ou a declaração explícita das pendências herdadas. Trabalho pendente não desaparece ao iniciar um novo plano.
