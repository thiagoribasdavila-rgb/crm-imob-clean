# Fase 96 — Relatórios executivos multicanal

Relatórios versionados de dia, semana e mês consolidam campanha, projeto e incorporadora. Investimento e mídia vêm dos snapshots conciliados; qualificação, visitas, propostas e vendas vêm do CRM. Alertas ficam separados dos fatos e nenhuma PII entra no payload.

Diretor gera e revisa; superintendência acompanha. A revisão não executa decisões.

## Homologação

1. aplicar migrations 91 e 96;
2. gerar os três períodos e conferir limites de datas;
3. conciliar totais com campanhas, projetos e incorporadoras;
4. repetir a mesma evidência e confirmar deduplicação;
5. validar alertas de gasto sem lead e amostra insuficiente;
6. revisar como diretor, bloquear demais perfis e testar dois tenants.
