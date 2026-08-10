# ATLAS ONE — Fase 361 · Seleção segura da roleta por projeto

## Objetivo

Simplificar a seleção de incorporadora, empreendimento e corretores elegíveis sem permitir que a diretoria edite uma fila diferente da que está visível.

## Correção aplicada

- o filtro de incorporadora agora resolve o empreendimento ativo dentro do conjunto visível;
- ao trocar de incorporadora, o primeiro empreendimento correspondente é aberto automaticamente quando o atual não pertence ao filtro;
- a troca de incorporadora fica bloqueada enquanto houver alterações não salvas;
- a tela informa explicitamente qual empreendimento e incorporadora estão sendo editados;
- incorporadoras sem empreendimentos recebem estado vazio orientado;
- a configuração continua isolada por empreendimento, organização e papel de diretoria.

## Evidência local

- contrato da roleta: 10/10 testes aprovados;
- TypeScript: aprovado;
- ESLint: aprovado;
- governança dos ciclos 350–399: aprovada após correção do verificador obsoleto.

## Estado da fase

`implemented_local / deployment_parity_pending`

A fase não é promovida e nenhum ZIP é gerado até a validação autenticada no ambiente publicado e o fechamento completo do ciclo 360–364.

## Rollback seguro

A mudança é restrita ao resolvedor puro de filtro e ao componente de seleção. A API, as tabelas e os dados da operação real não foram alterados.
