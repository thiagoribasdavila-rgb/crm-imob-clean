# Atlas One V3000 — Fases 37 a 56

## Evolução dos cards orientada à conversão

Este plano complementa as 36 fases já documentadas. Ele não cria um novo
dashboard, um novo Kanban ou uma segunda biblioteca visual. A evolução parte dos
tokens, primitives, score, SLA, próxima ação, cockpit por papel e cards V30 que
já existem e consolida tudo em uma experiência única.

## Regras do ciclo

- nenhum número fictício, hardcoded ou apresentado como predição real;
- nenhum card novo sem uma pergunta comercial e uma ação associada;
- uma ação primária visível por card; ações secundárias ficam sob demanda;
- score, urgência, SLA, temperatura e probabilidade não podem disputar o mesmo
  significado;
- projeto, etapa, responsável e última interação formam a identidade mínima de
  uma oportunidade;
- IA recomenda e explica; nenhuma ação externa é executada sem autorização;
- componentes legados só são removidos depois de confirmar seus consumidores;
- cada ciclo fecha com regressão, prova autenticada e decisão humana.

## O que já existe e será preservado

- design tokens e primitives canônicos;
- cards de métricas com relevância primária ou de apoio;
- prioridade comercial, score, temperatura, SLA e próxima ação;
- cockpit do Command Center por papel;
- Kanban V30 com barra de comando, cabeçalho por etapa e card decisivo;
- Lead 360, memória comercial, materiais e recomendação de próxima ação;
- relatórios por campanha, projeto e incorporadora;
- autenticação, organização, RBAC e RLS atuais.

## Ciclo A — Consolidação visual e semântica

### Fase 37 — Inventário factual de cards

Mapear todos os cards renderizados, sua rota, origem dos dados, ação, papel e
estado. Identificar cópias, variações sem função e componentes legados que não
participam da experiência canônica.

**Aceite:** 100% dos cards visíveis classificados como métrica, decisão,
oportunidade, alerta ou contexto; nenhum card sem proprietário técnico.

### Fase 38 — Contrato único do card de decisão

Estender os primitives existentes com um contrato único: identidade, evidência,
relevância, urgência, ação primária, explicação e atualização. Não criar uma
segunda biblioteca de cards.

**Aceite:** os cards de Leads, Pipeline e Command Center usam a mesma gramática
sem perder os seus dados ou operações.

### Fase 39 — Hierarquia de informação progressiva

Definir três camadas de leitura: decisão em três segundos, contexto ao expandir
e histórico no Lead 360. Remover textos repetidos e esconder detalhes que não
mudam a decisão imediata.

**Aceite:** cada card exibe no máximo uma mensagem principal, três sinais e uma
ação primária antes da expansão.

### Fase 40 — Densidade adaptativa por tela e papel

Usar os mesmos dados em modos compacto, confortável e executivo. Corretor vê
execução; gerente vê exceções; diretor vê impacto e tendência.

**Aceite:** nenhuma duplicação de API ou regra de negócio entre os modos; a
densidade se adapta a desktop e mobile sem cortar a ação principal.

### Fase 41 — Estados confiáveis e consistentes

**Status: concluída e protegida por contrato automatizado.**

Unificar skeleton, vazio, parcial, desatualizado, erro recuperável e bloqueio de
permissão. Um zero real não pode parecer falha, e uma falha não pode parecer
zero.

**Aceite:** cards nunca exibem métrica inventada, `NaN`, erro técnico ou estado
ambíguo ao usuário.

**Implementado:** primitiva server-safe única, adapters legados compatíveis,
semântica acessível, proteção de mensagens técnicas, ação de recuperação e
adoção inicial em Sala de Comando, Leads e Pipeline. O gate de contrato cobre
sete estados, sete invariantes e mutantes contra zero ambíguo, erro técnico e
adoção removida. Detalhes em `docs/V3000_PHASE_41_RELIABLE_STATES.md`.

## Ciclo B — Oportunidade e próxima ação

### Fase 42 — Identidade comercial inequívoca

**Status: concluída e protegida por contrato automatizado.**

Consolidar no card de oportunidade: nome, projeto, etapa, origem, responsável e
última interação. Corrigir cards que não identificam o empreendimento ou usam
fallback pouco claro.

**Aceite:** toda oportunidade visível pode ser reconhecida sem abrir o Lead 360.

