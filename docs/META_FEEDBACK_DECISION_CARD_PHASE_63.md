# Fase 63 — decisão explicável de feedback

O Atlas transforma um sinal comercial elegível em uma decisão explicável: referências internas, evidências verificadas, códigos de motivo e a próxima ação permitida. A única recomendação possível é solicitar o gate externo de teste.

Diretoria e segurança precisam aprovar de forma independente. O card não expõe dados do cliente, não ajusta campanha, não altera público nem orçamento e não faz despacho automático. Esta fase não chama Meta, não acessa banco, não executa build e não cria ZIP.

```bash
node scripts/preflight-meta-feedback-decision-card.mjs --self-test
```
