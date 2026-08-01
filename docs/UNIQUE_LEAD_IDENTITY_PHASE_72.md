# Fase 72 — Deduplicação e identidade única

O Atlas agrupa telefone ou e-mail normalizado idêntico, mascara o contato e recomenda a lead com melhor qualidade, score e antiguidade. A escolha final é humana.

A consolidação é atômica e bloqueada por identidade. Nenhuma lead é apagada: registros secundários ficam arquivados e vinculados à principal; origem, status e responsável anteriores permanecem no snapshot auditável.

## Homologação

Aplicar a migration, testar telefone/e-mail iguais, contatos diferentes, concorrência, escolha de principal, histórico, carteiras distintas, diretoria, superintendência e dois tenants. Confirmar que nenhuma união ocorre automaticamente.
