# ATLAS AI OS — Fase 74/3000

## Objetivo

Permitir a escolha supervisionada de 7, 30 ou 90 dias para a memória comercial, mantendo a comparação factual entre duas janelas de mesma duração.

## Problema resolvido

A memória comercial estava presa a 30 dias. Isso impedia uma leitura curta para rotina imediata e uma leitura longa para operações com menor volume, além de incentivar comparações externas feitas sem preservar o mesmo método. A seleção agora ocorre dentro do Atlas e aplica as mesmas regras a todos os períodos.

## Alterações realizadas

- Adicionadas as opções fechadas de 7, 30 e 90 dias.
- Mantido 30 dias como padrão compatível com as fases anteriores.
- Validado o parâmetro somente após rate limit e autenticação.
- Rejeitados períodos não suportados com mensagem segura.
- Consultados sempre dois períodos equivalentes e consecutivos.
- Preservado o período escolhido após concluir, reagendar ou registrar o resultado de uma tarefa.
- Adicionado controle compacto e acessível no Copilot, com estado pressionado e atualização identificada.
- Exposto o limite histórico da consulta e um alerta visível quando a amostra pode estar parcial.
- Mantidos cliente Supabase do usuário, organização, RLS e `no-store`.
- Nenhum modelo, tabela, migration, registro comercial ou credencial foi alterado.

## Impacto operacional

Corretor, gerente e diretor podem ajustar o alcance da leitura ao ritmo da operação sem abandonar a mesma base factual. O período curto ajuda a revisar a execução recente; o padrão mantém continuidade; o período longo amplia a observação quando há poucos resultados confirmados.

## Segurança e governança

- A consulta exige sessão válida e permanece limitada à organização.
- O seletor não executa mensagem, tarefa, contato, transferência ou mudança de pipeline.
- A troca não chama modelo generativo e não grava no banco.
- Os dois períodos comparados têm a mesma duração e não se sobrepõem.
- O limite de eventos é comunicado quando pode afetar a completude da leitura.
- A interface continua declarando que contagens não são taxas, causa, previsão ou recomendação.

## Risco identificado

Uma janela de 90 dias consulta 180 dias de eventos. Em operações de alto volume, o limite de 8.000 eventos pode ser atingido. Nessa situação, o Atlas mostra que a leitura pode ser parcial e impede que a amostra seja apresentada como taxa de desempenho.

## Checklist de validação

- [x] Somente 7, 30 e 90 dias são aceitos.
- [x] Trinta dias permanece como padrão.
- [x] Período atual e anterior têm duração igual.
- [x] Janelas continuam consecutivas e sem sobreposição.
- [x] Escolha permanece após atualizações governadas da fila.
- [x] Estado de carregamento e erro é local ao seletor.
- [x] Limite histórico e possível amostra parcial ficam visíveis.
- [x] Sem chamada de IA externa.
- [x] Sem escrita no banco ou alteração de schema.
- [x] Build e ZIP mantidos para o gate único de release.

## Próxima etapa recomendada

Fase 75 — permitir filtrar a memória por resultado humano observado, mantendo amostra, lacunas e comparação sempre explícitas e sem transformar o filtro em ação automática.
