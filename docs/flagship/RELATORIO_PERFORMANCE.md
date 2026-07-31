# RELATÓRIO DE PERFORMANCE — MEDIDO

**2026-07-31.** Estes números foram **medidos**, não estimados.

## CONDIÇÕES DA MEDIÇÃO

| item | valor |
|---|---|
| build | produção (`npm run build` + `npm start`) |
| máquina | Apple M1 · 8 CPUs · 8 GB |
| runtime | Node v26.4.0 · Next 16.2.11 |
| rede | localhost (**sem latência de rede real**) |
| engine | Chromium (navegador embutido) |
| banco | Supabase remoto, dados reais (482 leads) |
| método | `PerformanceObserver` com `buffered: true`, janela de 4,2 s após a navegação |
| repetições | **1 por rota** — ver ressalva ao final |

## RESULTADOS

| rota | LCP | meta | FCP | CLS | meta | TTFB | req | JS |
|---|---:|:---:|---:|---:|:---:|---:|---:|---:|
| `/command-center` | **2.712 ms** | ❌ | 2.712 ms | **0,013** | ✅ | 1.440 ms | 61 | 1.372 KB |
| `/leads` | **3.472 ms** | ❌ | 688 ms | **0,038** | ✅ | 534 ms | 68 | 56 KB |
| `/pipeline` | **4.080 ms** | ❌ | 280 ms | **0,012** | ✅ | 146 ms | 61 | 58 KB |

**INP: não medido** — exige interação sintética repetida; o coletor registrou 0
eventos acima de 16 ms porque nenhuma interação foi disparada. Publicar "INP 0 ms"
seria mentir por omissão.

## O DIAGNÓSTICO, QUE OS NÚMEROS ENTREGAM SOZINHOS

Compare FCP com LCP em `/pipeline`: **280 ms contra 4.080 ms**.

> **A casca é rápida. O dado é lento.** O maior elemento da tela é sempre o
> conteúdo vindo da API, e ele chega segundos depois da estrutura.

Isso muda completamente o que se deve corrigir. **Não é peso de JavaScript** —
`/pipeline` baixou 58 KB. É **o dado chegando tarde**, e o LCP marca o momento
em que ele aparece.

As três rotas reprovam em LCP e **as três passam com folga em CLS** (0,012 a
0,038 contra a meta de 0,1): quando o conteúdo chega, ele não empurra o layout.
A estrutura reservada está correta.

`/command-center` é o caso diferente: TTFB de **1.440 ms** e 1.372 KB de JS. Ali
o servidor demora a responder E o pacote é grande — é a única rota onde os dois
problemas coexistem.

## O QUE CORRIGIR, EM ORDEM

| # | ação | rota | por quê |
|---|---|---|---|
| P-01 | streaming com `<Suspense>` por bloco de dado | pipeline, leads | o LCP passa a ser um esqueleto real, e o dado preenche sem bloquear |
| P-02 | reduzir o TTFB de 1.440 ms | command-center | é metade do LCP dessa rota, e é servidor |
| P-03 | `dynamic()` nos blocos pesados | command-center | 1.372 KB contra 58 KB das outras |
| P-04 | repetir a medição 3× por rota e usar a mediana | todas | uma amostra não distingue tendência de acaso |

## RESSALVA HONESTA

**Uma repetição por rota.** A medição correta usa a mediana de três, e a
diferença entre 2.712 e 2.500 ms cabe dentro da variação de uma execução só.
O que **não** cabe na variação é `/pipeline` a 4.080 ms — esse é folgadamente
reprovado em qualquer repetição.

**Localhost não tem latência de rede.** Em produção, com o servidor na Hostinger
e o banco no Supabase, **todos estes números serão piores**. Nenhum deles é
otimista.
