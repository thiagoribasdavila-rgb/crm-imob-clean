# SALTO ATLAS V5 — de CRM a Sistema Operacional da venda imobiliária

**Estado de partida:** V4.1 (Copiloto que executa) e V4.2 (importador) prontos; V4.7 (campanha Meta autônoma) planejado (`docs/campaigns/PLANO_CAMPANHA_AUTONOMA_V4.7.md`); CC6 completo. O V5 não adiciona telas — **reduz telas e multiplica decisões**.

## A tese
O Atlas acumulou **telas** onde deveria acumular **decisões**. Cinco superfícies (`/leads`, `/customers`, `/tasks`, `/calendar`, `/activity`) leem as mesmas tabelas com lentes redundantes; o marketing vive fora do menu; a IA é um enxame de funções soltas. O V5 vira a chave: **menos navegação, mais decisão** — e a doutrina que amarra tudo é **"Autônomo, sob supervisão": a IA faz o trabalho, o humano aprova, a IA nunca é ponto único de falha.**

---

## As 7 elevações (a ambição)

1. **De "menos telas" para superfície de intenção.** O 5→2 é o começo; o fim é uma camada de comando: você pede ("leads quentes sem toque", "sobe a campanha do Spin Mood", "relatório do incorporador X") e a IA orquestra. As telas viram contextos; a interface real é a conversa + a **Caixa de Aprovações**.
2. **O CRM gera os criativos, não só sobe.** O que fizemos à mão no Spin Mood (book PDF + vídeos 9:16 + copy) vira capacidade nativa: escolhe o empreendimento → a IA monta book, criativos e copy → joga na campanha. O marketing **produz**, não só publica.
3. **Marketing = máquina de crescimento que aprende até a VENDA.** Não para no lead: mede qual criativo/público/copy vira contrato, auto-propõe a próxima campanha e mostra **CAC por venda e ROI por empreendimento**. Autootimizável, sempre gated por aprovação.
4. **A IA como time governado, com chefe de gabinete.** O `commercial-orchestrator` vira o "chief of staff" que roteia o trabalho entre especialistas. Regra de ouro: **todo agente propõe, o humano é o CEO que aprova.**
5. **Cockpit do incorporador (B2B2C).** O "relatório por incorporador" é a ponta: cada incorporadora vira um **tenant** — portfólio, estoque, performance e P&L. O Atlas deixa de ser "imobiliária com CRM" e vira a **plataforma** que vende para vários incorporadores.
6. **North-star: tempo do sinal à ação.** Uma métrica rege tudo: **<30s do sinal → ação aprovada → executada** e **<5min do lead → 1º contato**. Cascata, copiloto e CAPI servem a isso.
7. **CC8 = ambiente, não telas.** Design que se adapta ao contexto (briefing de manhã, execução, fechamento), IA presente mas quieta, dados **glanceáveis em 3 segundos**, um acento só, profundidade com significado.

---

## Nova arquitetura de informação (ANTES → DEPOIS)

| ANTES (5 telas) | DEPOIS (2 eixos + 1 hub) |
|---|---|
| `/leads` + `/customers` | **Tela 1 · Relacionamentos.** `/leads` absorve `/customers` como filtro `relationship` (novo/ativo/won/external/closed). Lista à esquerda (`StatusBadge`, sinal de parado, transferência em lote), **360 à direita** via `leads/[id]/page.tsx`. `/customers` → **308** para `/leads?relationship=active`. |
| `/tasks` + `/calendar` + `/activity` | **Tela 2 · Trabalho.** `/tasks` como superfície única: coluna **"Agora"** (`/api/v1/productivity/daily`) + rail **"Agenda"** (`/api/v1/calendar`, hoje→+7d) + faixa **"Histórico"** (`/api/v1/activity`) abaixo do fold. |
| `app/(crm)/marketing` (fora do menu) | **Hub de Marketing** promovido em `lib/atlas/navigation.ts` (`accessRoles:["director"]`): **Criar · Monitorar · Relatório diário · Relatório por incorporador**. |

Os colapsos são legítimos porque **os dados já são compartilhados** — Customers sempre foi um segmento saturado de Leads; as três telas de trabalho leem `tasks`/`lead_visits`/`leads`. Não removemos capacidade — removemos duplicação de `StatusBadge`, filas de prioridade e heróis `TiltShell`.

---

## Org chart da IA

**Plano de controle único:** `provider-router.ts` (`generateAIText`) + `commercial-orchestrator.ts` (`planCommercialAI`) — impõem classe de dado, `humanReviewRequired`, `externalActionAllowed:false` e fallback `local`. Todo agente herda esse contrato.

