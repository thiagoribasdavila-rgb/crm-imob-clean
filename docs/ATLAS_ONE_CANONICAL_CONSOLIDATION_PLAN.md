# Atlas One — plano de consolidação canônica

Data: 23/07/2026

## Decisão de base

A base canônica é o conteúdo atual deste workspace.

Ela foi escolhida por completude funcional, não por data ou quantidade de
arquivos. Em relação ao repositório Git oficial anterior, esta base contém:

- a correção pública e segura do bootstrap;
- a identidade e organização reais já preservadas no Supabase;
- a recuperação operacional da Fase 7;
- a migration aditiva `20260723203000_phase_7_operational_recovery.sql`;
- contratos atuais de projetos, incorporadoras, materiais, estoque, campanhas,
  usuários e equipes.

O repositório `/Users/thiagoribasdavila/atlas-v3` permanece uma referência
histórica. Ele não deve substituir esta base porque não contém a migration e as
correções posteriores presentes no workspace.

## Matriz de incorporação

| Origem | Funcionalidade | Motivo para incluir | Arquivo de destino |
|---|---|---|---|
| Workspace atual | autenticação, sessão e bootstrap concluído | fluxo real já validado e organização preservada | `app/(auth)`, `app/api/bootstrap`, `lib/bootstrap`, `proxy.ts` |
| Workspace atual | shell responsivo e navegação por papel | implementação mais completa e integrada ao contexto real | `components/atlas`, `lib/atlas/navigation.ts` |
| Workspace atual | CRM operacional | contratos ativos de lead, pipeline, tarefas e clientes | `app/(crm)`, `app/api/v1` |
| Workspace atual | recuperação operacional da Fase 7 | CRUD, API, RLS e Storage já estruturados no Supabase correto | `app/(crm)/developments`, `app/(crm)/marketing/campaigns`, `app/api/v1`, `supabase/migrations/20260723203000_phase_7_operational_recovery.sql` |
| Repositório oficial anterior | nenhuma substituição integral | os arquivos centrais comparados são anteriores ou divergentes da recuperação atual | somente referência |
| ZIPs anteriores | nenhuma cópia de código | pacotes são artefatos de distribuição e não fonte canônica | nenhum |

## Superfície oficial

A identidade principal é **ATLAS ONE**.

Rotas conceituais, protótipos, duplicidades, páginas de evolução interna e
experimentos permanecem fora do pacote oficial por meio da quarentena canônica.
Integrações externas sem credencial devem aparecer apenas como conexão pendente,
nunca como operação ativa.

## Limite factual da homologação

Login, primeiro administrador, organização e abertura do dashboard possuem prova
real informada e preservada.

Projetos, incorporadoras, materiais, estoque e campanhas possuem implementação
funcional por contrato, mas ainda dependem das seguintes provas operacionais:

1. cadastro de uma incorporadora e projeto reais;
2. upload e leitura de um book real;
3. prévia e aplicação de uma tabela real;
4. criação de gerente e corretor reais;
5. criação de uma campanha interna real.

Enquanto essas provas não existirem, a release pode ser classificada como
**candidata à homologação operacional**, e não como produção homologada.

