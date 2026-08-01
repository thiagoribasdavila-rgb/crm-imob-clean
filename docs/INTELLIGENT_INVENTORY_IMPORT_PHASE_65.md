# Fase 65 — Importação e atualização inteligente de tabelas

## Resultado

Tabelas `.xlsx` e `.csv` são lidas no servidor, normalizadas e comparadas ao espelho canônico. O Atlas classifica cada linha como criação, atualização, sem mudança, conflito ou erro e exige prévia antes de aplicar.

## Segurança operacional

- Arquivo de até 15 MB e 5.000 linhas, com assinatura real e hash SHA-256.
- Colunas obrigatórias: unidade, tipologia, preço e status; nomes comuns em português são reconhecidos.
- Tipologia precisa existir no catálogo da Fase 63.
- Arquivo repetido, unidade duplicada, conflito ou erro bloqueiam a aplicação.
- Somente diretoria/superintendência aprovam, com motivo; aplicação é atômica e reutiliza concorrência e proteção de reservas da Fase 64.

## Homologação externa

Aplicar migration 65 e validar XLSX/CSV reais de três incorporadoras, separadores, moeda brasileira, 5.000 linhas, duplicidade, conflito, reserva ativa, arquivo repetido, dois tenants e rollback transacional.
