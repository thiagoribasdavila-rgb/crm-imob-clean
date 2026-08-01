# Fase 40 — Velocidade e conversão do funil

## Resultado

O Atlas mede, dentro da mesma coorte, quantas leads alcançam cada etapa, quantas chegam à etapa seguinte e quanto tempo levam para sair. O histórico preserva avanços mesmo quando a lead retorna depois.

## Confiança

Conversões exigem 30 entradas e tempos exigem 10 saídas para comparação segura. Reversões são mostradas. Amostra baixa continua visível, mas não sustenta conclusão sobre desempenho.

## Governança e homologação

A API usa sessão, organização, RLS e hierarquia. O painel não atribui causalidade, não ranqueia pessoas e não age automaticamente. Validar coortes, avanço, salto, retorno, reversão e dois tenants. Execute `npm run funnel-velocity:check`.
