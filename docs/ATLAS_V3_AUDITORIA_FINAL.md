# Atlas V3 — Auditoria final de prontidão

Data-base: 16/07/2026. Ambiente-alvo: Hostinger. Esta avaliação considera somente evidência no código e testes executáveis; páginas demonstrativas não contam como funcionalidade concluída.

## Parecer

**Aprovado com ressalvas para homologação técnica isolada. Bloqueado para substituição da produção.**

O núcleo CRM, hierarquia comercial, Meta, materiais e IA possui base funcional. O fechamento depende de migrações aplicadas em homologação, testes com usuários reais de cada perfil, recuperação por e-mail real, integrações OAuth reais, baixa financeira de comissão e piloto operacional.

## Matriz de prontidão

| Fase | Percentual | Evidência | Lacuna principal | Risco | Critério de aceite |
|---|---:|---|---|---|---|
| Auditoria técnica | 86% | Build, lint, tipos, doctor, calibração e smoke | Rotas reais dependem de credenciais | Médio | Bateria real aprovada no domínio de homologação |
| Segurança e multi-tenant | 78% | RLS, organização, hierarquia recursiva, APIs autenticadas | Isolamento ainda não comprovado com duas empresas reais | Alto | Testes cruzados retornam 403/nenhum dado para todos os perfis |
| CRM e Lead 360 | 82% | Lista paginada, pipeline, score, matching, timeline e transferência | Filtros salvos e alguns campos financeiros/documentais incompletos | Médio | Jornada completa executada sem planilha externa |
| Projetos e materiais | 72% | Incorporadora, inventário, hub versionado, book/tabela/espelho | ARVO e portfólio real não validados | Alto | Estoque e materiais reais conferidos pelos responsáveis |
| Operação comercial | 68% | Etapas, SLA, tarefas, apresentações e aprendizado de perdas | Piloto e métricas de adoção ausentes | Alto | Piloto de 5–10 dias sem bloqueio crítico |
| IA imobiliária | 84% | OpenAI, Perplexity, fallback seguro, custo, PII e aprovação humana | Qualidade não medida em conversas reais | Médio | Amostra real avaliada por corretores e gestores |
| UX e identidade | 82% | App shell, dashboard, pipeline, robôs e estados principais | Revisão móvel ampla e acessibilidade incompletas | Médio | Fluxos críticos aprovados em móvel e desktop |
| Homologação técnica | 40% | Checklist persistente e scripts de release | Ambiente isolado e migrações ainda pendentes | Alto | Release de homologação com evidências anexadas |
| Homologação operacional | 0% | Roteiro disponível | Nenhum aceite real registrado | Crítico | Todos os perfis aprovam seus critérios |
| Substituição controlada | 5% | Rollback planejado e V2 preservado | Backup, sincronização e rollback não ensaiados | Crítico | Ensaio completo aprovado pela direção |
| Comissões | 65% | SLA por incorporadora, vencimento, API de baixa e histórico financeiro | Upload de comprovante e conciliação real ainda pendentes | Alto | Financeiro valida venda, parcial, divergência e recebimento |
| Integrações omnichannel | 46% | Meta real, outbox, catálogo e contrato genérico | Google/TikTok/portais ainda não possuem OAuth/sincronização real | Alto | Cada conector passa teste, sync, idempotência e falha controlada |

## Superfície do produto

- 225 páginas encontradas.
- 46 APIs encontradas.
- 22 migrações antes desta auditoria.
- Grande parte das páginas fora do núcleo CRM possui poucas linhas e caráter demonstrativo.
- O V3 homologável deve se limitar a login, dashboard, leads, Lead 360, pipeline, tarefas, projetos, materiais, estoque, matching, vendas, relatórios, integrações configuradas, decisões e homologação.

## Melhorias aplicadas nesta auditoria

- Fallback determinístico real no roteador de IA, sem inventar resposta quando provedores externos falham.
- Detecção recursiva de segredos e limite de tamanho na configuração de integrações.
- Auditoria de configuração de conectores em eventos do Atlas.
- Comissão ampliada com valor bruto/líquido, divisão, recebido parcial, comprovante, notas, divergência e histórico.
- API financeira com configuração e baixa parcial/total exclusiva da diretoria, isolada por organização.
- Estado de vencimento recalculado na interface para não depender de uma gravação posterior.
- Checklist de homologação ampliado para recuperação, comissão, integrações e primeiro contato.
- Percentuais recalibrados para remover otimismo sem evidência.

## Pendências externas

1. Aplicar migrações somente no Supabase de homologação.
2. Configurar URLs autorizadas do Supabase para login, callback e recuperação no domínio real.
3. Disponibilizar usuários reais de diretor, superintendente, gerente e corretor em duas organizações de teste.
4. Configurar credenciais de OpenAI, Perplexity, Meta, WhatsApp e cron na Hostinger.
5. Obter credenciais e aprovação de Google Ads, TikTok Ads e portais antes de implementar sincronizações.
6. Cadastrar SLAs reais das incorporadoras e conferir vendas anteriores.

## Variáveis de ambiente

Obrigatórias: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ATLAS_CRON_SECRET`, `ATLAS_HOSTING_PROVIDER=hostinger`, `OPENAI_API_KEY`.

Condicionais: `PERPLEXITY_API_KEY`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_LEAD_ACCESS_TOKEN`, `META_CONVERSIONS_ACCESS_TOKEN`, `META_ADS_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.

## Ordem para chegar a 100%

1. Aplicar e validar banco de homologação.
2. Testar isolamento com duas organizações e quatro perfis.
3. Executar recuperação por e-mail real no domínio Hostinger.
4. Validar jornada comercial completa com dados reais.
5. Finalizar baixa e conciliação de comissões.
6. Executar piloto operacional de 5–10 dias.
7. Conectar somente provedores externos com credenciais aprovadas.
8. Testar desempenho, responsividade e acessibilidade.
9. Ensaiar backup, migração e rollback.
10. Obter aceite formal da diretoria.

## Próxima versão

Após o V3 homologado, o V4 deve priorizar produtividade agent-first: caixa financeira do corretor, indicação e recorrência, automação assistida com aprovação, colaboração entre equipes, portal do comprador e conectores certificados. Recursos futuristas sem dados reais devem permanecer fora do núcleo operacional.
