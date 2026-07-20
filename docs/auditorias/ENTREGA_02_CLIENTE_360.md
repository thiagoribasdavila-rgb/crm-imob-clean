# Entrega 02 — Cliente 360

**Branch:** `claude/atlas-v3-entregas` · **Commits:** `aabafc79`, `9ec88f65` · **Data:** 2026-07-19

## Objetivo

Fechar lacunas de qualidade na área mais madura do roadmap (~85% segundo a Entrega 01), sem depender de tabelas ausentes do banco vivo (schema drift documentado no adendo da Entrega 01).

## O que foi encontrado

1. **Timeline do lead** (`app/api/v1/leads/[id]/timeline/route.ts`): consulta 5 tabelas ausentes do schema vivo (`lead_transfer_items`, `conversations`, `campaign_events`, `commercial_simulations`, `messages`). Verificado na fonte da lib (`@supabase/postgrest-js`): o cliente não lança exceção em erro de query (só via `.throwOnError()`, não usado em lugar nenhum do repo) — o endpoint já degrada graciosamente hoje via `?? []`. **Nenhuma edição necessária.**
2. **Código morto confirmado e removido:** `app/(atlas)/crm/customer/[id]/page.tsx` + `Customer360.tsx` + `SalesCopilot.tsx` + `NextBestAction.tsx` — mock 100% estático (dado hardcoded, sem fetch), sem nenhum link de navegação, sem nenhum consumidor fora da própria cadeia (confirmado por grep independente, duas vezes, por dois agentes diferentes). Nome quase idêntico ao Copilot real de produção — risco de confusão em revisão.
3. **Bug de crash real, encontrado e corrigido:** `attribution/page.tsx`, `behavior/page.tsx`, `contact-preferences/page.tsx` guardavam `payload.error` bruto (objeto `{code,message}`, formato do helper `apiError()`) direto num `useState<string>` e renderizavam no JSX — React lança `Objects are not valid as a React child`, subindo ao error boundary global. Como as 3 tabelas por trás (`lead_attribution_touches`, `lead_behavior_events`, `lead_contact_preferences`) não existem no banco vivo, a resposta 503 é o caminho normal hoje — ou seja, **essas 3 telas quebravam por completo em produção neste exato momento**. Corrigido com o padrão já usado em 5 telas irmãs (`payload.error?.message || payload.error || fallback`).

## O que foi implementado

- Removidos 4 arquivos de código morto (Customer360 mock).
- Corrigidas 6 ocorrências (2 por arquivo × 3 arquivos) do bug de renderização.
- Nenhuma mudança na timeline (correto: já estava seguro).

## Arquivos alterados

**Removidos:**
- `app/(atlas)/crm/customer/[id]/page.tsx`
- `components/crm/customer/Customer360.tsx`
- `components/crm/customer/intelligence/SalesCopilot.tsx`
- `components/crm/customer/intelligence/NextBestAction.tsx`

**Modificados:**
- `app/(crm)/leads/[id]/attribution/page.tsx`
- `app/(crm)/leads/[id]/behavior/page.tsx`
- `app/(crm)/leads/[id]/contact-preferences/page.tsx`

## Banco de dados

Nenhuma migration criada ou aplicada nesta entrega.

## APIs

Nenhuma API nova ou modificada — só consumo (frontend) corrigido.

## Testes executados

```
npx tsc --noEmit                                    → 0 erros (repo inteiro)
npx eslint . --max-warnings 0 (nos arquivos tocados) → 0 erros/warnings
git diff --stat (por commit)                         → escopo confirmado, nenhum arquivo fora do previsto
```

## Pendências

