# ATLAS AI OS — Fase 89/3000

## Objetivo

Tratar a evolução futura como um novo **ATLAS Core V1**: uma fundação oficial, estável e vendável construída sobre o que já funciona, sem reiniciar o produto e sem apagar o histórico.

## Problema resolvido

O projeto acumulou três gerações de interface e arquitetura. A auditoria local confirmou:

- 655 arquivos TypeScript/TSX em `app`, `components` e `lib`;
- 122 migrations Supabase;
- 158 arquivos de aplicação com contato direto com Supabase;
- mais de uma Sidebar, MetricCard e implementação de Pipeline/Kanban;
- `app/(atlas)/layout.tsx` importa um módulo `components/layout/Sidebar` que não existe;
- o shell oficial multiempresa já existe em `components/atlas/app-shell.tsx` e deve ser preservado;
- o Digital Twin atual cobre buyer, property e campaign, mas reconstrói lotes limitados, sem paginação, hash de estado ou supressão de snapshots repetidos.

Seguir adicionando recursos antes de consolidar essas decisões aumentaria o custo de cada fase seguinte.

## Alterações realizadas

Foi criado `config/atlas-core-v1-architecture.json` como contrato verificável da fundação.

### Seis camadas oficiais

1. **Operational Truth** — Auth, tenant, dados reais e RLS no Supabase.
2. **Event Ledger** — fatos comerciais imutáveis e resultados humanos.
3. **Digital Twin Engine** — estado atual versionado, explicável e temporário.
4. **Decision Engine** — prioridade, risco e próxima melhor ação determinística.
5. **Copilot & Agents** — assistência contextual independente do fornecedor de modelo.
6. **Action & Learning** — execução governada, resultado observado e aprendizado supervisionado.

### Superfície visual oficial

- rotas operacionais: `app/(crm)`;
- shell: `components/atlas/app-shell.tsx`;
- navegação: `components/atlas/sidebar.tsx`;
- catálogo de acesso: `lib/atlas/navigation.ts`;
- métricas: `components/atlas/metric-card.tsx`;
- tokens: `styles/atlas-tokens.css`, consumidos por `app/globals.css`.

As telas passam a seguir três profundidades:

1. **Glance** — resposta em segundos;
2. **Workspace** — execução da tarefa principal;
3. **Context** — detalhe lateral ou progressivo sem perder a posição.

### Contrato visual de página

- título curto orientado ao resultado;
- uma ação primária;
- no máximo cinco métricas de decisão;
- fila inteligente de prioridades;
- contexto progressivo;
- Copilot adaptado ao papel do usuário.

### Digital Twin V1

O primeiro Twin prioritário será o **Opportunity Twin**, porque reúne lead, intenção, projeto, responsável, SLA, próximo passo e chance calibrada de avanço.

Depois entram Buyer, Development, Inventory, Broker, Campaign e Operation Twins.

Cada sinal deverá declarar valor, fonte, horário observado, validade, confiança, versão, explicação e confirmação humana. Preço, estoque, reserva, comissão e venda continuarão dependendo de dados determinísticos, nunca da opinião de um modelo de linguagem.

### Migração segura

Nenhuma substituição será feita de uma vez. Cada domínio seguirá:

`mapear → contratar → adaptar → ler em sombra → comparar → trocar → retirar legado`

Isso permite homologar o V1 sem interromper a operação atual.

## Supabase e segurança

A fundação incorpora a mudança do Supabase de 2026: tabelas novas no schema público não devem depender de exposição automática à Data API. Grants mínimos, RLS e testes por papel/tenant devem sair juntos na mesma evolução.

Também ficam bloqueados:

- segredo `service_role` em código cliente;
- tela consultando Supabase diretamente em novas implementações;
- policy que autentica sem isolar organização e proprietário;
- função privilegiada sem revisão de `EXECUTE`, escopo e identidade;
- reescrita silenciosa do histórico por IA.

## Impacto operacional

- uma base oficial para todas as novas telas;
- menor tempo de desenvolvimento e correção;
- redução de inconsistência visual e de permissão;
- Digital Twin ligado ao resultado comercial, não apenas a snapshots;
- Copilot com contexto próprio do Atlas, permitindo trocar OpenAI, Kimi, Qwen ou outro provedor sem perder memória;
- caminho claro para transformar lead em ação, resultado e aprendizado.

## O que não foi alterado

- nenhum dado real;
- nenhuma migration;
- nenhuma tabela;
- nenhum comportamento em produção;
- nenhum componente legado foi apagado;
- nenhum build ou ZIP foi gerado.

## Riscos identificados

1. O grupo de rotas `app/(atlas)` pode colidir com a superfície operacional e contém importação inexistente.
2. As 80 migrations com `SECURITY DEFINER` precisam de auditoria individual; presença no arquivo não significa vulnerabilidade, mas exige comprovação.
3. O inventário de migrations não confirma quais foram aplicadas no Supabase de homologação.
4. A troca dos 158 pontos de contato com Supabase precisa ser progressiva para não quebrar fluxos funcionais.

## Checklist de validação

- [x] arquitetura Core V1 registrada;
- [x] superfície visual canônica definida;
- [x] legados classificados sem exclusão;
- [x] regra de migração progressiva definida;
- [x] Opportunity Twin definido como prioridade;
- [x] autonomia da IA separada em cinco níveis;
- [x] regras Supabase 2026 incorporadas;
- [x] gate de build e ZIP preservado para a fase 100.

## Próxima etapa recomendada

**Fase 90 — Contratos oficiais de layout, dados e eventos.** Ela transformará esta arquitetura em interfaces tipadas e verificáveis para páginas, repositórios de dados e eventos comerciais, ainda sem realizar a troca arriscada dos módulos atuais.
