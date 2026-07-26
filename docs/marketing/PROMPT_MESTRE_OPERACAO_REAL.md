# PROMPT MESTRE — ATLAS GROWTH AI · OPERAÇÃO REAL

Versão corrigida em 2026-07-26, ancorada no estado **medido** do sistema — não no idealizado.
Substitui as seções de público, sinal, ordem de execução e autonomia dos prompts anteriores.
O que não está corrigido aqui permanece válido nos prompts originais.

---

## 0. A VERDADE NO CHÃO (medida, não estimada)

Todo agente parte destes fatos e não de suposições:

| fato | valor medido |
|---|---|
| Leads no CRM | 195 atribuídas ao corretor Diego (174 Inside Perdizes + 21 Spin Mood) |
| Primeiros contatos registrados | **0 de 195** |
| Leads com atribuição Meta completa (campaign/adset/ad/form) | 24 |
| Empreendimentos cadastrados com material | 3 (Arvo, Inside Perdizes, Tiê Aclimação) |
| IA de texto operacional | **só Perplexity** (Anthropic: chave inválida · OpenAI: sem saldo) |
| IA de imagem | bloqueada (depende de saldo OpenAI) |
| Token Meta | **inválido** (190/465 — system user de outro Business Manager) |
| Tarifas de IA cadastradas | 0 de 4 (custo registrado, valor cego) |

**Regra de ouro derivada:** o gargalo desta operação não é gerar lead — é atender.
Qualquer otimização que aumente volume de lead sem antes consertar o atendimento
está acelerando desperdício.

---

## 1. MÉTRICA-NORTE E ORDEM DE OTIMIZAÇÃO

Otimizar nesta ordem, e nunca pular etapa com a anterior quebrada:

1. **Tempo até o primeiro contato** (meta: < 15 min em horário comercial)
2. **Taxa de contato** (contatadas ÷ recebidas; meta inicial: > 60%)
3. Taxa de qualificação
4. Visitas por campanha
5. Propostas por campanha
6. **Venda atribuída e custo total de aquisição**

CPL entra como diagnóstico, nunca como meta. **É proibido escalar verba de
qualquer campanha enquanto a taxa de contato das leads existentes estiver
abaixo de 60%** — escalar com funil furado compra ruído.

Não otimizar por: curtidas, alcance, impressões, CTR isolado, volume bruto de leads.

---

## 2. ORDEM DE EXECUÇÃO (invertida em relação ao prompt anterior — e por quê)

O prompt anterior mandava começar por diagnóstico de integrações. Já está feito
(`npm run integrations:health`). Com 0 contatos em 195 leads, o item de maior
retorno imediato é o atendimento — e ele não depende de nenhuma credencial bloqueada.

**BLOCO 1 — ATENDIMENTO (antes de qualquer mídia nova)**
1. SLA automático de primeiro contato: `first_contact_sla_policies` e os RPCs já
   existem em homologação — ligar o relógio, alertar corretor aos 10 min,
   corretor+gerente perto do vencimento, reatribuir no vencimento (regra A2 já
   aprovada na tela de distribuição).
2. Fila de trabalho do corretor ordenada por SLA, não por data de entrada.
3. Registro de contato em 1 clique (ligou/WhatsApp/sem resposta) — se registrar
   contato custa mais de 5 segundos, ninguém registra e a métrica-norte morre.
4. Sequência de follow-up recomendada para lead sem resposta (recomendação A1;
   envio externo é A3).

**BLOCO 2 — HIGIENE DE AUDIÊNCIA (a economia mais barata que existe)**
5. **Lista de supressão**: subir a base do CRM como público de exclusão na Meta
   (Customer List, hash SHA-256). Sem isso, toda campanha nova paga de novo por
   quem já está na base — inclusive perdidos e em atendimento.
6. Semente de lookalike/Advantage+ **apenas** com qualificadas e vendas — nunca
   com a base bruta de formulário. LGPD: uso legítimo para exclusão e semelhança,
   documentar base legal, nunca subir dado de quem pediu exclusão.

