# Fase 023 — Linha de base da arquitetura de navegação

## Resultado

A navegação do Atlas agora possui uma linha de base estrutural reproduzível. A medição cobre topologia do App Router, profundidade das rotas, referências internas, cobertura do catálogo governado e dependências das seis jornadas críticas definidas na Fase 022.

Esta fase mede o que o código comprova. Ela **não prova comportamento** de usuário, quantidade real de cliques, tempo de conclusão, abandono ou conversão. Esses indicadores permanecem bloqueados até existirem sessões reais autorizadas em homologação.

## Linha de base medida

| Evidência | Resultado |
| --- | ---: |
| Arquivos de navegação analisados | 183 |
| Rotas CRM | 141 |
| Destinos canônicos existentes | 26 de 26 |
| Profundidade estrutural máxima | 4 segmentos |
| Profundidade média | 1,91 segmentos |
| Rotas com até 2 segmentos | 115 |
| Rotas com 3 ou 4 segmentos | 26 |
| Referências internas detectadas | 177 |
| Destinos internos únicos | 67 |
| Referências dinâmicas | 75 |
| Componentes `Link` | 190 |
| Âncoras internas HTML | 2 |

A medição pode ser repetida por `npm run navigation-baseline:measure`. O snapshot oficial está em `config/evolution-phase-023-navigation-baseline.json`.

## Descoberta dos destinos canônicos

Os 26 destinos canônicos estão presentes e são publicados pelo catálogo governado compartilhado entre sidebar, busca e navegação móvel.

Dez deles não possuem uma segunda referência explícita medida fora desse catálogo:

- atividades;
- inteligência operacional;
- simulações estratégicas;
- conversas;
- Cliente 360;
- vendas externas;
- integrações;
- Revenue Engine;
- configurações;
- usuários e acessos.

Isso não significa que estejam inacessíveis. Significa que dependem do catálogo compartilhado e devem ganhar atalhos contextuais somente onde o resultado comercial justificar a descoberta adicional.

## Jornadas críticas

| Jornada | Estrutura existente | Referência contextual medida | Uso real |
| --- | --- | --- | --- |
| Capturar nova lead | Sim | Dashboard e shell | Aguardando telemetria |
| Agir na prioridade | Sim | Dashboard | Aguardando telemetria |
| Avançar oportunidade | Sim | Ação na própria tela | Aguardando telemetria |
| Localizar material vigente | Sim | Projetos | Aguardando telemetria |
| Distribuir lead | Sim | Ação na própria tela | Aguardando telemetria |
| Diagnosticar integração | Sim | Não medida na página inicial | Aguardando telemetria |

A jornada de diagnóstico de integração é o principal ponto de descoberta contextual para a próxima simplificação: o destino `/integrations/health` existe, mas a página de integrações não apresenta referência direta medida.

## Riscos objetivos encontrados

1. **Descoberta profunda:** 26 rotas possuem três ou quatro segmentos e dependem de um contexto claro para serem encontradas.
2. **Dependência do catálogo:** dez destinos canônicos dependem exclusivamente da navegação compartilhada, sem atalho adicional medido.
3. **Saúde das integrações:** a jornada existe, mas ainda não possui entrada contextual direta na superfície inicial.
4. **Navegação interna bruta:** duas oportunidades usam `<a>` para uma rota interna, em vez do componente `Link` do App Router, podendo perder a transição cliente otimizada.

Esses pontos são prioridades verificáveis, não falhas presumidas de conversão.

## Limite comportamental

Continuam sem valor publicado:

- taxa de clique;
- mediana de ações até concluir;
- taxa de conclusão;
- abandono;
- tempo até o resultado comercial.

A instrumentação criada anteriormente poderá medir esses eventos quando houver homologação real por perfil, consentimento e ambiente reproduzível. Até lá, todos permanecem `null`.

## Segurança e preservação

- Nenhum dado de aplicação foi consultado.
- Nenhuma variável secreta foi lida.
- Nenhuma informação pessoal foi capturada.
- Nenhuma rota foi alterada, removida ou redirecionada.
- Nenhuma decisão automática sobre pessoas foi executada.
- O gate bloqueado da Fase 020 não foi contornado.

## Próxima fase

Fase 024 — **Arquitetura de navegação · Eliminar duplicidade**.

Ela deverá usar esta linha de base para consolidar entradas redundantes com compatibilidade explícita, priorizando o diagnóstico de integrações e os sete grupos semânticos já classificados, sem apagar rotas ou favoritos de forma prematura.
