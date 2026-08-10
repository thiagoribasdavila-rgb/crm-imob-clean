# ATLAS ONE — Plano executável das fases 165–170

Este ciclo leva o programa já existente da fase 164 à fase 170. Não inicia uma trilha paralela e não contabiliza planejamento como progresso.

| Fase | Entrega | Evidência obrigatória | Envio externo |
|---:|---|---|---|
| 165 | Recibo de aprovação da diretoria | evento interno com tenant, validade, justificativa e fingerprint | Não |
| 166 | Congelamento do payload | payload mínimo versionado e hash igual ao contexto aprovado | Não |
| 167 | Gate de execução oficial | autorização separada, expiração, idempotência e dry-run aprovado | Somente após gate humano |
| 168 | Recibo de resultado do teste | resposta da Meta, event ID, latência e diagnóstico sem PII em log | Teste único controlado |
| 169 | Qualidade do sinal e recuperação | deduplicação, cobertura de match, fila de falhas e reprocessamento governado | Controlado |
| 170 | Homologação da onda Meta/Andromeda | critérios executivos, rollback, custo, evidência e decisão de continuar/parar | Gate de release |

## Regra de avanço

Uma fase só avança quando o código existe, o verificador direcionado passa e os contratos de segurança continuam válidos. Build completo permanece reservado ao fechamento da versão, conforme a política do programa.

## Resultado esperado ao fechar a fase 170

O Atlas One terá uma trilha mínima completa entre seleção da lead, aprovação, payload, execução controlada, recibo técnico e decisão executiva. O objetivo não é “ligar automação” por aparência, mas comprovar um sinal real com governança suficiente para aprender sem contaminar dados, campanhas ou orçamento.
