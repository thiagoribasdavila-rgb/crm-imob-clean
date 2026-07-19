# ATLAS AI OS — Fase 91/3000

## Objetivo

Olhar o repositório inteiro em detalhe e transformar lacunas comprovadas em fases com ordem, impacto comercial e critério de conclusão.

Esta fase não redesenha telas, não altera o Supabase ao vivo e não ativa integrações. Ela impede que a próxima onda apenas repita estruturas desconectadas com uma aparência nova.

## Resultado executivo

O ATLAS possui uma base de produto extensa e várias soluções tecnicamente maduras, especialmente em IA governada, telemetria, health checks e contratos recentes. O principal problema não é ausência de funcionalidades. É a diferença entre a quantidade de superfícies construídas e a quantidade de fluxos consolidados sob os mesmos contratos.

O inventário estático encontrou:

- 271 páginas;
- 142 rotas de API;
- 117 componentes e 109 módulos de biblioteca;
- 122 migrations do Supabase;
- 216 validadores estáticos;
- apenas um `loading.tsx` e um `error.tsx` para toda a superfície;
- nenhum arquivo convencional de teste unitário, integração ou componente;
- 166 pontos de acesso direto a dados;
- 20 itens na navegação canônica, mas apenas 6 contratos de página no Core V2.

Esses números medem o repositório, não o ambiente vivo. Eles não afirmam que uma migration foi aplicada, uma integração está operacional ou um endpoint está inseguro. Onde a evidência é apenas estática, a fase seguinte exige comprovação controlada.

## O que falta, por prioridade

### P0 — antes de ampliar o produto

1. **Superfície canônica:** classificar todas as páginas e retirar placeholders e conceitos experimentais da navegação produtiva, preservando compatibilidade sem exclusão destrutiva.
2. **Verdade do Supabase vivo:** comprovar tabelas, colunas, migrations, grants da Data API, RLS, políticas, perfil, organização e papéis. Migration no Git não prova estado do banco.
3. **Um contexto de acesso:** consolidar os dois sistemas atuais de autenticação/tenant em um contrato único.
4. **Uma camada de dados:** migrar gradualmente consultas diretas para repositórios por domínio, com leituras no contexto do usuário e comandos administrativos com finalidade explícita.
5. **Testes comportamentais:** manter os validadores atuais e adicionar testes que realmente executem login, RBAC, API, persistência e navegador.
6. **Manifesto de APIs:** classificar cada rota como pública, autenticada, privilegiada, worker ou webhook; a heurística identificou 31 rotas que precisam de revisão manual, não 31 falhas confirmadas.

### P1 — fluxo de conversão

- tornar a movimentação do pipeline atômica, idempotente e auditável;
- eliminar o limite operacional silencioso de 500 leads com carregamento por etapa e janela;
- unificar `leads/opportunities`, `crm_projects/developments` e `score/score_ia` por adaptadores versionados;
- completar os contratos Core V2 dos 20 módulos primários;
- criar estados de carregamento, vazio, erro e recuperação por módulo.

### P2 — estrutura visual e velocidade

O redesign deve começar depois da verdade estrutural. Há arquivos críticos muito grandes: o Dock do Copilot possui 2.678 linhas; Lead 360, 2.086; Meta, 1.496; Leads, 1.463; Dashboard, 1.133.

O caminho recomendado é:

- uma camada oficial de tokens semânticos;
- um App Shell;
- componentes operacionais reutilizáveis;
- páginas server-first;
- ilhas cliente pequenas somente para interações;
- densidade, contraste, foco, teclado, mobile e movimento reduzido tratados como parte do produto.

### P3 — IA e Digital Twin

O roteador de IA já suporta OpenAI, Perplexity, DeepSeek, Qwen, Kimi, GLM e fallback local. Também registra tokens, latência, custo estimado e decisão de orquestração. Os testes de provedores distinguem corretamente “configurado” de “validado”.

Ainda faltam:

- certificação de qualidade, custo e latência por tipo de tarefa;
- bloqueio de alegação de economia quando a tabela de preços não está configurada;
- datasets de avaliação e comparação entre sugestão, decisão humana e resultado;
- memória com origem, consentimento, retenção e resultado;
- orçamento duro por organização, perfil, agente e tarefa;
- evidência de que cada modelo está autorizado para a classe de dados usada.

