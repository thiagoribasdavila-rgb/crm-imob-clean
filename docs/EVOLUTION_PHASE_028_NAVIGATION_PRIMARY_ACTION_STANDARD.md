# Fase 028 — Padronização da ação principal

## Resultado

O ATLAS agora possui um contrato único para ações de cabeçalho e para a ação operacional persistente da barra superior. Cada `PageHeader` aceita **no máximo uma ação** e sua prioridade precisa ser declarada como primária ou secundária.

Isso elimina a competição entre links simples, botões primários e botões secundários montados manualmente, sem remover funções ou trocar destinos.

## Linha de base estrutural

Antes da fase, 13 cabeçalhos montavam ações como conteúdo React arbitrário e usavam três apresentações concorrentes:

- link textual simples;
- botão primário;
- botão secundário.

Depois da migração:

| Contexto | Quantidade | Prioridade |
|---|---:|---|
| Criação de cliente | 1 | Primária |
| Aprofundamentos do Command Center | 11 | Secundária |
| Abertura do forecast de vendas | 1 | Secundária |
| Ação operacional persistente da topbar | 1 espaço | Primária e contextual |

Nenhum `actions={<...>}` permanece nos consumidores auditados.

## Contrato compartilhado

O componente `AtlasActionLink` concentra:

- estilo primário ou secundário;
- nome acessível com fallback para o rótulo visível;
- ícone e seta opcionais tratados como decorativos;
- truncamento controlado para preservar o layout;
- metadado de prioridade para inspeção e teste.

O `PageHeader` não recebe mais um bloco arbitrário de ações. Ele recebe somente uma declaração com destino, rótulo, prioridade e informações acessíveis. Esse limite é imposto pelo tipo do componente, e não por convenção informal.

## Hierarquia aplicada

A ação contextual da topbar continua sendo o comando operacional dominante da tela. Os cabeçalhos internos do Command Center são aprofundamentos e, por isso, usam prioridade secundária. A criação de um novo cliente permanece primária porque representa o resultado principal daquela página.

Esse modelo evita transformar todos os links em botões dominantes e mantém a leitura executiva limpa.

## Responsividade e acessibilidade

- Ações de página preservam alvo mínimo de 44 pixels.
- No celular, a ação pode ocupar a largura disponível sem causar estouro.
- Rótulos longos truncam visualmente, mas o nome acessível permanece completo.
- Ícone e seta não são anunciados por leitores de tela.
- A hierarquia não depende apenas de cor: formato, peso, preenchimento e borda diferenciam prioridades.

## Preservação funcional

- Os 13 destinos existentes foram preservados.
- Nenhuma rota foi removida ou criada.
- Nenhum formulário, endpoint ou fluxo paralelo foi criado.
- A política de acesso e os guardas do servidor permanecem obrigatórios.
- Nenhum dado operacional ou segredo foi consultado.

## Reapontamento da medição (2026-07-29)

A propriedade desta fase é **toda tela tem uma ação primária óbvia e governada**. O número "13 `action={{` em `app/(crm)/dashboard/page.tsx` e `app/(crm)/sales/page.tsx`" era um *proxy* dessa propriedade, e o proxy deixou de existir por duas causas medidas:

1. O redesenho CC-6 trocou aqueles `PageHeader` por heróis próprios. Medido: `dashboard/page.tsx` tem hoje 18 linhas e é apenas `redirect("/command-center")` — **0** ocorrências; `sales/page.tsx` tem **1**. A asserção irmã, que exigia 12 ações secundárias no mesmo par, media **1**.
2. "Clientes 360" (`/customers`) foi aposentada — lia a mesma tabela de `/leads` sem piso de carteira. A criação de cliente que ela sustentava vive hoje em `/leads`.

O que tornou a pergunta outra: a ação primária de cada tela passou a **existir em pixel**. `lib/atlas/navigation.ts` declara `primaryAction` por destino (rótulo, destino e resultado comercial), `atlasNavigationContexts` a carrega até a interface e `components/atlas/topbar.tsx` a renderiza como botão primário, com o resultado comercial no nome acessível. Antes, esse dado morria uma linha antes da tela e a topbar caía num "Novo lead" fixo.

A asserção passou então a medir onde a propriedade vive:

- **16 destinos** do catálogo, cada um com `label`, `href` e `outcome` não vazios — verificado **executando** o catálogo, não por expressão regular;
- a ação resolvida por `getAtlasNavigationContext` é idêntica à declarada, inclusive em subrota (`/pipeline/discards` → `/pipeline?focus=priority`);
- a topbar consulta a ação do destino **antes** da transição (`atlasTaskActions`), e essa ordem é conferida;
- prioridade explícita e inspecionável (`AtlasActionLink`, `data-atlas-action-priority`) permanece exatamente como antes.

Nada foi afrouxado. O registro histórico `pageHeadersMigrated: 13` continua no manifesto e continua conferido como história; o que parou foi re-medi-lo contra código vivo que já não hospeda aqueles cabeçalhos. A garantia "aprofundamento não disputa com a ação da tela" ficou **mais estrita**: antes valia para 2 arquivos, agora vale para os **18** cabeçalhos de `app/`, e prioridade implícita passou a ser proibida.

### Consequência corrigida no código

Com a topbar finalmente renderizando a ação primária real, quatro cabeçalhos que omitiam `priority` herdavam o padrão `"primary"` e produziam **dois botões primários na mesma tela**. A regra aplicada foi uniforme — o cabeçalho é secundário quando apenas transita para outra tela, e primário só quando carrega a ação da própria tela e nenhuma outra superfície a carrega:

| Tela | Ação | Decisão |
|---|---|---|
| `/brokers` | "Distribuir leads" → `/distribution` | Secundária — o catálogo já declara essa transição em `atlasTaskActions`, e a topbar carrega "Ver desempenho" |
| `/leads/import/historico` | "Reativação" → `/leads/import` | Secundária — é voltar para a tela pai |
| `/leads/import` | "Adicionar uma base" → `#nova-base` | Primária declarada — age nesta própria tela |
| `/properties` | "Abrir Matching IA" | Primária declarada — `/properties` não é destino do catálogo, então a topbar cai no "Novo lead" genérico |

## Limite de evidência

Esta fase comprova consistência estrutural, limite de uma ação por cabeçalho e hierarquia visual explícita. Isso **não comprova aumento de conversão, redução real de cliques ou tempo de conclusão**; esses indicadores dependem de telemetria autorizada em homologação.

O bloqueio de staging da Fase 020 permanece ativo.

## Próxima fase

Fase 029 — **Arquitetura de navegação · Criar carregamento progressivo**.

O próximo avanço deve priorizar conteúdo essencial durante a navegação, reduzir saltos visuais e manter ações disponíveis enquanto módulos secundários são carregados.
