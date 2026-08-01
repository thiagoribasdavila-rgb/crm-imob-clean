# Fase 3 — Custos

> Regra permanente do dono, que este documento obedece literalmente:
> **"Não inventar preços, métricas ou informações comerciais."**
>
> **Nenhum preço de fornecedor aparece aqui.** Onde o preço não foi medido nem
> lido de fatura, está escrito **"custo a confirmar com o fornecedor"** — nunca
> um número plausível. Um número plausível num documento de custo é a forma mais
> cara de mentira, porque alguém decide com ele.

Medido em `pozbrcsfthnhmnebfoxv`, **2026-07-30 05:04 UTC**.

---

## 1. O custo de hoje

| Linha | Serviço | Estado medido |
|---|---|---|
| Banco | Supabase | plano **`free`** (confirmado na API da organização) → **R$ 0/mês** |
| Armazenamento | Supabase | dentro do plano free → **R$ 0/mês** |
| IA | provedores de LLM | **US$ 0,011459** medidos em 4 dias (26–29/07) |
| Mapas | nenhum | PostGIS local, sem serviço → **R$ 0/mês** |
| Mensagens | WhatsApp | **não medido** — fora do sistema |
| Hospedagem | Hostinger | **não medido** — fora do sistema |
| Domínio | registrador | **não medido** — fora do sistema |

**Cobertura da medição: 4 de 7 linhas declaradas.** As três linhas "fora do
sistema" só existem em fatura, e-mail ou painel do fornecedor — o banco jamais
vai conhecê-las. Estão declaradas em `lib/finops/catalogo-de-custo.ts` justamente
para que a soma **não pareça completa**.

### O ponto cego dentro da linha que É medida

```
43 chamadas de IA registradas em ai_usage_events (26–29/07)
22 fallback local ................. custo zero REAL
21 cobráveis ...................... todas Perplexity/sonar
 6 das 21 (28,6%) .................. estimated_cost_usd NULO
US$ 0,011459 ....................... total efetivamente medido
```

**28,6% das chamadas cobráveis não têm custo medido.** Por isso o teto de gasto
foi instalado em **chamadas e tokens**, não em reais: um teto em dinheiro seria
cego justamente para o pedaço não precificado, e passaria somando zero.

**Nenhuma chamada OpenAI, nenhuma Anthropic.** As três chaves existem no
ambiente, mas só Perplexity respondeu no período. Chave presente não é crédito
disponível.

---

## 2. Não existe "custo mensal"

Não porque ninguém mediu, mas porque **não existe mês de operação**: 4 dias de
tráfego de teste, 9 leads atendidos de 483, nada publicado. Uma extrapolação de
4 dias para 30 seria invenção com aparência de projeção — e a base oscilou
483→501→483 na mesma hora.

**Custo por lead atendido:** não calculável de forma útil. O numerador cobre 4 de
7 linhas; o denominador é 9 leads, e "atendido" muda de valor entre leituras.
Publicar `US$ 0,011459 ÷ 9` daria um número — e o número seria lixo.

---

## 3. O custo das fundações entregues hoje: R$ 0,00

As três frentes desta rodada não criaram nenhuma linha de custo nova.

| Frente | Por que custa zero | Como desligar |
|---|---|---|
| Grafo em PostgreSQL | 3 views + 9 funções no banco que já pagamos. **Zero tabela nova, zero extensão, zero cópia de dado** | `drop view` / `drop function` — rollback escrito, nenhum dado perdido |
| Gêmeo digital | aritmética determinística. Sem I/O, sem relógio, sem LLM. 4 consultas de contagem | remover a rota; o módulo puro fica inerte |
| Previsão governada | módulos puros + tabela `ai_projection_ledger` que **já existia** desde 20260722160000 | marcar `ativo:false` no registro — sem deploy de inferência |

**A proibição é executável, não uma promessa.** O contrato do grafo roda
`assert.doesNotMatch(sql, /create\s+table/i)` e `/create\s+extension/i` sobre a
migration com comentários removidos. Se alguém tentar acrescentar tabela ou
extensão, o contrato fica vermelho.

Escritas novas em produção: **1 INSERT por proposta de campanha** decidida (o
ledger). Cresce no ritmo das decisões da liderança, não do tráfego. Hoje: 0 linhas.

---

## 4. As dez tecnologias da Fase 3