**Implementado:** leitura comercial única no primeiro nível do card, com nome,
empreendimento, etapa, origem, responsável resolvido no mesmo tenant e última
interação real. Fallbacks distinguem dado ausente de vínculo existente e a API
continua operacional quando o nome do responsável estiver temporariamente
indisponível. Detalhes em `docs/V3000_PHASE_42_COMMERCIAL_IDENTITY.md`.

### Fase 43 — Relógio comercial contextual

**Status: concluída e protegida por contrato automatizado.**

Transformar SLA e atraso em prazo acionável: quanto tempo resta, qual compromisso
venceu e qual impacto provável. Preservar o cálculo atual; mudar somente a forma
de decisão.

**Aceite:** urgência sempre possui causa, prazo e ação; cor nunca é o único sinal.

**Implementado:** cada oportunidade exibe um relógio comercial compacto derivado
do SLA e da próxima ação existentes, com prazo, causa, impacto e ação em texto.
Estados vencido, próximo do prazo, agendado, sem planejamento e encerrado possuem
semântica própria sem depender apenas de cor. Detalhes em
`docs/V3000_PHASE_43_COMMERCIAL_CLOCK.md`.

### Fase 44 — Uma ação primária por oportunidade

**Status: concluída e protegida por contrato automatizado.**

Escolher a ação mais útil entre contatar, agendar, enviar material, registrar
resultado ou avançar etapa. Telefone, WhatsApp, e-mail e demais ações ficam no
menu contextual quando não forem a recomendação principal.

**Aceite:** um clique inicia a ação recomendada; não há fileira permanente de
ícones concorrentes.

**Implementado:** o card, a decisão mobile e o preview lateral agora usam um
único seletor contextual. SLA ou follow-up vencido prioriza contato; ausência
de compromisso prioriza registro; visita e proposta recebem comandos próprios;
oportunidades quentes podem avançar em um clique. Ações auxiliares permanecem
no contexto expandido e o avanço não é duplicado. Detalhes em
`docs/V3000_PHASE_44_SINGLE_PRIMARY_ACTION.md`.

### Fase 45 — Continuidade da conversa

**Status:** implementada e validada em 11/08/2026.

Resumir o último contato comprovado, canal, resposta e próximo compromisso. Não
inferir conversa do WhatsApp quando o webhook ou a linha não estiverem
conectados.

**Aceite:** o corretor entende onde a conversa parou e não repete uma abordagem
já registrada.

**Implementado:** o card consulta, dentro do tenant, somente metadados da última
conversa e da última mensagem. O canal aparece como comprovado apenas quando há
identificador externo ou status de entrega/recebimento; o conteúdo da mensagem
não é lido nem exposto. Sem evidência de mensageria, a interface usa apenas o
histórico de contato já registrado no lead. Detalhes em
`docs/V3000_PHASE_45_CONVERSATION_CONTINUITY.md`.

### Fase 46 — Compatibilidade cliente × projeto

**Status:** implementada e validada em 11/08/2026.

Mostrar aderência com evidências reais de faixa de preço, região, tipologia,
prazo e objetivo. Ausência de dado deve aparecer como pergunta de qualificação,
não como compatibilidade baixa.

**Aceite:** toda recomendação de empreendimento lista os sinais usados e o dado
mais importante ainda ausente.

**Implementado:** o card revela, sob demanda, os sinais factuais comparados
entre cliente e empreendimento. Faixa de preço, região e tipologia só recebem
estado de aderência quando os dois lados possuem dados; prazo e objetivo são
exibidos como informações conhecidas. O primeiro dado ausente vira uma pergunta
de qualificação e nunca uma compatibilidade baixa. Detalhes em
`docs/V3000_PHASE_46_PROJECT_COMPATIBILITY.md`.

## Ciclo C — Inteligência explicável e gestão

### Fase 47 — Confiança e explicação da recomendação

Separar score cadastrado, prioridade operacional e confiança da IA. Explicar por
que o card entrou na fila e quando os dados foram avaliados.

**Aceite:** nenhuma porcentagem é apresentada como chance de venda sem amostra,
método e origem comprováveis.

**Status:** implementada e validada em 11/08/2026.

**Implementado:** score cadastrado, prioridade operacional, qualidade da
evidência e confiança da IA agora são conceitos separados. O card explica sob
demanda por que entrou na fila, quais dados sustentam a decisão e até quando a
base foi considerada. A confiança é qualitativa e mede cobertura dos sinais
registrados; não representa probabilidade de venda. Detalhes em
`docs/V3000_PHASE_47_RECOMMENDATION_CONFIDENCE.md`.

### Fase 48 — Sinais comportamentais compactos

