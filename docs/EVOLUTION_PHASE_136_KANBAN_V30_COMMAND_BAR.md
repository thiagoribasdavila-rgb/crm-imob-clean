# Fase 136 — Kanban V30 Command Bar

## Objetivo

Criar uma barra de comando para o Kanban V30, deixando as decisões mais importantes em presets claros e reduzindo o ruído dos controles espalhados.

## O que foi implementado

- Barra de comando dentro do Kanban operacional.
- Preset `Vender agora` para priorizar leads com maior chance, risco ou atraso.
- Preset `Salvar SLA` para recuperar primeiro contato vencido.
- Preset `Definir ação` para limpar oportunidades sem compromisso.
- Preset `Ver receita` para alternar para visão de diretor, forecast e valor.
- Preset `Mapa completo` para auditoria ampla do quadro.
- Estado visual compacto mostrando cards, etapas e modo foco.

## Impacto operacional

O usuário passa a escolher o modo de trabalho antes de mexer no quadro. Isso ajuda o corretor a agir, o gerente a destravar a equipe e o diretor a olhar forecast, sem abrir painéis extras ou interpretar vários filtros técnicos.

## Segurança

- Não altera lead.
- Não movimenta etapa automaticamente.
- Não envia mensagem.
- Não cria automação autônoma.
- Apenas aplica filtros, ordenação, lente e visualização.

## Validação

- `npm run evolution:phase-136:check`
- `npm run typecheck`
- `npm run lint`