1. **~25 arquivos agora órfãos** (efeito colateral da remoção do Customer360): `CustomerHeader`, `CustomerProfileCard`, `CustomerScore`, `CustomerAIInsights`, `CustomerJourney`, `CustomerTimeline`, `CustomerMemoryTimeline`, `CustomerDeals`, `CustomerProperties`, `CustomerActions`, `CustomerFinancialProfile`, `CustomerCommunication`, `CustomerBehavior`, `CustomerPrediction` (14 em `components/crm/customer/`) + `CustomerCommandCenter`, `CustomerDigitalTwin`, `CustomerMemory`, `CustomerMemoryScore`, `CustomerRelationshipGraph`, `CustomerEmotionAI`, `CustomerAutonomousAgent`, `CustomerAgent`, `CustomerWealthProfile`, `CustomerLifetime`, `DealSimulator`, `SmartPropertyMatch` (12 em `components/crm/customer/intelligence/`). Não removidos — fora do escopo desta entrega. Decisão futura: limpar ou reaproveitar.
2. **Achado maior, documentado mas não corrigido nesta entrega:** quase todo o menu "Mais ações" do Lead 360 (attribution, behavior, memory, contact-preferences, qualification, prediction, simulation, visit-assistant, schedule — 9 de 15 subrotas) aponta para tabelas fora das 23 vivas. As que já tratam erro corretamente (memory, prediction, qualification, visit-assistant, schedule) mostram banner "indisponível" sem quebrar; as 3 corrigidas aqui quebravam a tela inteira. **Resolvido pela raiz apenas quando as migrations forem aplicadas** (fora do escopo desta entrega — decisão do usuário, Adendo da Entrega 01).
3. Falhas silenciosas de observabilidade identificadas (queries a tabelas ausentes sem log de erro em `qualify/route.ts`, `commercial-simulation/route.ts`, `visit-assistant/route.ts`) — não corrigidas, são melhoria de observabilidade, não bug funcional.

## Riscos

- **Baixo:** os 25 arquivos órfãos não são referenciados em lugar nenhum — não têm risco funcional, só custo de manutenção/confusão se deixados.
- **Médio:** as 6 subrotas do Lead 360 que retornam 200 com dado vazio em vez de erro explícito (simulation, visit-assistant, qualify) mascaram "funcionalidade sem tabela" como "ainda sem dado" — pode confundir o corretor sobre o estado real do sistema até as migrations serem aplicadas.

## Próxima entrega

Conforme discussão em paralelo com o usuário — protocolo de "uma entrega por vez" flexibilizado para fluxo contínuo priorizado por impacto, não mais ordem literal.

---

# Resumo para revisão (ChatGPT)

**Percentual da entrega:** ~90% do que era corrigível sem banco (o núcleo funcional da Cliente 360 já era real; o trabalho aqui foi limpeza + 1 bug de crash real corrigido).

**Funcionalidades realmente implementadas:** remoção de mock morto (Customer360/SalesCopilot/NextBestAction); correção de crash em 3 telas de produção.

**Funcionalidades simuladas:** nenhuma introduzida. Identificadas (pré-existentes, não desta entrega): 9 de 15 subrotas do Lead 360 dependem de tabelas ausentes.

**Arquivos principais modificados:** 4 removidos, 3 modificados (lista completa acima).

**Commits:** `aabafc79` (remoção Customer360), `9ec88f65` (fix crash attribution/behavior/contact-preferences).

**Resultado do build:** não rodado nesta etapa isoladamente (rodar antes do merge — recomendado antes de fechar a branch).

**Resultado do lint:** limpo nos arquivos tocados.

**Resultado do typecheck:** 0 erros, repo inteiro.

**Testes executados:** verificação adversarial por agente independente (releu a fonte da lib postgrest-js, refez os greps de segurança antes de remover, confirmou diffs linha a linha).

**Riscos restantes:** ver seção Riscos acima.

**O que recomendo revisar antes do merge:** (1) decisão sobre os 25 arquivos órfãos; (2) se vale adicionar logging de observabilidade nas 6 subrotas com falha silenciosa; (3) status das migrations pendentes (bloqueador maior que qualquer item desta entrega).
