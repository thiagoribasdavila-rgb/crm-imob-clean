# Claude / Anthropic no cérebro multi-modelo — Fase 10

## O que foi feito

O `provider-router` (`lib/ai/provider-router.ts`) passou a suportar **Claude (Anthropic)** como provedor, ao lado de OpenAI, Perplexity e os provedores "economy" (DeepSeek/Qwen/Kimi/GLM). Atende à Etapa 2 do roadmap ("conectar Claude") e ao objetivo de o Atlas escolher a melhor IA por tarefa.

## Como funciona

- Chamada via **HTTP cru** ao Messages API da Anthropic (`POST https://api.anthropic.com/v1/messages`, headers `x-api-key` + `anthropic-version: 2023-06-01`), no mesmo padrão `resilientFetch` dos demais provedores — **não** usa SDK e **não** é compatível com o formato OpenAI (o `system` é campo próprio; a resposta vem em `content[]`).
- Modelo default: **`claude-opus-4-8`** (override por `ATLAS_ANTHROPIC_MODEL`).
- Telemetria (uso, orquestração, guardrails) e o roteamento por custo/complexidade funcionam para o Claude como para os outros — nada de novo a instrumentar.

## Não-quebra + governança

- **Aditivo por construção:** o Claude só entra no roteamento se `ANTHROPIC_API_KEY` estiver definido **e** `"anthropic"` aparecer numa ordem de fallback (`ATLAS_AI_FAST_PROVIDER_ORDER` / `ATLAS_AI_COMMERCIAL_PROVIDER_ORDER` / `ATLAS_AI_REASONING_PROVIDER_ORDER`). As ordens default **não** o incluem → **zero mudança de comportamento** até você optar por ele.
- **Dados pessoais → somente OpenAI:** `generateAnthropic` bloqueia contexto com `containsPersonalData` (mesma regra dos provedores economy). O planejador (`commercial-orchestrator`) já força `["openai","local"]` para dados pessoais, então o Claude nunca recebe PII pelo caminho normal — o bloqueio é defesa em profundidade.

## Como ligar

1. Definir `ANTHROPIC_API_KEY` (e opcionalmente `ATLAS_ANTHROPIC_MODEL`) no ambiente.
2. Incluir `anthropic` na ordem desejada, ex.: `ATLAS_AI_REASONING_PROVIDER_ORDER=anthropic,openai,deepseek,local`.

**Custo externo:** cada chamada ao Claude gera custo de tokens da Anthropic. Por isso é opt-in — nada é gasto até você configurar a chave e a ordem.

## Verificação

`tsc --noEmit`: 0 erros no projeto. ESLint: limpo (`lib/ai/**` é ignore do projeto; verificado com `--no-ignore`). Nada alterado em tabelas ou no comportamento default.
