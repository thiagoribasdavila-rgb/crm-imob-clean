# Atlas 2000 — auditoria integral orientada à conversão

## Objetivo de negócio

O Atlas existe para reduzir o intervalo entre a entrada da lead e uma decisão comercial de qualidade. A evolução do produto será medida pelo suporte verificável ao fluxo:

`origem → lead → primeiro contato → qualificação → distribuição → próxima ação → oportunidade → venda → memória → aprendizado de mídia`

IA, automação e interface são meios. O resultado esperado é permitir que cada perfil identifique rapidamente o que precisa decidir, execute com segurança e registre o resultado para o próximo ciclo de aprendizado.

## Inventário estrutural em 18/07/2026

| Área | Arquivos | Papel no produto |
| --- | ---: | --- |
| `app` | 433 | 271 páginas e 140 APIs da operação |
| `components` | 114 | shell, navegação, CRM, IA e design system |
| `lib` | 96 | autenticação, compatibilidade, IA, memória e domínio |
| `config` | 154 | contratos, fases, integrações e release |
| `scripts` | 173 | auditoria, qualidade, homologação e empacotamento |
| `docs` | 170 | evidências técnicas e operacionais |
| `supabase` | 122 | migrations, RLS, RPCs e contratos de dados |
| `prisma` | 1 | compatibilidade de acesso a dados |

A base possui 642 arquivos TypeScript/TSX nas camadas `app`, `components` e `lib`. O volume confirma maturidade funcional, mas também exige disciplina: novas fases devem compactar decisões e reaproveitar contratos existentes, não criar módulos paralelos.

## O que já sustenta conversão

- autenticação, tenant, hierarquia comercial e proteção de rotas;
- Leads, Cliente 360, pipeline, tarefas, agenda e histórico;
- distribuição explicável, responsável único, presença, carga e capacidade;
- projetos, materiais, estoque, VGV e compatibilidade com a base legada;
- oportunidade, forecast, venda ganha e SLA de comissão;
- Copilot imobiliário com contexto governado, fallback local e custo medido;
- memória estruturada exclusiva por lead/corretor, sem salvar conversa bruta;
- reativação com consentimento, template aprovado, API oficial, opt-out e pausa;
- eventos de conversão, campanha, Meta/Andromeda e atribuição preparados;
- build e pacote Hostinger reproduzíveis, sem `.env.local` ou dados de clientes.

## Vazamentos prioritários

### 1. Recursos fortes ainda aparecem como módulos isolados

Reativação, Copilot, equipe, distribuição e vendas possuem dados úteis, mas nem sempre começam por uma fila curta de decisões. A pessoa ainda precisa interpretar muitos cards antes de saber onde agir.

### 2. IA reativa demais

O Copilot responde bem quando é chamado. Ele precisa também apresentar perguntas e planos prontos no ponto da jornada, sempre como sugestão e nunca como contato, transferência, aprovação ou alteração autônoma.

### 3. Gestão de equipe mede volume, não proteção da conversão

A área de corretores mostra hierarquia e tamanho de carteira. Falta evidenciar, sem ranking punitivo, quem precisa de apoio por follow-up vencido, lead quente parado ou ausência de próxima ação.

### 4. Distribuição protege equilíbrio, mas a urgência comercial pode ficar implícita

A fila já é segura e auditável. A liderança precisa ver imediatamente espera mais antiga, capacidade online e risco de SLA antes de confirmar uma distribuição.

### 5. Vendas possui forecast, mas a ação executiva pode ser mais curta

Prazo, valor, probabilidade e comissão existem. Falta uma fila de até três negócios com motivo observável e próxima ação sugerida.

## Estado real das camadas

| Camada | Estado | Observação |
| --- | --- | --- |
| Produto e navegação | Operacional local | Build aprovado; jornadas existentes |
| CRM e compatibilidade | Operacional com fallback | Schema canônico e base legada coexistem |
| IA local e governança | Operacional | Funciona sem provedor externo |
| IA generativa | Condicional | Depende de chave, crédito e teste real por provedor |
| Meta, Andromeda e WhatsApp | Preparado | Ativação exige credenciais, permissões e homologação reais |
| Produção | Bloqueada pelo gate da Fase 020 | Staging reproduzível e teste por perfil ainda precisam de evidência externa |

Nenhuma tela deve transformar “preparado” em “ativo”. Nenhum percentual deve ser apresentado como precisão do modelo sem amostra, resultado e aprovação humana.

## Próximo bloco: fases 043–047

1. **Fase 043 — Reativação orientada à decisão:** priorizar lotes por risco, resposta e elegibilidade sem misturar a base fria com a carteira ativa.
2. **Fase 044 — Copilot proativo e interativo:** oferecer planos contextuais de conversão, com humano no comando e zero execução externa automática.
3. **Fase 045 — Gestão de equipe por proteção da conversão:** mostrar apoio necessário por carteira, SLA e próxima ação, respeitando hierarquia.
4. **Fase 046 — Distribuição por urgência e capacidade:** tornar espera, capacidade online e justificativa visíveis antes da confirmação.
5. **Fase 047 — Vendas orientadas à próxima decisão:** destacar até três oportunidades com risco observável, ação sugerida e comissão rastreável.

## Execução do primeiro bloco

As fases 043 a 047 foram concluídas em 18/07/2026. Cada fase possui contrato próprio em `config`, relatório em `docs` e verificador em `scripts`.

| Fase | Entrega comprovada | Controle preservado |
| ---: | --- | --- |
| 043 | fila curta para governar reativação fria | consentimento, opt-out e nenhum contato autônomo |
| 044 | três playbooks proativos do Copilot | contexto agregado e decisão humana |
| 045 | apoio gerencial por bloqueio de carteira | sem ranking de pessoas ou dados de contato |
| 046 | capacidade, espera e equilíbrio antes da distribuição | responsável único e clique explícito da liderança |
| 047 | confirmações prioritárias de fechamento e comissão | forecast sem promessa e pagamento humano |

Todas passaram individualmente por verificador da fase, TypeScript, lint sem alertas e build otimizado. O programa consolidado `evolution-2000:check` também foi aprovado. A Fase 020 continua bloqueada até existirem as evidências externas de staging; este bloco não transforma preparação em homologação de produção.

## Programa de 2.000 fases

- 100 ondas;
- 20 fases por onda;
- uma fase somente é concluída com registro, teste da fase, TypeScript, lint e build;
- primeiro pacote extraordinário ao concluir a Fase 047;
- pacotes recorrentes nas Fases 100, 200, 300 e assim por diante até 2.000;
- artefatos anteriores são preservados;
- os pacotes nunca incluem chaves, `.env.local`, planilhas, PDFs ou dados de clientes;
- o alvo continua sendo Hostinger com Node.js 20.9+, sem dependência de Vercel.

## Critério de produto

Cada entrega deve responder pelo menos uma destas perguntas:

1. Qual lead ou oportunidade precisa de ação agora?
2. Por que essa prioridade existe?
3. Qual ação humana é recomendada?
4. Qual resultado será registrado para melhorar o próximo ciclo?
5. O que a liderança precisa aprovar antes de qualquer efeito externo?

Se uma mudança não melhora decisão, execução, registro, aprendizado ou segurança, ela não entra no ciclo de conversão.
