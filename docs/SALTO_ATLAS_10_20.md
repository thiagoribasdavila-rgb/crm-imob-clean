# SALTO ATLAS 10/20 — o organismo que opera o negócio

> 10/10 é um produto excelente. **10/20 é quando o Atlas deixa de ser uma
> ferramenta que o time usa e vira um organismo que opera o funil inteiro —
> sob supervisão humana, mas sem depender de ninguém lembrar de nada.**
>
> Base: auditoria adversarial de 2026-07-21 (8 dimensões, nota geral 6,3/10;
> plano 10/10 em execução em paralelo). O 10/20 não espera o 10/10 terminar —
> as fundações críticas (leads honestos, migrations, verificação verde) andam
> junto com as peças do salto.

## Os 5 pilares

### 1. Ciclo fechado: da fadiga ao anúncio novo sem mão humana no meio (só no fim)
Hoje: a IA detecta fadiga → propõe → humano aprova → **e aí alguém executa na mão**.
10/20: aprovou → o **executor governado** cria campanha/criativo na Meta via API
(nascendo PAUSED, idempotente, auditado, dry-run por padrão). Ativar continua
sendo clique humano — mas é UM clique, não uma tarde de trabalho no Gerenciador.

Peças: `campaign-executor` (planCampaignCreation → executeSteps) +
`creative-rotation` (fadiga detectada → substituto já redigido no ângulo certo).

### 2. A Meta otimiza para quem COMPRA, não para quem clica
Hoje: a campanha otimiza para Lead (formulário preenchido). O algoritmo aprende
a achar preenchedores de formulário.
10/20: o CRM devolve ao CAPI os eventos que importam — **QualifiedLead** (a IA
qualificou), **Schedule** (visita marcada), **Purchase** (venda) — com PII
hasheada. O algoritmo da Meta passa a caçar compradores. Cada venda torna a
próxima campanha mais barata. Este é o flywheel.

Peça: `capi/quality-events` (builders puros; envio pelo outbox governado).

### 3. Nenhuma decisão às cegas: projeção antes da aprovação
Hoje: "Aprovar realocação de R$ 224?" — o diretor confia.
10/20: "Aprovar realocação de R$ 224? **Projeção: +9 a +15 leads/semana**
(suposições listadas, confiança média)." Aprovar vira decisão informada; o
histórico de projeção × realizado calibra o simulador sozinho.

Peça: `decision-simulator` (determinístico, honesto: sem base → 0 com explicação).

### 4. As IAs conversam entre si — um organismo, não 25 módulos
Hoje: 25 módulos de IA excelentes que não se falam.
10/20: a estrategista detecta desperdício → pede criativo novo à creative →
o simulador projeta o impacto → o briefing entrega ao diretor UMA decisão
composta ("pausar X, subir Y no lugar, projeção +12 leads/sem") → aprovada,
o executor faz tudo. A calibração central (`lib/ai/calibration`) já é o
sistema nervoso; o barramento de composição é o próximo órgão.

### 5. Proatividade por hierarquia, no canal de cada um
Corretor: a próxima ação da carteira, de manhã, no WhatsApp (fase adiada pelo
dono, estrutura pronta). Gestor: anomalias e SLA. Diretor: 3 decisões com
projeção. Ninguém abre dashboard para descobrir o que fazer — o Atlas avisa
quem precisa, quando precisa, com o botão de aprovar embutido.

## Sequência

| Onda | Conteúdo | Estado |
|---|---|---|
| **1** | Correções críticas da auditoria (leads honestos, migrations, rate limit IA) + executor + CAPI qualidade + simulador + rotação | **em execução** |
| 2 | Reverdejar a suíte de verificação (66+ checks) + Vitest dos invariantes de governança | planejada |
| 3 | Barramento de composição das IAs + decisões compostas no briefing/Caixa | planejada |
| 4 | Fase 0 (banco) → funil real: CAC por venda, CAPI ligado, atribuição ponta a ponta | depende do deploy |
| 5 | WhatsApp por corretor (autorização do dono) + proatividade por canal | adiada pelo dono |

## Invariantes que NUNCA mudam no caminho
- Nada ativa campanha, envia mensagem ou gasta dinheiro sem clique humano.
- Política Meta (HOUSING) é travada em código — não é calibrável.
- Dado ausente = resposta honesta (503/"sem dados"), nunca número inventado.
- Toda suposição de projeção é explicitada; projeção sem base = 0 com explicação.
- PII nunca em URL, log ou payload cru (CAPI só com hash).
