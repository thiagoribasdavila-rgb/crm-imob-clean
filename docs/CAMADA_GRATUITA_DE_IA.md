# Camada gratuita de IA — como ligar em minutos

Escrito em 2026-07-26, depois da medição que motivou isto:

```
❌ Anthropic   401 authentication_error — API key is invalid
❌ OpenAI      chave válida, mas SEM SALDO (insufficient_quota)
✅ Perplexity  operacional
```

Com dois dos três provedores pagos fora, briefing, copy, qualificação e
priorização simplesmente não rodam. A camada gratuita existe para que a operação
não dependa de um cartão para voltar a funcionar.

---

## O que entrou

Seis provedores, todos falando o mesmo dialeto `/chat/completions` da OpenAI —
por isso passam pelo **mesmo caminho de chamada** do roteador, com os mesmos
guardrails: bloqueio para dado pessoal, timeout, retry e registro de uso.

| provedor | variável de chave | onde pegar | observação |
|---|---|---|---|
| Google Gemini | `GEMINI_API_KEY` | aistudio.google.com/apikey | camada gratuita ampla; costuma ser a melhor primeira escolha |
| Groq | `GROQ_API_KEY` | console.groq.com/keys | inferência muito rápida |
| Cerebras | `CEREBRAS_API_KEY` | cloud.cerebras.ai | inferência muito rápida |
| Mistral | `MISTRAL_API_KEY` | console.mistral.ai | modelos europeus |
| OpenRouter | `OPENROUTER_API_KEY` | openrouter.ai/keys | use modelos com sufixo `:free` |
| Ollama | — | ollama.com (auto-hospedado) | roda no servidor, **sem chave** |

Cada um precisa também da variável de modelo (`ATLAS_GEMINI_MODEL`,
`ATLAS_GROQ_MODEL`, …). Sem o modelo o provedor fica fora da ordem de
roteamento — de propósito: escolher modelo por padrão silencioso é a forma mais
fácil de mudar o comportamento da IA sem ninguém decidir.

---

## Como ligar

1. Pegue a chave em um dos endereços acima (nenhum exige cartão).
2. Ponha no `.env` do servidor:

```bash
GEMINI_API_KEY=...
ATLAS_GEMINI_MODEL=gemini-2.0-flash
```

3. Coloque o provedor na ordem do tier que quiser atender:

```bash
ATLAS_AI_FAST_PROVIDER_ORDER=gemini,groq,local
ATLAS_AI_COMMERCIAL_PROVIDER_ORDER=gemini,openai,local
```

4. Confirme com chamada real:

```bash
npm run integrations:health
```

O teste é **geração**, não listagem de modelos. Foi listando modelos que a OpenAI
passou por saudável enquanto estava sem saldo: chave válida, nenhuma geração
possível. Aqui só conta se voltou texto.

---

## Três coisas que valem entender antes de confiar

**"Gratuito" não é "ilimitado".** É custo zero até o teto do provedor — e o teto
é deles, não nosso. Quando estoura, a chamada falha como qualquer outra e o
roteador passa para o próximo da ordem. Por isso vale ter **dois** configurados,
não um.

**Custo zero continua sendo custo medido.** O uso é registrado com valor zero, e
não como "sem tarifa". Zero conhecido é diferente de preço ausente — a diferença
aparece no painel do diretor, que separa `measuredCostUsd` de
`callsWithoutPricing`.

**Dado pessoal continua bloqueado.** O guard que impede enviar dado pessoal a
provedor de economia vale igual aqui. A única exceção é o **Ollama**: como roda
na sua máquina, nada sai dela — é o único da lista que pode receber dado pessoal
sem contrato com terceiro.

---

## Qualidade: o que esperar

Para as tarefas do tier `fast` — classificar, resumir, extrair, priorizar — os
modelos gratuitos de hoje entregam resultado equivalente ao de um modelo pago
pequeno. Para redação comercial que vai ao cliente e para raciocínio longo, a
diferença aparece.

Recomendação honesta: use a camada gratuita para **destravar a operação agora** e
para tudo que é interno. Quando o saldo pago voltar, mantenha os gratuitos como
**fallback** na ordem — assim uma quota estourada ou uma chave vencida deixa de
ser parada de produção.