Para cada uma: **finalidade · o que resolveria · o que exige de DADO · custo**.

O padrão que se repete: **em 9 das 10, o bloqueio é dado, não dinheiro.**
Contratar antes de coletar compra mensalidade para alimentar um insumo vazio.

---

### 1. Data warehouse
- **Finalidade:** servir análise histórica sem pesar no transacional.
- **Resolveria:** consulta longa e agregação por período sem competir com a
  operação.
- **Exige de dado:** volume que justifique separar. Hoje: **483 leads, 137
  movimentações, 185 tabelas**. Um `select` sobre isso não pesa.
- **Custo:** **a confirmar com o fornecedor.** Não solicitar agora — o dono
  escreveu: *"não contratar data warehouse antes de existir volume"*.
- **Veredito:** **postergar.** Reavaliar quando uma consulta analítica medida
  degradar a operação medida. Nenhuma das duas medições existe hoje.

### 2. AVM — avaliação automatizada de imóvel
- **Finalidade:** estimar valor de imóvel sem laudo manual.
- **Resolveria:** precificação de oferta e aderência de orçamento do lead.
- **Exige de dado:** **preço.** Medido: `empreendimento→preço` **0 de 4**;
  `tipologia→preço` **0 de 6**; `lead→orçamento` **9 de 483**; renda, entrada e
  FGTS **0 de 483**. Um AVM precisa de preço nos **dois** lados e não tem em
  nenhum.
- **Custo:** **a confirmar com o fornecedor** (serviço externo) ou R$ 0 se
  construído sobre histórico próprio — que **não existe**: 0 vendas apuradas.
- **Veredito:** **bloqueado por dado.** Sem preço, um AVM devolveria número
  inventado com selo de modelo.

### 3. Banco de grafos separado
- **Finalidade:** percorrer relações de muitos saltos.
- **Resolveria:** perguntas de vizinhança e caminho entre lead, imóvel, campanha
  e corretor.
- **Exige de dado:** arestas povoadas. Medido no censo: `lead→corretor` 97,3%,
  mas `lead→bairro desejado` **1,2%**, `lead→valor de venda` **0%**,
  `empreendimento→unidade` **0**. O grafo é **esparso**, não complexo.
- **Custo:** **a confirmar com o fornecedor** — e **proibido nesta rodada**.
- **Veredito:** **já resolvido em relações.** As 3 views + 9 funções entregues
  hoje respondem 2 das 7 perguntas do dono e recusam as outras 5 **por falta de
  dado, não por falta de motor**. Um banco de grafos recusaria as mesmas 5,
  cobrando mensalidade.

### 4. Digital twin de empreendimento
- **Finalidade:** réplica do empreendimento para simular estoque e absorção.
- **Resolveria:** "quanto deste lançamento eu vendo, em que ritmo".
- **Exige de dado:** **unidades.** Medido: `units` 0 + `inventory_units` 0 +
  `properties` 0 = **zero linhas**. `units_available` nulo nas 6 tipologias.
  E taxa de absorção exige venda: **0 apuradas**.
- **Custo:** R$ 0 se construído como as fundações de hoje (aritmética sobre o
  Postgres). Ferramenta de terceiro: **a confirmar com o fornecedor**.
- **Veredito:** **bloqueado por dado.** O gêmeo da **operação** já existe e custa
  zero; o gêmeo do **empreendimento** não tem insumo.

### 5. Tours 360º
- **Finalidade:** visita remota.
- **Resolveria:** qualificação antes da visita física.
- **Exige de dado:** mídia por unidade — e **acervo com 0 unidades**. Exige
  também a camada `authenticated`, que hoje depende de políticas **permissive**
  em 183 de 185 tabelas (ver `FASE_3_ARQUITETURA.md` §2).
- **Custo:** captura + hospedagem de mídia, **a confirmar com o fornecedor**.
  Armazenamento no plano free tem limite; volume de mídia é a linha mais provável
  de estourar o `free`.
- **Veredito:** **postergar** — e fechar RLS antes de expor mídia a authenticated.

### 6. Computer vision
- **Finalidade:** extrair atributo de foto/planta automaticamente.
- **Resolveria:** cadastro de acervo sem digitação.
- **Exige de dado:** acervo de mídia. **Não existe** (0 unidades).
- **Custo:** **a confirmar com o fornecedor** — e **visão computacional paga está
  proibida nesta rodada**.
