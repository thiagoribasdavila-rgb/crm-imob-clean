# Atlas One — Fase 3: fronteira dos dados executivos

Data: 04/08/2026

## Resultado

A Sala de Comando passa a distinguir **entrada operacional**, **importação histórica** e **registro sem origem suficiente**. Uma base antiga importada hoje deixa de aumentar artificialmente o indicador “leads do dia”, a distribuição e o diagnóstico de equilíbrio.

Esta fase não altera, move ou exclui registros. A separação acontece na leitura analítica existente e preserva o histórico completo para reativação e memória comercial.

## Contrato de classificação

| Classe | Entra nos indicadores diários? | Evidência |
|---|---:|---|
| Operacional | Sim | Origem comercial explícita, sem marcador de importação histórica |
| Importação histórica | Não | Lote, memória histórica, reativação ou origem de base antiga/externa |
| Ambígua | Não | Origem ausente ou insuficiente |

Eventos de distribuição associados a uma importação histórica também ficam fora da leitura operacional. Assim, o recebimento de uma base antiga por um corretor não é apresentado como nova oportunidade gerada pelo marketing naquele dia.

## Snapshot executivo diário

O endpoint de entrada diária agora devolve um snapshot com data comercial em `America/Sao_Paulo`, entradas operacionais, importações históricas, registros ambíguos, atribuições, pendências e recebimentos. O snapshot indica `decisionReady` somente quando há amostra operacional mínima, nenhuma ambiguidade e ledger de distribuição disponível.

Com menos de cinco entradas operacionais no período, origem ambígua ou ausência do ledger, a interface exibe **AMOSTRA INSUFICIENTE**. O sistema continua mostrando os fatos, mas não chama o equilíbrio da distribuição de saudável nem transforma desconhecido em zero conclusivo.

## Segurança e compatibilidade

- A consulta continua autenticada, limitada por organização, papel e hierarquia.
- Nenhum dado pessoal novo é devolvido.
- Não houve migration, mudança de RLS ou escrita no Supabase.
- A compatibilidade com a base legada usa `source` e `import_batch_id` quando os campos canônicos não estão disponíveis.
- A memória histórica segue acessível nos módulos próprios; apenas deixa de contaminar a operação diária.

## Validação

O teste de contrato prova que uma lead de Meta entra na operação, uma lead de “Base antiga” fica na memória histórica e uma lead sem origem fica como ambígua. Também prova que apenas o evento da lead operacional entra nos recebimentos do dia.

## Próxima fase

A Fase 4 deve reorganizar a Sala de Comando em três níveis — agora, trabalho e análise — usando este snapshot como fonte executiva e mantendo detalhes históricos sob demanda.