- **Copiloto-de-execução (V4.1)** — agente de linha nas Telas 1 e 2; redige rascunhos, next-action, briefing; prioriza via `conversion-predictor`. **Só sugere.**
- **Nightly** (`governed-nightly-copilot.ts`) — turno 22h–07h SP, `draft_only`, teto `qualification`; entrega `morningHandoff` por lead para o V4.1 assumir de manhã.
- **Monitor-Andromeda** (vivo) — `campaign-intelligence` ranqueia, `andromeda-learning-loop` mede readiness, `andromeda-pipeline-advisor` recomenda scale/adjust/pause. **Observa, nunca escreve.**
- **Criador-de-campanha** (novo, V4.7) — o único com write-adapter Meta Marketing API; recebe a recomendação do Monitor e **não executa — emite proposta**.
- **Gerador-de-criativos** (novo, elevação #2) — monta book/vídeo/copy por empreendimento e entrega ao Criador.
- **Relator-diário** (novo) — cron reusando `campaign-analyst` (`buildAnalystNarrative`), consolida `director-daily` + `broker-daily` às 07h SP no command-center.
- **Relator-por-incorporador** (novo) — mesmo `campaign-analyst` particionado por `developer_id`.

**Caixa de Aprovações — o portão único.** Toda ação de efeito externo vira item na caixa, não side-effect. Criar/pausar/budget exige **diretor**; relatórios são auto-publicáveis (PII-zero); Nightly nunca ultrapassa `draft_only`. O gate de amostra (`sampleSufficient`, `CAMPAIGN_QUALITY_MINIMUM_LEADS`) barra recomendação sem lastro. O núcleo preditivo (`conversion-predictor`, cascata, tabela `conversions`) é serviço compartilhado, fechando **campanha → lead → conversão → campanha**.

---

## CC8 em 5 princípios
1. **Densidade instrumental** — grade 4px + `cc8-density-compact` opcional na `cc6-panel` (leitura tipo Bloomberg, sem perder hairline).
2. **Números como voz** — mono `tabular-nums`, escala ótica `cc8-display` nos heróis; hierarquia por peso, não cor.
3. **Profundidade por geometria** — unificar `cc5-*` + tilt na `TiltShell`; `cc8-lift` por sombra-hairline (zero glow), gates duplos (`pointer:fine` + reduced-motion).
4. **Costura de IA** — `cc8-ai-seam` (1px animado no acento) marca origem-IA sem ícone brega; `cc8-draft` (tracejado) diferencia `draft_only`/`humanReviewRequired` de fato humano.
5. **Migração aditiva** — camada `.cc8-*` **após** o bloco CC6 em `globals.css`; passo 1 tokeniza hexes literais (`#0f1830`, semânticos) → destrava white-label; opt-in por tela, CC6 nunca quebra.

---

## Sequência de ondas
- **Onda 0 · Tokens (habilitador).** Tokenizar hexes em `globals.css` + unificar `TiltShell`. Destrava CC8 e white-label. Baixo risco.
- **Onda 1 · Tela 1 (Relacionamentos).** Seletor `relationship` em `LeadsPage`, migrar `contextGaps`/`priorities` para o 360, redirect 308 de `/customers`, ajustar nav. Reusa o `Payload` do `[id]` e o `morningHandoff` do Nightly.
- **Onda 2 · Tela 2 (Trabalho).** Colapsar tarefas+agenda+atividades em colunas de tempo. Independente da Onda 1.
- **Onda 3 · Hub de Marketing.** Promover `app/(crm)/marketing`. Reusa Andromeda (Monitorar), a **V4.7** (Criar) e `campaign-analyst` (relatores). Inclui o **gerador de criativos** (elevação #2). **Depende da Caixa (Onda 4)** para publish.
- **Onda 4 · Governança.** Caixa de Aprovações + camada de flags por-agente com **kill-switch** (revoga `externalActionAllowed` do Criador e congela cron dos relatores sem redeploy). Habilita o write-adapter Meta com segurança.
- **Onda 5+ · Elevações de plataforma.** Cockpit do incorporador (B2B2C multi-tenant), CAC-por-venda/ROI, e a superfície de intenção (comando por linguagem).

---

## Guardrails e o que é do dono
- **Do dono, sempre:** publicar campanha, mudar budget, pausar (`admin`/`director`). A IA entrega proposta; o diretor confirma.
- **Nunca autônomo:** Nightly travado em `draft_only`; Andromeda observa e nunca escreve; Criador só propõe.
- **Sem lastro, sem recomendação:** gate `sampleSufficient`.
- **Zero PII em URL**; relatórios PII-zero por construção.
- **Kill-switch** desliga qualquer agente sem redeploy — a IA nunca é ponto único de falha.

## Riscos honestos
- **Colapso de telas apaga muscle-memory** dos corretores → mitigar com redirects + mesma casca visual.
- **Write-adapter Meta é superfície nova e perigosa** → só depois da Caixa + kill-switch (Onda 4).
- **Governança hoje é in-code** (flags não são lidas): a camada de flags é pré-requisito real, não polimento.
- **Cron dos relatores** cria carga às 07h SP → precisa de fallback silencioso.
- **CC8 big-bang quebraria o CC6** → disciplina aditiva e opt-in por tela é inegociável.

Âncoras: `app/(crm)/leads`, `app/(crm)/marketing`, `lib/atlas/navigation.ts`, `lib/ai/provider-router.ts`, `lib/ai/commercial-orchestrator.ts`, `lib/ai/governed-nightly-copilot.ts`, `lib/meta/andromeda-learning-loop.ts`, `lib/ai/campaign-analyst.ts`, `app/globals.css`.