- **Veredito:** **sem entrada.** Um extrator sem imagem não tem o que extrair.

### 7. Voice AI
- **Finalidade:** atendimento e qualificação por voz.
- **Resolveria:** primeiro contato em escala — hoje **383 leads abertos com prazo
  de primeiro contato vencido**.
- **Exige de dado:** base legal por pessoa. Medido: `lead_contact_preferences`
  **0 linhas**; `lead_contact_preference_events` **0**. A base legal hoje vem da
  **fonte** (`meta_lead_sources.consent_basis`, 29 linhas, uma única base:
  cláusula de compartilhamento no formulário Meta), **não da pessoa**.
- **Custo:** **a confirmar com o fornecedor** — e **proibido nesta rodada**.
- **Veredito:** **bloqueado por consentimento, antes de dinheiro.**
  **474 leads recuperáveis não são 474 leads contatáveis.** Ligar em escala sem
  consentimento por pessoa é risco jurídico, não oportunidade. E o gargalo medido
  do primeiro contato é **distribuição** (233 leads acima da média numa só carteira), que
  custa R$ 0 para resolver.

### 8. Integrações avançadas
- **Finalidade:** trocar dado com portais, bancos, incorporadoras.
- **Resolveria:** entrada e saída sem digitação.
- **Exige de dado:** que a integração **atual** funcione. Medido: **1 evento
  CAPI, com `delivered_at` nulo e `attempts=0`** — nada saiu de verdade;
  `whatsapp_broker_sessions` **0 linhas**, o que mata a distribuição automática
  (os degraus 1, 2 e 3 de `resolveLeadOwner` exigem WhatsApp conectado, então
  toda lead cai no degrau 4: **represada, sem dono**).
- **Custo:** por integração, **a confirmar com o fornecedor**. Fila: **R$ 0** —
  `pgmq` já está disponível no banco. O dono escreveu: *"não contratar fila
  externa se as filas do banco forem suficientes"*.
- **Veredito:** **consertar o que existe antes de somar.** Uma integração nova
  sobre um CAPI que nunca entregou multiplica o problema.

### 9. App nativo
- **Finalidade:** corretor em campo.
- **Resolveria:** registro de visita e resposta no lugar do atendimento.
- **Exige de dado:** operação viva. Medido: **9 de 12 corretores ativos com
  carteira vazia**, **um único corretor** fez 136 das 137 movimentações, 4 tarefas abertas na
  organização inteira, 1 lead com próxima ação agendada.
- **Custo:** desenvolvimento + contas de loja, **a confirmar com o fornecedor** —
  e **proibido nesta rodada**.
- **Veredito:** **postergar.** App não faz nove pessoas de carteira vazia
  trabalharem; redistribuir faz — e é gratuito. Exige também RLS fechada.

### 10. Arquitetura de escala
- **Finalidade:** aguentar carga maior.
- **Resolveria:** degradação sob volume.
- **Exige de dado:** **medição de carga.** Não existe: 43 chamadas de IA em 4
  dias, 483 leads, nada publicado, zero usuário final. Kafka e Kubernetes estão
  **proibidos nesta rodada**.
- **Custo:** **a confirmar com o fornecedor.**
- **Veredito:** **sem sintoma.** Escalar antes de medir é o que o dono chamou de
  *"adotar infraestrutura complexa por prestígio técnico"*.

---

## 5. Resumo executivo de custo

| | |
|---|---|
| Custo novo desta rodada de fundações | **R$ 0,00** |
| Linhas de custo declaradas | 7 |
| Linhas que o sistema consegue medir | 4 |
| Custo de IA medido (4 dias) | **US$ 0,011459** |
| Fração das chamadas cobráveis sem custo medido | **28,6%** |
| Custo mensal total | **não medido** — não existe mês de operação |
| Tecnologias da Fase 3 a contratar agora | **nenhuma** |
| Tecnologias bloqueadas por DADO, não por dinheiro | **9 de 10** |

**A conclusão de custo é barata e incômoda:** a Fase 3 não está esperando
orçamento. Está esperando **uma venda registrada com valor, o acervo cadastrado,
consentimento por pessoa e alguém abrindo o app.** Nada disso tem preço de
fornecedor.