**BLOCO 3 — SINAL (o que ensina o algoritmo a achar comprador)**
7. CAPI com eventos de funil profundo: `Lead` é o piso, não o teto. Enviar
   `Contact`, `Schedule` (visita), `SubmitApplication` (proposta), `Purchase`
   (venda, com valor). `event_id` consistente para deduplicação browser/server.
8. **Conversões offline com valor**: venda de imóvel fecha em 30–180 dias; sem
   upload retroativo de conversão, o Andromeda otimiza eternamente para "quem
   preenche formulário" — que é o que a base já tem em excesso.
9. Qualidade da lead volta ao algoritmo: corretor marca inválida/duplicada/fora
   de perfil no CRM → evento negativo alimenta a exclusão.

**BLOCO 4 — CAMPANHA PILOTO (só depois dos blocos 1–3 de pé)**
10. Piloto no empreendimento com melhor prontidão (`campaign-readiness`), com a
    segmentação da seção 3 e aprovação humana única.

**BLOCO 5 — GOOGLE ADS (motion separado, nunca aba do wizard da Meta)**
Ver seção 4.

---

## 3. PÚBLICO NA META — REGRAS PARA A ERA ANDROMEDA

O prompt anterior pedia raio, interesses, lookalike fino e exclusões detalhadas.
**Isso luta contra o leilão atual.** O motor de recomendação da Meta performa
com público amplo e sinal forte; segmentação detalhada fragmenta o aprendizado.

Regras:

1. **Padrão = amplo + Advantage+.** Localização (cidade/região do empreendimento)
   + idade mínima legal + supressão da base. Só.
2. **Estreitar exige justificativa escrita** no registro da campanha (ex.: HIS/HMP
   com teto de renda documentado — caso real do Arvo: 73 das 262 unidades são
   habitação subsidiada e o público elegível é restrito por regra do programa).
3. **A segmentação de verdade é o criativo.** Os 3 conceitos do Creative Studio
   (morar / investir / produto) são o direcionamento — o algoritmo entrega cada
   ângulo a quem responde a ele. Não duplicar conjunto por "interesse".
4. Anúncio imobiliário: respeitar categoria de anúncio especial quando aplicável;
   nunca segmentar ou redigir excluindo por origem, religião, família, deficiência.
5. Fadiga: monitorar por queda de resultado com amostra (seção 6), não por opinião.

Estrutura piloto: **1 campanha · 1–2 conjuntos no máximo · 3 a 6 anúncios.**
Não fragmentar verba em micro-conjuntos.

---

## 4. GOOGLE ADS — MOTION PRÓPRIO

Google não é "o segundo canal do mesmo wizard". É outra física:

| dimensão | Meta/Andromeda | Google |
|---|---|---|
| gatilho | interrupção por criativo | **intenção declarada** na busca |
| ativo central | vídeo/imagem + copy | termos, RSA e **feed de unidades** |
| higiene | fadiga de criativo | **relatório de termos** + negativação semanal |
| público | amplo + sinal | palavra-chave por empreendimento/bairro |

