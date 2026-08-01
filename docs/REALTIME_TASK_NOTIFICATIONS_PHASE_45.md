# Fase 45 — Notificações em tempo real

## Resultado

A caixa e o contador superior acompanham inserções e atualizações sem recarregar. O contador usa somente lembretes pessoais, não lidos e não descartados. A região acessível anuncia mudanças importantes.

## Segurança e resiliência

Realtime usa RLS e filtro por `assigned_to`. Cada tela remove o canal ao sair. Erro ou timeout muda o estado para atualização manual; o fluxo operacional continua disponível.

## Homologação

Aplicar migration após a Fase 44 e validar duas sessões, inserção, leitura, descarte, reconexão, logout, filtro lateral e dois tenants. Execute `npm run realtime-notifications:check`.
