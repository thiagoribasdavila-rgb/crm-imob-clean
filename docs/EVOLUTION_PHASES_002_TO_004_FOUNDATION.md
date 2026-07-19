# Fases 002–004 — fundação comercial e navegação canônica

## Resultado comercial

O Atlas deve levar cada perfil à próxima ação comercial correta em até três decisões de navegação. A interface prioriza decisão, preserva contexto e não publica indicadores sem evidência.

## Linha de base

A auditoria registrou 141 páginas CRM, 20 destinos principais, quatro grupos de sidebar, 17 comandos globais, quatro atalhos móveis e seis jornadas críticas. Tempos e taxas de abandono permanecem pendentes até existirem eventos reais de homologação.

## Duplicidade eliminada

Sidebar, busca global e dock móvel agora derivam de `lib/atlas/navigation.ts`. O comando histórico Atlas V2 deixa de ser promovido, mas sua rota não é apagada. Nenhum dado ou histórico foi migrado ou removido.

## Gate

- catálogo único compilável;
- quatro ações móveis derivadas do catálogo;
- nenhuma falsa métrica comportamental;
- rota histórica preservada fora da navegação ativa.