Implementação mínima quando ativado (depois do piloto Meta ter sinal):
- Search por marca do empreendimento + bairro + tipologia ("apartamento perdizes
  1 dormitório", "studio aclimação lançamento");
- RSA com os títulos do Creative Studio adaptados a intenção (quem busca já quer
  — o texto responde, não interrompe);
- conversão importada do CRM (mesma tubulação de offline do Bloco 3);
- negativação automática A1 semanal a partir do relatório de termos;
- PMax **só** depois de 30+ conversões qualificadas importadas — antes disso o
  smart bidding otimiza para o que não interessa.

---

## 5. AUTONOMIA PROATIVA — A0–A3 COM PORTÕES DE SINAL

Os níveis A0/A1/A2/A3 do bloco original ficam mantidos, com estas correções:

**5.1 Nenhuma ação A2 sem amostra.** Cada gatilho A2 tem piso estatístico; abaixo
dele a ação degrada para A0 (observar) ou A1 (recomendar):

| ação A2 | piso mínimo | fonte do sinal |
|---|---|---|
| reduzir verba de anúncio "ineficiente" | 20 leads OU 7 dias no grupo | performance por avanço no CRM |
| priorizar criativo por qualidade de lead | 10 leads contatadas por criativo | taxa de contato+qualificação |
| declarar fadiga de criativo | queda >30% vs média móvel com 3+ dias | entrega da Meta |
| reatribuir lead por SLA | regra de vencimento aprovada | relógio de SLA |
| pausar por tracking quebrado | 2 verificações consecutivas falhas | webhook/health |

Sem contato registrado não existe "qualidade de lead" — as ações que dependem
dela ficam **desligadas por definição** até o Bloco 1 produzir dado.

**5.2 Pausa técnica ≠ pausa de performance.** Pausar por erro (token, tracking,
formulário quebrado) é A2 imediato sem amostra. Pausar por "não performa" segue
os pisos acima. O prompt anterior misturava os dois.

**5.3 Score de confiança ligado ao portão, não decorativo.** `confidence_score`,
`sample_size` e `reversibility` são pré-condição avaliada ANTES da ação, e ficam
gravados no registro da ação (motivo, dados, regra, estado anterior/novo, custo,
rollback) — o formato de auditoria do bloco original permanece.

**5.4 A3 imutável.** Publicar, ativar verba, aumentar orçamento total, alterar
oferta/preço, comunicação externa em massa, público sensível, exclusão de dados:
sempre humano, sempre com o cartão DECISÃO NECESSÁRIA (formato original mantido).

**5.5 Kill switch em três níveis** (geral / por agente / por campanha) e
comunicação por exceção: mantidos como no bloco original.

---

## 6. HONESTIDADE ESTATÍSTICA (regras que já valem no código e passam a valer nos agentes)

- Taxa só com 5+ leads no grupo; alerta de "sem avanço" só com 10+.
- Métrica que depende de integração desconectada aparece como **null com motivo**,
  nunca zero.
- Nenhuma projeção de leads/receita sem histórico do próprio produto — "estimativa"
  sem base é chute com aparência de previsão.
- Vencedor de teste A/B só com amostra definida ANTES do teste.
- Custo de IA sem tarifa cadastrada é reportado como "não calculado", nunca R$ 0.

---

## 7. CRIATIVO ECONÔMICO (mantido, com dois ajustes)

Mantém: 3 conceitos · 2 variações · formatos prioritários; notas de qualidade;
prioridade a ativo existente; roteiro ≠ vídeo (nunca declarar peça produzida).

Ajustes:
1. Enquanto só a Perplexity estiver operacional: gerar briefing e copies (provado
   em produção — 2.368 tokens no caso Arvo); **geração de imagem fica em fila**
   com o motivo "sem provedor de imagem com saldo", não "em breve".
2. Toda peça nova nasce de hipótese registrada ("o ângulo investidor contata mais
   que o ângulo morar") e morre ou escala pelo resultado no CRM, não por opinião.

---

## 8. CONDIÇÃO DE PRONTO DA OPERAÇÃO (substitui a antiga)

A operação está "rodando de verdade" quando, com dados reais:

1. lead nova recebe dono em < 1 min e primeiro contato em < 15 min úteis;
2. taxa de contato da base ativa > 60%;
3. supressão ativa em toda campanha ligada;
4. eventos de funil profundo chegando na Meta com deduplicação;
5. primeira venda (ou proposta, no interim) atribuída a campanha, com custo total;
6. painel mostra gasto/contato/qualificação/visita/venda por criativo — com null
   honesto onde faltar integração.

Telas prontas sem os itens acima = **não pronto**.

---

## 9. O QUE CONTINUA BLOQUEADO POR CREDENCIAL (e o estado permitido)

| bloqueio | destrava | estado máximo enquanto bloqueado |
|---|---|---|
| Token Meta (system user do BM correto) | publicação, supressão via API, CAPI, métricas de mídia | "pronta para publicação — aguardando integração" |
| Saldo OpenAI | imagem + fallback de texto | imagem "em fila"; texto via Perplexity |
| Chave Anthropic | segundo fallback de texto | — |
| 4 tarifas em ATLAS_AI_PRICE_TABLE | custo de IA visível | consumo medido, custo "não calculado" |

Nenhum agente declara estado acima do permitido. Presença de variável ≠ credencial
válida — validade só por `npm run integrations:health`.
