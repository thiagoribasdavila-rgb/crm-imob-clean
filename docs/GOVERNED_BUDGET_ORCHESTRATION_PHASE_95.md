# Fase 95 — Orquestração governada de orçamento

O Atlas gera cenários em BRL usando 30 dias de resultados CRM, confiança da amostra, estoque disponível e capacidade comercial. Projetos sem estoque ou sem capacidade são bloqueados; amostras pequenas recebem apenas exploração limitada. Mínimos, máximos e saldo não alocado permanecem visíveis.

A aprovação registra a decisão do diretor, mas não movimenta verba. Pessoas não são ranqueadas e a recomendação não substitui caixa, margem, contrato com incorporadora ou conferência nas plataformas.

## Homologação

1. aplicar migrations 91 e 95;
2. importar fatos por projeto e conferir 30 dias;
3. testar projeto sem estoque, capacidade esgotada e amostra baixa;
4. testar mínimos acima do orçamento e saldo não alocado;
5. aprovar/rejeitar como diretor e conferir leitura da superintendência;
6. validar dois tenants e conciliar o cenário com Ads Manager;
7. comprovar que nenhuma verba externa foi alterada.
