# SCORECARD FINAL — ATLAS ONE

**2026-07-31.** Nota de 0 a 100 por categoria. **Nenhuma nota foi arredondada
para cima.** Cada uma traz a evidência que a sustenta e o que falta para subir.

> **A regra de aprovação, que eu não me dou o direito de flexibilizar:**
> nenhuma categoria crítica abaixo de 90 · média acima de 95 · nenhum erro
> crítico ou alto aberto · nenhuma funcionalidade principal simulada · nenhuma
> tela antiga desconectada · fluxos principais provados ponta a ponta.

## VEREDITO

# 🔴 REPROVADO PARA A RÉGUA FLAGSHIP

**Média geral: 71,3.** Quatro categorias abaixo de 90, das quais **três são
críticas**. Quatro bloqueadores abertos, todos externos.

Isto **não** diz que o produto é ruim — a régua pedida é a de um SaaS premium em
lançamento comercial, e ela é dura de propósito. Diz que ele **não está nela
hoje**, e nomeia exatamente o que falta.

## NOTAS

| # | categoria | nota | crítica? | evidência |
|---|---|---:|:--:|---|
| 1 | Identidade visual | **82** | | tokens `--atlas-*` existem e são usados 271×; **1.359 cores cravadas** em 80 de 289 arquivos convivem |
| 2 | Consistência | **74** | ✔ | nenhum componente duplicado (0 modais/loaders concorrentes) — mas 304 `style={{}}`, 23 svg inline, 4 arquivos com lucide |
| 3 | Clareza | **93** | | 0 stack trace exposto, 0 `catch {}`, 97 textos de estado vazio distintos, mensagens com número + denominador + consequência |
| 4 | Usabilidade | **85** | | filtros persistem, ações em lote existem, URL hidrata a lista; **não existe modo de densidade** nem atalhos de teclado medidos |
| 5 | Velocidade operacional | **not measured → 60** | ✔ | **nenhum fluxo foi cronometrado**. Nota reflete a ausência de medição, não uma lentidão observada |
| 6 | Responsividade | **70** | | layout responsivo existe; **não houve verificação em viewport móvel nesta rodada** |
| 7 | Acessibilidade | **80** | | 786 `aria-*`, 96 `focus-visible`, 0 `<img>` sem `alt`; `prefers-reduced-motion` em só 5 arquivos; **sem auditoria de contraste** |
| 8 | Performance | **58** | ✔ | build limpo, mas **0** `dynamic(import)`, **1** `loading.tsx` para 198 páginas, **0** `not-found.tsx`, LCP/INP/CLS **não medidos** |
| 9 | Tratamento de erros | **90** | | 0 stack trace, 0 `catch {}`, mensagens declaram o que preservou; **1** `error.tsx` para 198 páginas |
| 10 | Qualidade dos dados exibidos | **96** | ✔ | o produto **recusa** CPL sem base, recusa taxa com 1 venda, recusa acurácia com <2 desfechos, declara truncamento de amostra |
| 11 | Maturidade dos fluxos | **72** | | ingestão Meta nunca entregou lead pelo caminho vivo; ciclo CAPI com 1 evento em modo teste |
| 12 | Estabilidade | **88** | | 1.191 contratos, 0 falhas, 220/220 portões; **9 pulados** e nenhum teste de carga |
| 13 | Segurança | **94** | ✔ | 0 credenciais em 2.577 arquivos, 19 workers com segredo e falha fechada, RLS nas tabelas novas, escalação de privilégio corrigida e reprovada por ataque real |
| 14 | Documentação | **92** | | fonte única de números, registro de 7 falsos positivos, log de 16 decisões, runbooks; ainda há documentos antigos não reconciliados |
| 15 | Instalação limpa | **86** | ✔ | `npm ci` + `tsc` + `build` **exit 0** no pacote extraído; a suíte **falhou** na primeira tentativa e foi corrigida; login e jornada **não provados** no pacote |

**Média: 71,3** · **Categorias críticas abaixo de 90: 4** (consistência 74,
velocidade 60, performance 58, e a média puxada por elas)

## POR QUE NÃO INFLEI A NOTA

Três categorias receberam nota baixa por **ausência de medição**, não por defeito
observado — velocidade operacional (60), performance (58) e responsividade (70).

Seria fácil dar 90 a cada uma alegando que "não há problema conhecido". Mas
**não haver medição não é o mesmo que não haver problema** — é exatamente a
confusão que este projeto passou o mês corrigindo. Um scorecard que premia o não
medido ensina a não medir.