O Digital Twin atual é uma fundação real, mas limitada. O rebuild lê até 200 leads, 200 imóveis e 100 campanhas por organização e grava snapshots versionados com sinais, qualidade e expiração. Para ser decisão operacional, precisa de processamento incremental, cobertura total, watermark, linhagem dos eventos, frescor e confiança. Simulação deve permanecer identificada e nunca alterar o CRM sem aprovação.

### P4 — integrações externas

O catálogo e o Health Center já diferenciam ambiente configurado, cadastro, teste e operação. Isso deve ser preservado.

Faltam testes ponta a ponta, reconciliação e validade de evidência por provedor para Meta, WhatsApp, Google Ads, YouTube, TikTok, calendários e portais. Uma variável na Hostinger não pode promover uma integração para “operacional”.

## Plano corrigido das fases 92–100

| Fase | Entrega | Resultado obrigatório |
| --- | --- | --- |
| 92 | Tokens, primitivos e estados resilientes | Um sistema visual e comportamental reutilizável |
| 93 | Superfície canônica e navegação | Produto operacional separado de placeholders e experimentos |
| 94 | Auditoria do Supabase vivo | Schema, grants, RLS, tenant e compatibilidade comprovados |
| 95 | Contexto único de acesso e repositórios | Uma regra de autenticação, hierarquia e dados |
| 96 | Ledger, outbox e movimentos atômicos | Escritas comerciais idempotentes e auditáveis |
| 97 | Digital Twin V2 | Sinais incrementais com linhagem, cobertura e confiança |
| 98 | Kanban de última geração | Rápido, escalável, acessível, mobile e governado |
| 99 | Jornadas reais e testes comportamentais | Login até venda testado no navegador, API e banco de homologação |
| 100 | Gate único de release | Um build, regressão completa e ZIP Hostinger somente se tudo passar |

## Fases posteriores incluídas

- **101–130:** Lead 360, materiais, estoque, fluxos de pagamento, Copilot, memória, avaliação, reativação e integrações com profundidade operacional.
- **131–200:** atribuição de marketing, calibração preditiva, observabilidade, SLOs, backup, rollback e mobile real.
- **201–500:** profundidade multi-tenant e automações controladas.
- **501–1000:** onboarding e configuração repetíveis, certificação de provedores e escala SaaS.
- **1001–2000:** Digital Twin e simulações apenas sobre dados, linhagem e gates comprovados.
- **2001–3000:** evolução contínua orientada por métricas e mercado, não uma lista antecipada de funcionalidades fictícias.

## Supabase e segurança

O inventário encontrou 123 comandos de ativação de RLS, 169 políticas, 90 grants explícitos e 127 referências a `security definer` nas migrations. Isso exige auditoria do banco vivo e revisão manual das funções privilegiadas, inclusive `search_path`, dono, grants de execução e isolamento por organização.

RLS e grant da Data API são controles separados. A `service_role` permanece exclusiva do servidor e não deve ser enviada ao navegador.

## Impacto operacional

- o corretor recebe um pipeline confiável antes de receber mais telas;
- o gerente passa a comparar dados que usam a mesma definição;
- o diretor vê estados comprovados, e não disponibilidade inferida;
- a IA aprende sobre eventos com origem e resultado;
- o redesign passa a acelerar novas entregas em vez de multiplicar inconsistências;
- a fase 100 pode gerar um pacote Hostinger com um gate objetivo.

## Riscos identificados

- a quantidade de páginas pode esconder deep links ainda usados; por isso a consolidação será por classificação e compatibilidade, não remoção em massa;
- o estado real do Supabase depende de acesso controlado ao ambiente de homologação;
- consolidar autenticação sem testes de papel pode bloquear usuários legítimos;
- o Kanban deve preservar histórico ao trocar o mecanismo de movimento;
- provedores de IA e integrações não podem ser testados sem credenciais e orçamento válidos;
- nenhuma fase planejada conta como evolução concluída.

## Checklist de validação

- [x] inventário estrutural medido;
- [x] limitações da medição declaradas;
- [x] lacunas priorizadas de P0 a P4;
- [x] cada lacuna possui impacto, tratamento, fases e saída;
- [x] IA, Digital Twin e integrações analisados separadamente;
- [x] fases 92–100 reorganizadas;
- [x] build e ZIP mantidos no gate da fase 100;
- [x] nenhum dado, schema ou runtime de produção alterado.

## Próxima etapa recomendada

Fase 92: consolidar tokens, primitivos e estados resilientes do Core V2. Essa entrega deve usar os contratos da fase 90 e o inventário desta fase, sem iniciar uma segunda interface paralela.
