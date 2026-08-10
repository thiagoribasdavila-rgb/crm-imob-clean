# Atlas One — 50 fases de entregas reais (350–399)

## Método de conclusão

Cada ciclo contém cinco fases inseparáveis:

1. medir a linha de base real;
2. implementar a menor mudança completa;
3. integrar ao fluxo existente;
4. validar com papel autenticado e dados reais;
5. provar o ganho e decidir a liberação.

Planejamento não altera o percentual construído. Uma fase só avança com jornada utilizável, persistência e permissões corretas, regressão aprovada e métrica antes/depois.

## Dez ciclos de valor

| Ciclo | Fases | Entrega operacional | Usuário principal | Métrica principal |
|---|---:|---|---|---|
| 20 | 350–354 | Lead recebida até primeira ação | Corretor | Tempo mediano até primeira ação |
| 21 | 355–359 | Kanban orientado à próxima decisão | Corretor | Leads com próxima ação válida |
| 22 | 360–364 | Distribuição por projeto governada | Diretor | Tempo mediano de atribuição |
| 23 | 365–369 | WhatsApp oficial como memória comercial | Corretor | Conversas vinculadas à lead |
| 24 | 370–374 | Relatório executivo por incorporadora | Diretor | Cobertura factual do relatório |
| 25 | 375–379 | Lead 360 sem trabalho duplicado | Corretor | Tempo para registrar resultado e próxima ação |
| 26 | 380–384 | Visita até proposta com material vigente | Corretor | Conversão de qualificado para visita |
| 27 | 385–389 | Marketing até receita com sinais confiáveis | Diretor | Cobertura dos sinais qualificados de conversão |
| 28 | 390–394 | Copilot proativo com decisão humana | Corretor | Recomendações aceitas e executadas |
| 29 | 395–399 | Command Center da decisão à correção | Diretor | Tempo entre alerta e ação corretiva |

### Fechamento local do ciclo 22

As fases 360–364 possuem implementação e contratos locais concluídos. A Fase
364 adicionou mediana, P90, cobertura, concentração observada e desvio da carga
ponderada por projeto, distinguindo amostra medida, insuficiente e ausente. A
promoção continua condicionada à prova autenticada com a amostra real da
organização e à reconciliação controlada da migration da Fase 363; nenhum ZIP
ou deploy foi gerado isoladamente.

## Pacotes instaláveis

| Pacote | Fases | Corrente de valor | Condição para candidato de instalação |
|---|---:|---|---|
| A | 350–359 | entrada da lead, primeira ação e Kanban | jornada autenticada, regressão e métrica antes/depois |
| B | 360–369 | distribuição governada e memória de conversa | isolamento, webhook idempotente e auditoria |
| C | 370–379 | incorporadora e Lead 360 | reconciliação por amostra e ausência de trabalho duplicado |
| D | 380–389 | visita, proposta, materiais e sinal de receita | validade, atribuição rastreável e fallback sem credencial |
| E | 390–399 | recomendação proativa e decisão executiva | explicabilidade, aprovação humana e ação corretiva rastreável |

Fechar um pacote autoriza uma versão candidata; não obriga ZIP nem deploy. O artefato só é gerado quando os dois ciclos do pacote estiverem aprovados e os testes aplicáveis passarem.

## Proteções obrigatórias

- Reaproveitar páginas, APIs, tabelas e testes existentes.
- Não declarar integração externa ativa sem chamada real e evidência.
- Não criar baseline fictício; usar `sem amostra` quando necessário.
- Preservar organização, hierarquia, RLS e operação atual.
- Não gerar ZIP no meio de ciclo.
- Não fazer deploy automaticamente.
- Manter rollback ou desativação segura por ciclo.

## Resultado na fase 399

A lead entra, recebe ação, avança no Kanban, é distribuída com governança, gera memória no canal oficial, aparece no relatório da incorporadora, mantém contexto no Lead 360, evolui até visita e proposta com material vigente, devolve sinais confiáveis ao marketing e chega ao diretor como decisão explicável.

Fonte estruturada: `config/evolution-value-cycles-350-374.json`, mantida no caminho histórico para preservar consumidores existentes e ampliada até a fase 399.