## O QUE FALTA PARA APROVAR — em ordem

| # | ação | destrava |
|---|---|---|
| 1 | publicar o build e instalar o crontab | B-01, B-02, e a maturidade dos fluxos |
| 2 | instrumentar LCP/INP/CLS em 5 rotas contra `npm start` | performance 58 → medida |
| 3 | cronometrar os 10 fluxos de `RELATORIO_DE_REDUCAO_DE_CLIQUES.md` | velocidade 60 → medida |
| 4 | `dynamic()` + `loading.tsx` + `not-found.tsx` nas rotas principais | performance |
| 5 | migrar as 1.359 cores cravadas em lotes, com prova em tela | consistência 74 → 90+ |
| 6 | verificação em viewport móvel real | responsividade |
| 7 | descobrir a conta de anúncios correta | B-03, e o ciclo comercial inteiro |

**Estimativa honesta:** os itens 1–4 são dias. O item 5 é semanas. O item 7 não
depende de código.

---

# RECÁLCULO — 2026-07-31, DEPOIS DAS MEDIÇÕES REAIS

O scorecard acima foi produzido **antes** de medir performance, responsividade e
acessibilidade. Três categorias tinham nota baixa por ausência de medição. Agora
elas têm nota baixa **por medição** — e uma delas piorou.

| # | categoria | antes | agora | o que mudou |
|---|---|---:|---:|---|
| 1 | Identidade visual | 82 | **82** | sem mudança: as 1.359 cores cravadas continuam |
| 2 | Consistência | 74 | **76** | rota `mtching` corrigida com redirect; 5 referências alinhadas |
| 3 | Clareza | 93 | **95** | `not-found.tsx` e `global-error.tsx` em português, com o que fazer |
| 4 | Usabilidade | 85 | **85** | sem mudança |
| 5 | Velocidade operacional | 60 | **62** | ainda não cronometrada; sobe só pelo FCP medido (280–688 ms) |
| 6 | Responsividade | 70 | **78** | **medida**: 0 overflow em 3 viewports — mas só 3 de 8, e 1 engine de 3 |
| 7 | Acessibilidade | 80 | **72** | **piorou com a medição**: 104 alvos < 24 px reprovam WCAG 2.5.8 |
| 8 | Performance | 58 | **55** | **piorou com a medição**: LCP 2.712 / 3.472 / **4.080 ms** — as 3 rotas reprovam |
| 9 | Tratamento de erros | 90 | **94** | anteparo de raiz criado; tela branca deixa de ser possível |
| 10 | Qualidade dos dados | 96 | **96** | sem mudança |
| 11 | Maturidade dos fluxos | 72 | **72** | os 6 fluxos ponta a ponta **não foram testados** nesta rodada |
| 12 | Estabilidade | 88 | **88** | 1.191 contratos, 0 falhas, 220/220 portões |
| 13 | Segurança | 94 | **94** | sem alteração de superfície |
| 14 | Documentação | 92 | **93** | relatórios de performance, responsividade e a11y com números medidos |
| 15 | Instalação limpa | 86 | **90** | pacote provado limpo do zero na 3ª tentativa |
| 16 | Empacotamento | — | **92** | `git archive`: 0 segredos, 0 node_modules, checksum publicado |
| 17 | Prontidão de implantação | — | **40** | **nada publicado**; 4 bloqueadores externos abertos |

## MÉDIA: **78,0** (antes: 71,3)

| | |
|---|---|
| menor nota | **40** — prontidão de implantação |
| categorias abaixo de 90 | **11 de 17** |
| categorias abaixo de 60 | **2** — performance (55), prontidão (40) |

# VEREDITO: 🔴 REPROVADO

A régua exige média acima de 95 e nada abaixo de 90. A média subiu 6,7 pontos e
**continua a 17 pontos do mínimo**.

## O QUE APRENDI MEDINDO

**Duas notas PIORARAM ao serem medidas** — acessibilidade (80 → 72) e performance
(58 → 55). Isso é o comportamento correto de um scorecard honesto: a nota
anterior era um palpite otimista sobre território não explorado.

E a medição entregou o diagnóstico de graça: em `/pipeline`, **FCP 280 ms contra
LCP 4.080 ms**. A casca é rápida, o dado é lento. Não é peso de JavaScript — são
58 KB. É o dado chegando tarde. Sem medir, a aposta óbvia teria sido "reduzir o
bundle", e teria sido a correção errada.
