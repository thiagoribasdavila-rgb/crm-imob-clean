# ATLAS AI OS — Fase 77/3000

## Objetivo

Permitir que corretor, gerente e diretor confiram quais fatos humanos formam as contagens da memória comercial, preservando o recorte selecionado e o acesso hierárquico.

## Problema resolvido

O Atlas já mostrava a quantidade de resultados em cada janela e se a amostra atingia o mínimo operacional. Ainda faltava uma forma simples de verificar a origem dessas contagens. A fase 77 adiciona evidência auditável em modo somente leitura, sem transformar o painel em uma lista extensa ou expor dados de contato.

## Alterações realizadas

- Criado contrato tipado para evidências do período atual e anterior.
- Reutilizado o último resultado humano confirmado de cada tarefa, exatamente como nas contagens existentes.
- Mantidos período, categoria filtrada, organização e escopo hierárquico da consulta.
- Exibidos resultado, lead, tarefa, horário observado, projeto e origem atual.
- Removidos do contrato telefone, e-mail, conteúdo de mensagens e credenciais.
- Expostos total da janela, itens compactos mostrados e quantidade restante.
- Adicionado painel nativo recolhível, fechado por padrão, para preservar a leitura limpa do Copilot.
- Adicionado acesso ao contexto da lead somente para fatos já visíveis ao usuário autenticado.
- Nenhuma nova consulta, tabela, migration, chamada de modelo ou escrita operacional foi criada.

## Impacto operacional

A liderança consegue conferir rapidamente por que uma contagem existe antes de agir. O corretor consegue retornar ao contexto da lead sem procurar manualmente. A experiência continua compacta e não mistura evidência auditável com previsão, ranking ou recomendação automática.

## Segurança e governança

- A API exige sessão válida e usa o cliente Supabase do usuário.
- Organização, hierarquia e RLS continuam sendo aplicadas antes da montagem das evidências.
- O endpoint permanece dinâmico e responde com `no-store`.
- Apenas fatos humanos confirmados e vinculados a tarefa e lead são elegíveis.
- Quando há mais evidências que o limite visual, o total completo permanece explícito.
- O painel não contém telefone, e-mail ou texto de conversa.
- Nenhuma ação comercial é executada a partir da leitura.

## Risco identificado

Projeto e origem são lidos do cadastro atual da lead, não de um snapshot histórico imutável. O painel informa essa limitação. A lista visual também é intencionalmente compacta; os itens ocultos continuam incluídos nas contagens e sua quantidade é mostrada.

## Checklist de validação

- [x] Períodos atual e anterior usam fronteiras equivalentes e sem sobreposição.
- [x] Apenas o último resultado humano confirmado por tarefa é exibido.
- [x] O filtro de resultado também recorta as evidências.
- [x] Totais não são reduzidos pelo limite visual.
- [x] Itens restantes são informados.
- [x] Telefone, e-mail, mensagens e credenciais não entram no contrato.
- [x] Painel fechado por padrão e operável por teclado.
- [x] Link de contexto usa apenas leads já presentes no escopo autenticado.
- [x] Sem chamada de IA externa.
- [x] Sem escrita no banco ou alteração de schema.
- [x] Build e ZIP mantidos para o gate único de release.

## Próxima etapa recomendada

Fase 78 — tornar explícita a recência dos fatos observados e avisar quando a memória do recorte estiver desatualizada, sem inferir qualidade, intenção ou probabilidade de venda.
