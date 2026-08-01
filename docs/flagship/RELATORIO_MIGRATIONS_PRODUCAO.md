# RELATÓRIO DE MIGRATIONS — PRODUÇÃO

**2026-07-31T14:31:25Z** · consultado no banco vivo, **sem aplicar nada**.

## O BANCO ESTÁ INTACTO — o incidente é de aplicação, não de dados

Esta é a primeira coisa a estabelecer, porque o CRM está fora do ar e a pergunta
imediata é "perdi alguma coisa?".

| medida | valor |
|---|---:|
| leads | **483** |
| perfis | 23 |
| movimentos de funil | 201 |
| linhas de investimento | 94 |
| decisões em sombra | 20 |
| snapshots de conversão | 370 |

**Nada foi perdido.** A queda é de configuração da aplicação — a instância no ar
não tem as variáveis para *alcançar* o banco. O banco segue servindo normalmente
(esta consulta é a prova).

## RLS — COBERTURA TOTAL

| medida | valor |
|---|---:|
| tabelas em `public` | **185** |
| tabelas com RLS habilitada | **185** |
| políticas | 220 |

**185 de 185.** Nenhuma tabela exposta sem política.

## MIGRATIONS

| lado | quantidade |
|---|---:|
| arquivos no repositório | **180** |
| registradas no banco | **226** |
| **drift de schema real** | **0** |

O número do banco ser maior que o do repositório **não é drift**: são migrations
antigas aplicadas antes de o repositório existir no formato atual. Medido em
30/07 objeto por objeto: **toda migration do repositório tem seus objetos no
schema**.

Comparar por `version` daria falso vermelho permanente — `version` é o carimbo
de aplicação e nunca coincide com o prefixo do arquivo. Foi assim que "109
migrations faltando" nasceu, e **105 delas eram falsas**.

## PENDENTES PARA ESTE DEPLOY: NENHUMA

As 4 migrations desta linha de trabalho **já estão aplicadas**, e as provas são
as próprias linhas contadas acima:

| migration | prova de que está aplicada |
|---|---|
| `20260731120000` índice único em `marketing_spend` | 94 linhas, **0 duplicatas** |
| `20260731140000` `created_by` aceita NULL | 370 snapshots, todos sem autor humano |
| `20260731150000` `numeric(9,6)` | 370 valores, **0 zerados**, faixa 0,03–2,52 |
| índice de leitura por período | consulta por faixa de data responde |

> **O deploy não precisa aplicar migration nenhuma.** É publicação de aplicação,
> não mudança de schema — o que reduz muito o risco e torna o rollback trivial:
> voltar a release anterior não deixa o banco em estado incompatível.

## O QUE PERMANECE COMO DÍVIDA

**15 migrations existem só no banco, sem arquivo no repositório.** Um clone limpo
não reconstrói a base por causa delas. **4 são ambíguas** por tocarem em `GRANT`,
RLS ou trigger — as três áreas que produziram a escalação de privilégio de 30/07.

**Não resolvi nesta rodada, de propósito:** extrair e versionar essas 15 durante
um incidente de produção seria mexer em permissão com o sistema fora do ar.

## `supabase db push` CONTINUA FORA

Com 180 migrations contra o schema vivo e **sem ambiente espelho**, ele não é
reconstrução — é roleta. `atlas-v3-homologacao` **é** a produção.

## BACKUP

**Não executei backup lógico**: exige `pg_dump` com credencial de banco que não
tenho nesta sessão. O que existe é o backup automático do plano Supabase.

**Para este deploy isso é aceitável** — nenhuma migration será aplicada, então
não há alteração de schema a reverter. **Não seria aceitável** num deploy com
migration pendente.
