# Atlas One — Fase 58: validação de cenários reais

## Resultado

O Centro de Decisão agora pode transformar uma decisão supervisionada sobre uma lead em um cenário verificável. O sistema confirma a fonte no mesmo tenant, congela a evidência-base, registra a premissa e o resultado esperado e só permite a aferição depois da janela definida.

## Fluxo

1. a pessoa revisa uma recomendação ligada a uma lead real;
2. ativa `Validar como cenário real`;
3. declara premissa, resultado esperado, métrica e direção;
4. o servidor relê a lead no Supabase e congela o valor-base;
5. até a data de aferição, o resultado permanece pendente;
6. depois da janela, o servidor relê a mesma lead e registra a comparação;
7. a pessoa confirma o resultado observado e encerra o ciclo.

## Métricas comparáveis

- etapa comercial;
- score registrado;
- presença de próxima ação agendada.

Ausência de evidência nunca é classificada como acerto. A comparação informa `não comparável` quando a base ou o resultado não sustentam a conclusão.

## Arquitetura preservada

- reutiliza `atlas_decisions`, `recommended_action` e `result`;
- não cria tabela ou migration paralela;
- valida `organization_id` tanto na captura quanto na aferição;
- não modifica lead, etapa, score, contato ou campanha;
- não executa ação externa;
- mantém decisão e resultado sob supervisão humana.

## Limite desta fase

Nenhum cenário foi gravado no banco remoto durante a implementação. A prova real depende de uma decisão humana, de uma lead existente e da passagem da janela escolhida. A Fase 59 deve medir o antes/depois da experiência e da qualidade decisória sem usar dados fictícios.
