# ATLAS AI Operating System

## Visão

O modelo de IA é o motor; o ATLAS é o cérebro operacional. A vantagem proprietária está no contexto imobiliário, na memória governada, na orquestração, nos resultados observados e nas regras comerciais — não em uma resposta isolada de um fornecedor.

```text
Dados ATLAS → contexto autorizado → memória estruturada → roteador de modelos
→ análise → recomendação → decisão humana → resultado → novo aprendizado
```

O sistema nunca apresenta configuração como conexão comprovada. Uma credencial detectada é `configurada`; somente uma resposta registrada torna o provedor `operacional`.

## Arquitetura

1. **AI Control Center**: `/settings/ai` consolida modo do sistema, saúde dos provedores, custo, latência, memória, conhecimento, agentes e aprendizado.
2. **Model Router**: seleciona a menor rota capaz de executar a tarefa, permite fallback e restringe dados pessoais ao fornecedor confiável.
3. **Memory Engine**: mantém intenção, prazo, forma de pagamento, objeções, sinais, etapa e próxima ação por lead e corretor. Conversas brutas não são persistidas nessa memória.
4. **Knowledge Engine**: usa materiais atuais e verificados de projetos, estudos de região, playbooks aprovados e fontes imobiliárias identificadas.
5. **Learning Loop**: registra sugestão, decisão humana e resultado operacional para calibração posterior. Aprendizado não significa alteração automática do modelo em produção.
6. **Governance**: tenant, hierarquia, RLS, auditoria, telemetria de custo, limites e revisão humana.

## Modos operacionais

| Modo | Condição | Comportamento |
|---|---|---|
| `operational` | provedor generativo respondeu e há evidência | recomendações generativas supervisionadas |
| `prepared_offline` | chave existe, mas crédito/capacidade/teste não aprovou | CRM, score local, memória e preparação de contexto continuam; nova chamada volta a funcionar sem mudança de código quando o provedor recuperar |
| `local_only` | nenhuma rota generativa configurada | regras determinísticas, alertas, priorização, memória e relatórios continuam |

“Ativação automática” significa recuperação da capacidade na próxima chamada autorizada. Não significa envio automático de mensagem, transferência, campanha, proposta ou decisão financeira.

## Agentes controlados

| Agente | Missão | Estado sem motor | Limite |
|---|---|---|---|
| Lead | score, intenção, próxima ação | preparado | não redistribui nem contata |
| Sales | abordagem, objeções, preparação | preparado | não envia mensagem/proposta |
| Manager | equipe, SLA, carteira | determinístico | recomenda, não pune nem transfere |
| Executive | previsão, riscos e oportunidades | determinístico | decisão final permanece na diretoria |
| Marketing | campanhas, públicos e ROI | preparado | exige Meta/CAPI e aprovação humana |

## Memória e conhecimento

- Memória do cliente: fatos estruturados e relevantes para o atendimento, com propriedade exclusiva por lead e corretor.
- Memória operacional: decisões de roteamento, uso, custo, guardrails e resultados classificados.
- Conhecimento empresarial: materiais verificados, versões comerciais vigentes, regras de incorporadoras e playbooks aprovados.
- Retenção e correção: memória comercial estruturada expira, pode ser corrigida/resetada com motivo e preserva trilha de auditoria.
- Privacidade: chaves permanecem no servidor; PII não segue para pesquisa web ou provedores econômicos; dados entre organizações não se misturam.

## Saúde, custo e limites

O Health Center mede chamadas, tokens, latência, custo estimado e último sucesso por provedor. Tarifas ausentes não podem ser inventadas. Limites por perfil devem ser aplicados no servidor: diretoria vê governança completa; corretores usam funções comerciais dentro da própria carteira.

## Uso embarcado

- Leads: próxima ação, intenção e qualidade dos dados.
- Pipeline: risco, SLA, envelhecimento e chance de avanço.
- Projetos: aderência, materiais vigentes e oportunidades.
- Marketing: campanha até receita e aprendizado de público.
- Command Center: prioridades e decisões explicáveis.
- Relatórios: leitura executiva com evidência e limites.

## Voz e reuniões

A fundação está preparada para transcrição, resumo e criação sugerida de tarefas. Voz não está declarada como ativa até existir consentimento, política de retenção, teste real, controle de custo e aprovação da segurança.

## ATLAS AI Advantage

O valor comercial será medido por tempo até primeiro contato, follow-ups recuperados, conversão por etapa, produtividade por corretor, custo por venda, receita atribuída e redução de trabalho administrativo. Percentual de “inteligência” sem amostra, resultado e calibração não é prova de precisão.

## Estado verificado em 17/07/2026

- OpenAI: credencial configurada; último teste ao vivo retornou limite de crédito/cota (HTTP 429), portanto não está homologada como operacional.
- Perplexity: pesquisa ao vivo aprovada, com fontes e telemetria; não recebe dados pessoais.
- Motor local: ativo para contingência e análises determinísticas.
- Memória estruturada, roteamento, guardrails e telemetria: implementados.
- Meta/Andromeda e WhatsApp: continuam condicionados às credenciais completas, eventos reais e homologação.
- Agentes: supervisionados/preparados; ações externas autônomas permanecem bloqueadas.

## Gates de produção

1. Provedor generativo com resposta real, custo e latência registrados.
2. Cenários reais aprovados com usuários comerciais, incluindo Senna e Diego.
3. RLS e isolamento entre organizações testados.
4. Sugestão, decisão e resultado registrados em amostra suficiente.
5. Limites de custo e taxa definidos por perfil.
6. Meta/WhatsApp aprovados separadamente antes de qualquer envio.
7. Gate humano obrigatório para campanha, contato, transferência, proposta e decisão financeira.

## Roadmap

1. Restaurar crédito OpenAI e repetir os ensaios de rotas.
2. Homologar os cinco agentes em modo somente sugestão.
3. Medir aceitação e resultado das recomendações.
4. Expandir ingestão governada de conhecimento e busca contextual.
5. Ativar marketing com conversões reais e aprovação da diretoria.
6. Pilotar voz após consentimento, retenção e segurança.

## Referências técnicas

- OpenAI: estado de conversação deve ser gerido explicitamente; o ATLAS mantém sua memória empresarial fora do modelo.
- OpenAI: agentes de alto impacto devem aplicar moderação, limites e revisão humana.
- Supabase: tabelas expostas usam RLS, segredos/service role ficam fora do cliente e autorização não depende de metadados editáveis pelo usuário.

