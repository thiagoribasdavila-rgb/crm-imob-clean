# ATLAS 10X — Fase 10/24

## Reconciliação do ledger remoto

A homologação `atlas-v3-homologacao` foi localizada e o histórico de
migrations foi lido sem alterar schema, usuários ou dados comerciais.

## Evidência comprovada

| Evidência | Valor |
| --- | ---: |
| Saúde do projeto | `ACTIVE_HEALTHY` |
| PostgreSQL | 17 |
| Migrations remotas | 179 |
| Versões remotas únicas | 179 |
| Nomes com timestamp original embutido | 141 |
| Arquivos locais | 124 |
| Versões locais duplicadas | 3 |

> Atualização de pré-homologação (23/07/2026): o snapshot acima
> permanece histórico e imutável. O workspace possui agora 125 migrations.
> A única adição posterior conhecida é
> `20260723090000_explicit_data_api_grants.sql`, criada para tornar explícitas
> as permissões da Data API. Ela não é considerada aplicada remotamente até a
> validação do ambiente; qualquer outra adição inesperada reprova o gate.

O remoto usa timestamps do momento de aplicação como `version` e preserva,
em grande parte, o timestamp de autoria dentro do `name`. A cadeia local usa
o timestamp de autoria no nome do arquivo. Portanto, as duas listas não têm
paridade direta de versão.

## O que as três colisões significam

O histórico remoto confirma a intenção das migrations seguintes:

- `20260716235900` e `20260716235901`;
- `20260717203000` e `20260717203001`;
- `20260717213000` e `20260717213001`.

Isso explica a ordem pretendida, mas não autoriza renomear os arquivos locais.
Corrigir apenas essas três colisões continuaria deixando 124 versões locais
incompatíveis com as 179 versões registradas remotamente.

## Por que não usar `migration repair`

O Supabase CLI compara timestamps locais e remotos no fluxo de
`migration list`. `migration repair` altera o estado do histórico remoto;
usá-lo para mascarar essa divergência destruiria a evidência de como o banco
foi criado.

Nesta fase são proibidos:

- `supabase migration repair`;
- `supabase db push`;
- renomear migrations;
- aplicar DDL ou DML;
- criar branch paga sem autorização;
- executar build ou criar ZIP.

## Estratégia aprovada

Criar um baseline canônico novo, sempre em ambiente isolado:

1. obter um clone sanitizado ou snapshot estrutural da homologação;
2. restaurar somente em destino loopback/efêmero;
3. capturar schema, RLS, grants, funções e invariantes;
4. executar a prova dinâmica da Fase 8;
5. gerar um baseline único que represente o estado real;
6. arquivar as migrations históricas sem apagá-las;
7. iniciar novas migrations incrementais a partir do baseline;
8. comparar o diff e ensaiar rollback;
9. solicitar aprovação humana.

## Referências operacionais

- O fluxo local do Supabase CLI é associado ao diretório do projeto e usa
  migrations versionadas.
- A documentação do Supabase CLI descreve que `migration list` compara os
  timestamps das migrations locais e remotas.
- Projetos atuais devem ser ensaiados em PostgreSQL 17, que já é a versão da
  homologação.

## Limitação registrada

Uma consulta agregada adicional de saúde do schema foi rejeitada pelo
mecanismo de aprovação antes de chegar ao banco. Ela não foi reexecutada por
outro caminho e não é necessária para reconciliar o ledger. A inspeção de
RLS, grants e funções continua reservada ao clone isolado.
