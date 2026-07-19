# Fase 64 — Estoque e espelho de vendas canônico

## Resultado

Cada unidade possui identidade única dentro do empreendimento, vínculo à tipologia canônica, origem, versão e data real da última mudança de disponibilidade. Preço, status e perfil operacional deixam histórico imutável com autor e motivo.

## Proteções

- Escrita atômica por diretoria, superintendência ou gerente; corretores permanecem em leitura.
- Concorrência otimista impede sobrescrever uma atualização mais recente.
- Reserva ativa bloqueia mudança incompatível de preço ou disponibilidade.
- Código canônico combina organização, empreendimento, torre/bloco e unidade.
- Mudanças manuais e integrações identificam a origem e incrementam a versão.

## Homologação externa

Aplicar migrations 63–64 e validar espelho real, unidades repetidas, duas atualizações concorrentes, reserva ativa, preço, status, histórico, gerente, corretor e dois tenants.
