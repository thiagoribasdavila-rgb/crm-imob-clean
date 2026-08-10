# Documento ampliado

O plano original de 25 fases foi ampliado para 50 fases. A versão canônica está em [`ATLAS_VALUE_DELIVERY_CYCLES_350_399.md`](./ATLAS_VALUE_DELIVERY_CYCLES_350_399.md).

<!--

## Mudança de método

As fases 350–399 deixam de ser uma sequência de tarefas isoladas. O trabalho passa a acontecer em dez ciclos de valor, cada um com cinco fases inseparáveis:

1. medir a linha de base real;
2. implementar a menor mudança completa;
3. integrar ao fluxo que já existe;
4. validar com papel autenticado e dados reais;
5. provar o ganho e decidir a liberação.

Uma fase técnica não representa progresso de produto sozinha. Um ciclo só termina quando o usuário conclui a jornada, a persistência e as permissões continuam corretas, a regressão passa e uma métrica antes/depois é registrada.

## Ciclos planejados

| Ciclo | Fases | Entrega operacional | Usuário | Métrica principal |
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

## Pacotes operacionais de liberação

| Pacote | Fases | Corrente de valor | Condição para instalável |
|---|---:|---|---|
| A | 350–359 | entrada da lead, primeira ação e avanço no Kanban | jornada autenticada, regressão e métrica antes/depois |
| B | 360–369 | distribuição governada e memória oficial de conversa | isolamento por organização, webhook idempotente e auditoria |
| C | 370–379 | visão da incorporadora e Lead 360 operacional | reconciliação por amostra e ausência de trabalho duplicado |
| D | 380–389 | visita, proposta, materiais vigentes e sinal de receita | validade de material, atribuição rastreável e fallback sem credencial |
| E | 390–399 | recomendação proativa e decisão executiva | explicabilidade, aprovação humana e link até a ação corretiva |

O fechamento de um pacote autoriza uma versão candidata; não obriga ZIP ou deploy. O artefato só é gerado quando todos os ciclos do pacote estiverem aprovados e o conjunto de testes aplicável passar.

## Regras de proteção

- Não recriar módulos: usar páginas, APIs, tabelas e testes já presentes.
- Não declarar integração externa ativa sem chamada real aprovada e evidência.
- Não criar baseline fictício; se ainda não houver amostra, registrar `sem amostra`.
- Não expor dados fora da organização ou hierarquia do usuário.
- Não gerar ZIP no meio de ciclo.
- Não fazer deploy automaticamente.
- Cada ciclo deve ter caminho seguro de desativação ou rollback.

## Evidência mínima por ciclo

- jornada funcional demonstrável;
- cenário de sucesso e de erro;
- loading e estado vazio;
- teste do papel principal;
- teste de isolamento por organização;
- regressão direcionada;
- métrica antes/depois;
- decisão explícita: liberar, corrigir ou reter.

## Resultado esperado no fechamento da fase 399

O V30 fecha com uma corrente única e mensurável: a lead entra, recebe ação, avança no Kanban, é distribuída com governança, gera memória no canal oficial, aparece no relatório da incorporadora, mantém seu contexto no Lead 360, evolui até visita e proposta com material vigente, devolve sinais confiáveis ao marketing e chega ao diretor como uma decisão explicável. A tecnologia só conta como evolução quando essa corrente comercial funciona de ponta a ponta.

Fonte estruturada: `config/evolution-value-cycles-350-374.json` (ampliada até a fase 399 sem quebrar consumidores do arquivo original).
-->
