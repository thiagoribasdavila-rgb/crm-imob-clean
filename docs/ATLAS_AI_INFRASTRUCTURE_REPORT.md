# Atlas V3 — AI Infrastructure Report

Data da auditoria: 17/07/2026  
Ambiente auditado: configuração local de homologação, sem exposição de segredos.

## Resultado executivo

O Atlas distingue quatro estados: **não configurado**, **configurado**, **validado** e **operacional**. A presença de uma variável de ambiente não aprova uma integração.

| Integração | Credencial detectada | Teste real | Estado atual | Uso permitido |
| --- | --- | --- | --- | --- |
| OpenAI | Sim | HTTP 429 | Aguardando regularização de quota/limite | Fallback local; não declarar agente generativo ativo |
| Perplexity Sonar | Sim | Aprovado, 1.501 ms, 12 tokens | Operacional para pesquisa sem dados pessoais | Pesquisa de mercado com fontes |
| DeepSeek | Não | Não executado | Opcional, não configurado | Nenhum |
| Qwen | Não | Não executado | Opcional, não configurado | Nenhum |
| Kimi | Não | Não executado | Opcional, não configurado | Nenhum |
| GLM | Não | Não executado | Opcional, não configurado | Nenhum |
| Meta Ads | Parcial | Não homologado ponta a ponta | Preparado | Leitura somente após teste registrado |
| Meta Conversions | Não | Não executado | Bloqueado por credencial ausente | Nenhum envio |
| WhatsApp Cloud API | Não | Não executado | Bloqueado por credencial ausente | Nenhum disparo |

Nenhuma chave, prefixo ou fragmento foi gravado neste relatório.

## Arquitetura validada

- chamadas de provedores executadas somente no servidor;
- OpenAI usa Responses API com `store: false`;
- Perplexity usa o endpoint oficial de Chat Completions e bloqueia contexto com dados pessoais;
- rota local determinística mantém o CRM utilizável quando o provedor falha;
- tokens, latência e custo estimado são registrados em `ai_usage_events` quando a chamada passa pelo Atlas;
- decisões de roteamento são registradas sem armazenar prompts ou respostas brutas;
- ações externas automáticas permanecem bloqueadas;
- memória comercial é estruturada, exclusiva por lead e com retenção controlada.

## Pendências de ativação

1. Regularizar quota/rate limit da conta OpenAI e repetir o teste real no AI Health Center.
2. Preencher preços vigentes por milhão de tokens antes de aprovar a medição financeira.
3. Homologar Meta Ads com leitura real e Meta Conversions com evento de teste.
4. Configurar WhatsApp Cloud API e aprovar templates antes de qualquer ativação.
5. Executar aceite autenticado com Senna e Diego; a preparação de RBAC não substitui o teste de usuário.

## Regra de promoção

Um provedor só aparece como **operacional** depois de uma chamada bem-sucedida registrada. Um agente generativo só aparece como **supervisionado** quando existe provedor generativo operacional. Agentes determinísticos de gestão podem operar localmente, sem alegar geração preditiva externa.