Resumir eventos relevantes já registrados — retorno, visita, abertura de
material, mudança de preferência e silêncio — sem transformar o card em uma
timeline completa.

**Aceite:** no máximo três eventos que alterem a próxima decisão; histórico
completo permanece no Lead 360.

**Status:** implementada e validada em 11/08/2026.

**Implementado:** o card resume, sob demanda, até três sinais provenientes de
conversa confirmada, datas operacionais ou metadados explícitos do CRM. Retorno
do cliente suprime o alerta de silêncio; etapa de visita não presume conclusão;
abertura de material e mudança de preferência só aparecem com registro factual.
Origem, momento e impacto na decisão permanecem visíveis, enquanto o histórico
integral continua no Lead 360. Detalhes em
`docs/V3000_PHASE_48_BEHAVIORAL_SIGNALS.md`.

### Fase 49 — Atribuição de campanha até a oportunidade

Conectar no card origem, campanha, projeto, incorporadora e estágio do funil com
os vínculos reais já existentes. Custos e receita só aparecem quando o período e
a atribuição forem válidos.

**Aceite:** diretor consegue seguir campanha → lead → corretor → etapa sem
duplicar contagem ou misturar incorporadoras.

**Status:** implementada e validada em 11/08/2026.

**Implementado:** rastro factual individual e progressivo no card, com campanha,
lead, corretor, etapa, origem, projeto e incorporadora. Ausências permanecem
explícitas, divergência de incorporadora bloqueia a atribuição e valores
financeiros só podem aparecer com rastro completo, período válido e valores
registrados. Detalhes em
`docs/V3000_PHASE_49_OPPORTUNITY_ATTRIBUTION.md`.

### Fase 50 — Objeção e lacuna decisiva

Destacar somente a objeção ativa ou o dado que impede o próximo passo: preço,
crédito, prazo, região, tipologia ou falta de retorno.

**Aceite:** cada lacuna oferece uma pergunta ou ação objetiva; notas livres não
são rotuladas automaticamente como objeção.

**Status:** implementada e validada em 11/08/2026.

**Implementado:** o card escolhe no máximo um bloqueio comprovado entre objeção
estruturada, incompatibilidade do projeto, falta de retorno e lacuna de
qualificação. Preço, crédito, prazo, região, tipologia e retorno recebem pergunta
ou ação objetiva; notas livres são ignoradas e uma objeção resolvida não é
mantida como ativa. Detalhes em
`docs/V3000_PHASE_50_DECISIVE_OBJECTION.md`.

### Fase 51 — Cards orientados por papel

Aplicar a mesma oportunidade a três leituras: execução do corretor, intervenção
do gerente e impacto do diretor. Respeitar hierarquia, organização e escopo de
dados.

**Aceite:** corretor não vê dados de terceiros; gerente vê somente sua estrutura;
diretor recebe agregados e exceções comprovadas.

**Status:** implementada e validada em 11/08/2026.

**Implementado:** a leitura do card agora deriva exclusivamente do papel
autenticado. Corretor recebe próxima ação e etapa sem exposição do responsável;
gerente recebe intervenção, responsável e exceções apenas nas linhas permitidas
por API e RLS; diretor recebe impacto, potencial registrado e exceções factuais,
apoiado pelos agregados da etapa. A lente manual permanece somente como
organização visual e não amplia visibilidade. Detalhes em
`docs/V3000_PHASE_51_ROLE_ORIENTED_CARDS.md`.

## Ciclo D — Experiência futurista, velocidade e prova real

### Fase 52 — Command Center por exceção

Recompor o Command Center com uma prioridade principal, fila curta de exceções e
indicadores de apoio. Eliminar blocos que repetem o mesmo total em seções
diferentes.

**Aceite:** o usuário identifica a decisão do dia em até cinco segundos e chega
à oportunidade em até dois cliques.

**Status:** implementada e validada em 11/08/2026.

**Implementação:** o Command Center mantém uma única decisão principal no topo,
remove da sequência qualquer repetição dessa decisão e limita a leitura seguinte
a três exceções ordenadas por evidência. Três indicadores de apoio usam somente
agregados já autorizados pela API autenticada e RLS; não houve nova consulta,
mutação de negócio, chamada de IA ou migration. Detalhes em
`docs/V3000_PHASE_52_COMMAND_CENTER_EXCEPTIONS.md`.

### Fase 53 — Kanban por decisão, não por decoração

