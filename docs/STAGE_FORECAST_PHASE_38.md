# Fase 38 — Forecast por etapa

## Resultado

O forecast passa a ter um motor único e explicável. Cada oportunidade aberta usa seu valor e a probabilidade da etapa canônica configurada pela organização. Ganhos, perdas e compradores externos ficam fora da previsão aberta.

## Prazo e confiança

O painel separa prazos vencidos, próximos 30 dias, 31–60, 61–90, após 90 dias e oportunidades sem data. A confiança combina amostra, preenchimento de valor, data prevista e etapa reconhecida. Amostra baixa ou dados incompletos reduzem a confiança explicitamente.

## Governança

A API usa sessão, organização, RLS e hierarquia. O forecast é probabilístico, não garante receita e não afirma crescimento ou queda sem snapshot anterior. Alterações de probabilidade continuam sob decisão humana nas configurações do pipeline.

## Homologação

Testar oportunidades com e sem valor, com data vencida, futura e ausente, todas as etapas, aliases históricos, perfis hierárquicos e dois tenants. Conferir soma manual por etapa. Execute `npm run stage-forecast:check`.
