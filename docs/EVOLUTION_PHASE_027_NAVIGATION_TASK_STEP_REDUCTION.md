# Fase 027 — Redução de passos da tarefa

## Resultado

A barra superior agora usa um único espaço de ação rápida que se adapta ao contexto atual. A interface não ganhou outro menu, outra faixa ou mais botões: o mesmo controle conduz ao próximo destino comprovado da jornada.

Na operação diária, a ação padrão continua sendo **Novo lead**. Em contextos específicos, o rótulo, o ícone e o destino mudam para eliminar a volta ao menu principal.

## Exemplos de continuidade direta

| Contexto atual | Ação rápida | Destino existente | Ações estruturais |
|---|---|---|---:|
| Projetos | Buscar materiais | `/developments/materials` | 1 |
| Integrações | Ver saúde | `/integrations/health` | 1 |
| Tarefas | Abrir agenda | `/calendar` | 1 |
| Agenda | Ver tarefas | `/tasks` | 1 |
| Reativação | Revisar duplicidades | `/leads/deduplication` | 1 |
| Corretores | Distribuir leads | `/distribution` | 1 |
| Relatórios | Centro de decisão | `/decision-center` | 1 |
| Evolução V3 | Abrir homologação | `/atlas-v3/homologation` | 1 |

Esses destinos já existiam. Nenhum formulário, endpoint ou fluxo comercial paralelo foi criado.

## Fonte única e permissão

As 15 transições contextuais ficam em `lib/atlas/navigation.ts`, próximas aos catálogos oficiais. A resolução considera:

- caminho atual exato, sem depender de texto visual;
- papel comercial;
- nível administrativo quando aplicável;
- ação padrão segura quando não existe uma transição específica.

Uma ação contextual só aparece se o perfil atual passar pela mesma política usada na navegação governada. O atalho não concede acesso e não substitui as validações do servidor.

## Busca global

A busca global usa a mesma ação da topbar como primeiro grupo, identificado por **Ação desta tela**. Se o destino já pertence ao catálogo normal, sua cópia é removida daquele resultado para não apresentar duas entradas para o mesmo lugar.

Assim, a topbar e a busca não mantêm listas divergentes.

## Responsividade

- Desktop: ícone e rótulo da ação atual.
- Tablet: somente ícone, preservando espaço para contexto e busca.
- Celular: somente ícone no mesmo controle de 40 pixels.
- Todos os modos: nome acessível completo por `aria-label` e `title`.

## Preservação funcional

- A ação padrão **Novo lead** permanece disponível.
- As 20 telas principais, 6 comandos contextuais e 4 destinos móveis permanecem intactos.
- Nenhuma rota foi removida.
- Nenhuma permissão foi alterada.
- Nenhum dado operacional foi consultado ou modificado.

## Limite de evidência

Esta fase comprova que os destinos profundos selecionados passaram a ficar a uma ação estrutural do contexto. Isso não comprova redução real de tempo, mediana de cliques, conclusão ou abandono; esses resultados dependem da telemetria de homologação autorizada.

## Segurança

- Nenhuma variável de ambiente foi consultada.
- Nenhum dado pessoal foi capturado.
- Nenhuma decisão automática sobre pessoas foi executada.
- RBAC e validação no servidor permanecem obrigatórios.
- O bloqueio de staging da Fase 020 permanece ativo.

## Próxima fase

Fase 028 — **Arquitetura de navegação · Padronizar ação principal**.

O próximo avanço deve fazer a ação contextual e as ações dominantes das páginas compartilharem linguagem, ordem visual e comportamento previsível, sem transformar todas as opções em botões primários.