Consolidar os cards V30 já existentes, preservar drag-and-drop governado e
reduzir ornamentos, badges e controles repetidos. Cabeçalho da etapa mostra só
volume, valor válido e gargalo principal.

**Aceite:** mover um card preserva auditoria, validação, próxima ação e contexto
do projeto; o board continua utilizável em telas menores.

**Status:** implementada e validada em 11/08/2026.

**Implementação:** cabeçalho reduzido a volume, valor válido e gargalo; projeto,
validação e próxima ação permanecem visíveis no card; contexto detalhado usa
divulgação progressiva; movimento governado e leitura móvel continuam
preservados. Detalhes em `docs/V3000_PHASE_53_DECISION_KANBAN.md`.

### Fase 54 — Movimento, foco e acessibilidade

Usar motion apenas para confirmar mudança, chegada de dado ou expansão.
Implementar foco visível, navegação por teclado, contraste, texto alternativo e
modo de movimento reduzido.

**Aceite:** WCAG AA nos componentes críticos e nenhuma animação bloqueia ação ou
leitura.

**Status:** implementada e validada em 11/08/2026.

**Implementação:** contrato acessível centralizado por card; foco inequívoco,
atalhos descobríveis, anúncio atômico de estado, contraste reforçado e suporte a
cores forçadas; movimento restrito a mudança, chegada de dado ou expansão;
`prefers-reduced-motion` remove movimento não essencial sem alterar o fluxo
governado. Detalhes em
`docs/V3000_PHASE_54_MOTION_FOCUS_ACCESSIBILITY.md`.

### Fase 55 — Performance e telemetria de decisão

Reduzir renderizações, payloads e consultas redundantes. Medir tempo para
identificar prioridade, abrir oportunidade, executar ação e registrar resultado,
sem coletar conteúdo pessoal desnecessário.

**Aceite:** orçamento de performance definido e melhora comprovada em dados
comparáveis; nenhum ganho apenas visual é chamado de conversão.

**Status:** implementada e validada em 11/08/2026.

**Implementação:** índices únicos substituem buscas e agrupamentos redundantes;
o percurso decisório mede prioridade, abertura, início de ação e resultado pelo
coletor autenticado já existente; o payload é minimizado e não inclui identidade,
contato ou conteúdo de conversa. Na carga controlada de 500 leads e sete etapas,
a preparação das colunas cai de 3.500 comparações para 507 operações (redução de
85,51%). Detalhes em `docs/V3000_PHASE_55_DECISION_PERFORMANCE.md`.

### Fase 56 — Homologação comercial e gate de release

Executar testes unitários, contratos, typecheck, lint, build, smoke autenticado,
RBAC, isolamento por organização, desktop e mobile. Homologar com diretor,
gerente e corretor em cenário real controlado.

**Aceite:** zero regressão P0/P1, ações críticas persistem no banco, métricas não
duplicam e a release só avança com evidência e aprovação humana.

**Status:** gate implementado e validado tecnicamente em 11/08/2026;
homologação autenticada e aprovações humanas pendentes.

**Implementação:** decisão formal com três estados (`passed`, `pending-human` e
`blocked`), projetos Playwright separados para desktop e mobile, matriz de
gates automatizados, evidência versionada sem segredos e promoção impedida até
aprovação de diretor, gerente e corretor. Detalhes em
`docs/V3000_PHASE_56_COMMERCIAL_HOMOLOGATION.md`.

## Entregas instaláveis

1. **Release A — fases 37–41:** consolidação dos cards sem mudança comercial.
2. **Release B — fases 42–46:** cards de oportunidade e ação assistida.
3. **Release C — fases 47–51:** inteligência explicável e visão por papel.
4. **Release D — fases 52–56:** Command Center, Kanban, performance e
   homologação.

Cada release exige regressão completa. O ZIP de produção só deve ser gerado
depois da Fase 56; as releases intermediárias são candidatos de homologação e
não devem ser promovidas automaticamente.

## Métricas de sucesso

- tempo mediano até a primeira ação útil;
- percentual de leads com próxima ação e prazo;
- SLA de primeiro contato e follow-up;
- tempo mediano por etapa do funil;
- percentual de cards abertos que resultam em ação registrada;
- redução de leads sem projeto, responsável ou origem;
- conversão por projeto, campanha e corretor com amostra válida;
- taxa de recomendações aceitas, rejeitadas e com resultado comprovado.

O objetivo do ciclo não é aumentar a quantidade de cards. É reduzir o tempo
entre o sinal comercial e uma ação correta, preservando rastreabilidade e
segurança.
