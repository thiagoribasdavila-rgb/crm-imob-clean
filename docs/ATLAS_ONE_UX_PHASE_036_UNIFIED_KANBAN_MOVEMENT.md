# ATLAS ONE — Fase 36: movimento unificado do Kanban

## Objetivo

Fazer todas as formas de movimentar uma oportunidade convergirem no mesmo contrato visual, funcional e acessível, sem alterar regras do funil ou persistência.

## Entrega

- arrastar, teclado, seletor, avanço rápido, confirmação de decisão e desfazer identificam sua origem;
- o recibo único informa método, lead, etapa anterior, destino e estado;
- os estados continuam sendo movimento em curso, sucesso confirmado e falha com restauração;
- o bloco de ações do recibo passa a se reorganizar corretamente no celular;
- confirmação de etapas terminais, trava de movimento simultâneo, histórico, rollback e desfazer permanecem ativos.

## Limites preservados

Nenhuma migration, mudança de banco, nova integração, build, ZIP ou deploy foi executado nesta fase.

## Validação

Executar `npm run ux:phase-036:check`, seguido de typecheck, lint e testes completos.

## Próxima fase

Exibir regras e orientação de avanço apenas quando o usuário demonstrar intenção de mover o card, reduzindo ruído permanente.
