# ATLAS AI OS — Fase 20/24

## Especificação local de remediação Supabase

Esta fase transforma somente workstreams ativos e aprovados da Fase 19 em
pacotes locais de desenho. Ela não gera SQL, não cria migration, não consulta o
Supabase e não persiste o pacote produzido pelo avaliador.

## Decisão de arquitetura

Uma contagem sanitizada demonstra a classe e a quantidade de findings, mas não
é suficiente para escolher um objeto ou escrever uma correção. Por isso a Fase
20 separa três decisões:

```text
plano sanitizado válido
          ↓
aprovação humana curta e vinculada por hash
          ↓
especificação local em memória
          ↓
autoria humana de SQL somente na Fase 21
```

O revisor aprova ou adia todos os workstreams ativos. Workstreams com contagem
zero não podem entrar na aprovação.

## Sete padrões de desenho

1. RLS: ativação explícita, predicado tenant e privilégio mínimo;
2. grants: alcance explícito da Data API revisado junto com RLS;
3. UPDATE: policy de SELECT, `USING` e `WITH CHECK`;
4. views: `security_invoker` ou remoção da superfície exposta;
5. funções privilegiadas: invoker preferencial, `search_path` fixo e EXECUTE
   explícito quando definer for indispensável;
6. advisors de segurança: correção específica e nova validação de isolamento;
7. advisors de performance: evidência de ganho sem mudar a semântica de
   autorização.

Grants determinam quais objetos os papéis alcançam e RLS determina quais linhas
podem ser acessadas; os dois controles devem ser revisados juntos:
<https://supabase.com/docs/guides/api/securing-your-api>.

O Supabase também confirma que tabelas expostas precisam de RLS, UPDATE exige
SELECT e que views devem usar `security_invoker` no PostgreSQL 15+:
<https://supabase.com/docs/guides/database/postgres/row-level-security>.

Chaves secretas e `service_role` permanecem exclusivamente no backend:
<https://supabase.com/docs/guides/database/secure-data>.

## Contrato da aprovação

- validade máxima de 60 minutos;
- uso único e ainda não consumido;
- hash exato do plano;
- ao menos um workstream ativo aprovado;
- partição completa entre aprovados e adiados;
- nenhum nome de objeto ou SQL;
- somente `local_specification=true`;
- todas as demais autorizações permanecem falsas.

Template:
`docs/templates/ATLAS_REMEDIATION_WORKSTREAM_APPROVAL_TEMPLATE.md`.

## Conteúdo de cada pacote local

- classe, quantidade, prioridade e responsável do finding;
- requisitos fechados de desenho;
- três casos mínimos de verificação;
- rollback obrigatório;
- autoria humana de SQL obrigatória;
- migration ainda não criada;
- nenhuma execução remota autorizada.

O avaliador produz o pacote somente em memória. Ausência do plano ou da
aprovação gera bloqueio explícito, nunca aprovação implícita.

## Comandos locais

```bash
npm run atlas:remediation-spec:assess
npm run atlas:remediation-spec:check
```

## Limites preservados

- nenhum comando remoto;
- nenhuma leitura de linhas comerciais, Auth ou Storage;
- nenhum nome de objeto;
- nenhum SQL;
- nenhuma migration criada ou aplicada;
- nenhuma alteração de branch, produção ou main;
- nenhum build;
- nenhum ZIP.

## Próximo passo

Fase 21/24: uma nova autorização poderá permitir a criação local de migrations
com nomes fornecidos pelo Supabase CLI e testes negativos de isolamento. A
aplicação remota continuará proibida.

