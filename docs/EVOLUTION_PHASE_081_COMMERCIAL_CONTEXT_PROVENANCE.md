# ATLAS AI OS — Fase 81/3000

## Objetivo

Separar de forma explícita o horário histórico do resultado humano do momento em que projeto e origem são consultados no cadastro atual da lead.

## Problema resolvido

Até a fase 80, os fatos mostravam corretamente quando um resultado humano havia sido registrado, mas o projeto e a origem vinham do cadastro atual da lead. Sem uma indicação clara, o usuário poderia interpretar esse contexto atual como se fosse uma fotografia histórica do momento do resultado.

## Alterações realizadas

- Adicionado um contrato tipado de proveniência à recência contextual.
- Identificado o horário do resultado como o momento do evento humano confirmado.
- Identificados projeto e origem como o snapshot atual da lead resolvido durante a requisição.
- Registrado no payload o horário exato em que esse contexto atual foi consultado.
- Declarado explicitamente que a atribuição histórica de projeto e origem não está confirmada.
- Exibidas as duas bases temporais dentro do disclosure já existente no Copilot.
- Incluído aviso de que projeto ou origem podem ter mudado depois do resultado.
- Mantida a leitura compacta: nenhum novo card principal ou bloco permanente foi criado.
- Nenhuma nova consulta, tabela, migration, chamada de modelo ou escrita operacional foi adicionada.

## Impacto operacional

Corretor e liderança passam a saber exatamente o que o Atlas pode comprovar. O resultado e seu horário continuam auditáveis; projeto e origem passam a ser apresentados corretamente como contexto atual. Isso reduz decisões baseadas em uma associação histórica que ainda não existe no banco.

## Segurança e governança

- Sessão, organização, hierarquia e RLS continuam resolvidos antes da leitura.
- A rota continua usando o cliente autenticado e resposta `no-store`.
- Nenhum identificador pessoal, telefone, e-mail ou mensagem foi adicionado ao painel.
- A proveniência é somente leitura e não muda filtros, score, ranking ou recomendação.
- O componente não dispara ação, automação ou chamada de modelo.
- Não houve mudança de schema nem criação de tabela pública; a exigência atual do Supabase de grants explícitos para novas tabelas não se aplica a esta fase.

## Risco identificado

Os resultados antigos continuam sem uma fotografia histórica de projeto e origem. A fase 81 torna essa ausência transparente, mas não tenta reconstruir, estimar ou inferir o passado a partir do cadastro atual.

## Checklist de validação

- [x] Horário do resultado vem do evento humano confirmado.
- [x] Projeto e origem são identificados como snapshot atual da lead.
- [x] O horário da resolução do contexto é retornado no contrato.
- [x] A atribuição histórica permanece explicitamente falsa.
- [x] A interface mostra as duas temporalidades sob demanda.
- [x] A interface avisa que o contexto pode ter mudado.
- [x] A visualização continua compacta, acessível e sem dados pessoais.
- [x] Nenhuma consulta ou chamada de IA adicional foi criada.
- [x] Nenhuma escrita ou mudança de schema foi executada.
- [x] Build e ZIP permanecem reservados ao gate único de release.

## Próxima etapa recomendada

Fase 82 — capturar, nos novos resultados supervisionados, o projeto e a origem observados no momento da confirmação humana, de forma retrocompatível e sem inventar histórico para resultados antigos.
