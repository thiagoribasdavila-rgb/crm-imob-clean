# Fase 030 — Estados vazios úteis na navegação

## Resultado

O ATLAS agora possui um contrato compartilhado para explicar por que uma área está vazia e qual é o próximo passo seguro. A ausência de dados deixou de ser tratada como uma mensagem genérica nas rotinas centrais.

A mudança diferencia cinco situações:

| Motivo | Significado | Resposta esperada |
|---|---|---|
| `first-use` | A operação ainda não iniciou naquela área | orientar a primeira criação |
| `no-results` | Existem dados, mas nenhum corresponde ao recorte | limpar ou ampliar filtros |
| `no-activity` | A estrutura existe, mas ainda não recebeu movimentação | explicar como a atividade aparecerá |
| `completed` | A fila está realmente em dia | tranquilizar e oferecer revisão opcional |
| `not-configured` | Falta uma condição operacional conhecida | levar à configuração correta |

## Linha de base estrutural

Antes desta fase havia 101 usos de estado vazio em 57 arquivos CRM, mas nenhum declarava formalmente o motivo. Oito usos continham uma ação detectável pelo inventário estático.

O primeiro recorte governado passou a ter:

- 13 estados com motivo explícito;
- 14 estados com uma ação detectável;
- oito superfícies comerciais centrais cobertas;
- cinco motivos compartilhados pelo design system.

Essas contagens comprovam cobertura estrutural. Não demonstram taxa de cliques, redução de abandono ou resultado comercial em runtime.

## Superfícies priorizadas

- Leads distingue carteira ainda vazia de busca sem correspondência.
- Agenda comunica período concluído e permite criar uma tarefa.
- Tarefas diferencia rotina concluída de filtro sem pendências.
- Pipeline separa etapa sem movimentação, fila concluída e aprendizado comprador ainda vazio.
- Clientes diferencia fonte única inicial de filtro sem resultado.
- Projetos diferencia portfólio inicial de pesquisa sem correspondência.
- Vendas diferencia pipeline de receita ainda vazio de recorte filtrado.
- Distribuição diferencia fila em dia de equipe sem disponibilidade.

## Contrato visual e semântico

O componente `AtlasEmpty` agora expõe `data-empty-reason`, rótulo contextual, título, explicação e ação opcional. Links e botões continuam nativos e, quando presentes, mantêm alvo mínimo de 44 pixels.

Cor e ornamento reforçam o contexto, mas o texto nomeia explicitamente a situação. Um estado concluído sem ação informa que nada precisa ser feito naquele momento.

## Falha não é estado vazio

O contrato não transforma erro de consulta, API ou permissão em ausência de dados. Falhas continuam no componente separado `AtlasRecoverableError`, com proteção dos dados e tentativa novamente.

Esta separação evita que uma tela pareça saudável quando o carregamento falhou.

## Preservação funcional

- Nenhuma consulta, rota ou estratégia de dados foi alterada.
- Nenhum registro fictício foi criado.
- Nenhum usuário, segredo ou dado comercial foi consultado.
- RBAC, tenant, formulários e destinos existentes foram preservados.
- O bloqueio de staging da Fase 020 continua ativo.

## Limite de evidência

O inventário identifica estrutura TSX, motivos e ações declaradas. A utilidade real deve ser validada por perfil em um ambiente de homologação separado e autorizado.

## Próxima fase

Fase 031 — **Arquitetura de navegação · Criar recuperação de falha**.

O próximo avanço deve ampliar a recuperação governada para falhas locais, preservando o restante da página e sem expor detalhes técnicos.
