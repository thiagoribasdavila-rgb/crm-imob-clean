# Fase 77 — Score preditivo calibrado

## Resultado

Score comercial e probabilidade de conversão permanecem separados. A calibração compara faixas previstas com a conversão observada, mede Brier Score e erro esperado de calibração e cria um candidato imutável.

## Segurança estatística

- Pelo menos 100 exemplos, 20 positivos e 20 negativos.
- Faixas com menos de 20 exemplos mantêm a probabilidade original.
- Nenhuma promoção automática: apenas a diretoria ativa, com justificativa auditável.
- Um único modelo ativo por organização.
- Sem ranking de pessoas ou decisão automática sobre clientes.

## Homologação

Aplicar migrations 75–77, executar `npm run conversion-calibration:check`, construir um candidato sobre dataset validado, comparar faixas, tentar ativar com amostra baixa e validar bloqueio. Depois testar aprovação pelo diretor e isolamento entre tenants.
