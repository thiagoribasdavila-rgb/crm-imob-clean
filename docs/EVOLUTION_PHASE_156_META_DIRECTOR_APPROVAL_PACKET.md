# Fase 156 — Meta Director Approval Packet

## Objetivo

Criar um pacote de aprovação para o diretor decidir se uma campanha Meta deve avançar para teste real, escalar ou voltar para ajuste.

## Problema resolvido

Campanhas podem parecer boas por volume de leads, mas ainda não provaram qualidade comercial. A Fase 156 compacta as evidências mais importantes em uma visão executiva: briefing, evento de otimização, campanha líder, conversão atual e checklist de validação.

## Alterações realizadas

- A página de campanhas ganhou a seção **Pacote de decisão antes de escalar**.
- O Atlas monta um resumo com:
  - projeto;
  - perfil comprador;
  - promessa da oferta;
  - etapa do funil;
  - evento de otimização;
  - campanha líder;
  - métricas de qualificação, visitas e vendas.
- Foi adicionado um botão para copiar o pacote de aprovação em formato auditável.
- A tela ganhou um checklist de evidências para teste real de lead:
  - campanha, conjunto e anúncio identificados;
  - lead real recebido sem duplicidade;
  - origem, projeto e consentimento preservados;
  - perguntas mínimas de qualificação respondidas;
  - evento de otimização definido pelo diretor;
  - retorno de conversão pronto para auditoria.

## Impacto operacional

O diretor ganha uma decisão mais rápida e menos ruidosa. O time sabe o que falta antes de considerar uma campanha pronta. A operação passa a proteger o aprendizado do Meta/Andromeda com dados mais limpos e orientados a comprador real.

## Segurança e governança

- Nenhuma campanha real é alterada.
- Nenhuma verba é modificada.
- Nenhuma chamada externa é executada.
- Nenhuma migration foi criada.
- O pacote é apenas rascunho de aprovação para revisão humana.

## Checklist de validação

- `npm run evolution:phase-156:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa recomendada

Transformar o pacote aprovado pelo diretor em uma fila operacional: campanha pronta para teste, campanha em ajuste, campanha pausada e campanha candidata a escala.
