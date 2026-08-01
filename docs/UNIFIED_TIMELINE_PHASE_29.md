# Fase 29 — Timeline unificada

## Resultado

A lead recebeu um histórico cronológico único com autoria, origem, data e categoria. A tela reúne eventos existentes sem criar uma segunda fonte da verdade.

## Fontes consolidadas

- atividades e mudanças do CRM;
- contatos recebidos e enviados;
- transferências e respectivos responsáveis;
- ações e recomendações da IA;
- simulações, apresentações e decisões de proposta;
- sinais de campanhas, Meta e demais integrações.

Eventos são classificados em CRM, contato, transferência, IA, proposta ou integração. Simulações já representadas por uma atividade não aparecem novamente.

## Privacidade e escopo

A leitura exige sessão, acesso à lead, organização atual e RLS hierárquico. Mensagens mostram somente direção, canal e estado; conteúdo, identificadores externos e payloads técnicos não são enviados à tela. Perfis são usados apenas para atribuir autoria dentro da mesma organização.

## Homologação

1. Criar uma lead e conferir o evento inicial.
2. Registrar nota, mensagem, transferência, qualificação por IA e simulação.
3. Confirmar ordem cronológica, autoria e filtros.
4. Garantir que mensagem não exponha conteúdo nem identificador do provedor.
5. Entrar com corretor lateral e confirmar bloqueio.
6. Repetir com gerente, superintendente e diretor dentro de seus escopos.
7. Executar `npm run unified-timeline:check`.

Pendências externas: confrontar a sequência com eventos reais do WhatsApp, Meta e proposta; validar duas organizações e avaliar paginação acima de 500 eventos.
