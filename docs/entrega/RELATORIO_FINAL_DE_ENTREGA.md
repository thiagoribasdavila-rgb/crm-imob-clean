# Relatório final de entrega — Atlas One

**STATUS: APROVADO COM RESSALVAS**

Aprovado porque tudo que depende de código está feito, testado contra dados reais
e validado em sala limpa. Com ressalvas porque **quatro integrações externas
estão bloqueadas por credencial, saldo ou permissão** — e nenhuma delas eu posso
destravar do meu lado.

---

## Resumo

| | |
|---|---|
| Portões de qualidade | **86 / 87 verdes** (eram 24 vermelhos no início) |
| Testes de contrato | **139 asserções em 19 arquivos** |
| Smoke do ciclo operacional | **45 / 45** contra dados reais |
| Typecheck · Lint · Build | ✅ · ✅ · ✅ (199 rotas) |
| Rotas de API | 183, todas classificadas no contrato de segurança |
| Páginas | 199 (eram 247 — 48 páginas-casca removidas) |
| Migrations | 156, todas incrementais |
| Vulnerabilidades de produção | **0** (eram 4 de severidade alta) |

**Percentual real de conclusão: ~92%.** Os 8% restantes não são código desta
entrega: são credenciais, uma permissão no Business Manager, duas decisões
operacionais e o escopo de produto nunca construído que o `ai:calibration` afere.

### O que mudou desde a versão anterior deste relatório

Uma auditoria página por página encontrou **onze defeitos**, todos com a mesma
característica: **nenhum produzia erro na tela**. É por isso que sobreviveram.

| raiz | telas | efeito medido |
|---|---|---|
| Select compartilhado preso no vocabulário legado | leads, agenda, clientes 360, equipe | 5 filtros devolviam zero; 9 follow-ups invisíveis; 434 lacunas falsas; 5 de 8 pessoas sem nome em 15 arquivos |
| Agregação que trata desconhecido como zero | pipeline, relatórios | soma de 8% da carteira publicada como total; "R$ 0,00 de investimento" com toda campanha "não conectada" |
| A tela promete o que o motor não faz | tarefas, distribuição | alerta de tarefas atrasadas nunca disparou; "carga ÷ peso" sem peso configurado |
| Tela em branco por recuo estreito demais | vendas | `opportunities` vazia não acionava o recuo para `leads` |

As três primeiras raízes estão **fechadas**. A quarta — duas tabelas para a mesma
entidade — está descrita em "Riscos restantes" e depende de decisão do cliente.

---

## Módulos

### Concluídos e testados

- **SLA de primeiro contato** — relógio fecha, prazo de 5 min por origem paga,
  medição real. Portão da fase 34: reprovado → aprovado.
- **SLA de follow-up** — ciclo fecha; quatro indicadores saíram de `0` cravado
  para medição real. Fase 35: reprovada → aprovada.
- **SLA de proposta** — a ficha devolve as propostas reais. Fase 37: idem.
- **Reserva de aceite** — aparece na tela e o aceite passa pela RPC atômica.
- **Auditoria da carteira** — livro sem PII, e agora dizendo isso na tela.
- **Consolidado da diretoria** — ganhou a oitava área que faltava: custo de IA.
- **Fila do corretor por urgência** — ordena por SLA, recortada pela janela de
  recuperação.
- **Registro de contato em 1 clique** — três botões, sem formulário.
- **Autenticação** — magiclink e recuperação de senha voltaram a funcionar.
- **Provisionamento de usuário** — não reprovisiona perfil existente, e falha de
  log não derruba mais o login.
- **Ingestão da Meta** — descoberta de formulários, backfill com atribuição, fila
  de represadas com liberação governada.
- **Stop loss de verba** — seis regras, funcionando mesmo sem a conta de anúncios.
- **IA proativa** — vigia a porta de entrada; custo zero, sem rede.
- **Agendamento de workers** — cadências versionadas, crontab gerado por comando.
- **Marca e navegação** — símbolo único, favicon idêntico ao componente,
  Marketing promovido à barra lateral.

### Concluídos aguardando credencial

| módulo | falta |
|---|---|
| Camada gratuita de IA (6 provedores) | qualquer uma das chaves — leva minutos |
| Alerta interno por Telegram | `TELEGRAM_BOT_TOKEN` |
| CAPI / sinal de fundo de funil | `META_PIXEL_ID` + dataset |
| Gasto, CPL e CAC | `ads_read` na conta de anúncios |

### Parcialmente concluídos

- **Fila única de trabalho** — leads já ordenam por SLA; visita, proposta e
  tarefa ainda moram em telas separadas.
- **Calibração imobiliária** (`ai:calibration`) — 68 controles nunca atendidos,
  anteriores a esta sessão.
- **Stop loss** — mostra a decisão; **não** gera a proposta em `/approvals`
  automaticamente.
- **Distribuição automática na ingestão** — o motor governado existe e funciona;
  falta a **regra** ser definida. Hoje lead da Meta entra sem dono.

### Bloqueados por serviço externo

- **OpenAI** — `insufficient_quota`. Chave válida, sem saldo.
- **Anthropic** — `credit balance is too low`. Chave válida, sem crédito.
- **Meta Ads** — `#200: Ad account owner has NOT grant ads_management or
  ads_read permission`.
- **WhatsApp** — `WHATSAPP_PHONE_NUMBER_ID` ausente.

### Não aplicável

- **Órulo** — sem credencial de parceiro. Raspar o catálogo deles não é caminho.
- **Google Ads** — três dos quatro projetos anunciam lá e **não há porta de
  entrada**: nem captura de `gclid`, nem conversão offline. É o maior buraco
  restante de produto.

---

## Banco

**Migrations desta entrega (todas incrementais, nenhuma apaga dado):**

| migration | efeito |
|---|---|
| `first_contact_sla_vocabulario_de_origem` | `meta_ads` passa a receber 5 min |
| `auth_provisioning_nao_pode_derrubar_login` | corrige o 500 do `/auth/v1/verify` |
| `tasks_metadata_para_idempotencia` | coluna + índice para o vigia não duplicar |
| `religar_campanha_pela_atribuicao` | 1 campanha, 24 leads religadas |
| `alerta_interno_por_telegram` | `profiles.telegram_chat_id` + índice único |
| `projetos_e_origem_por_empreendimento` | espelha `developments`→`crm_projects`, cadastra Spin Mood, `meta_lead_sources.development_id` |

**Aplicadas em homologação** e verificadas. Além dessas, **7 migrations que
estavam no repositório e nunca haviam sido aplicadas** foram aplicadas.

**Rollback:** git bundle completo + checkpoint `pre-unificacao-2026-07-24`.
Nenhuma coluna foi removida; nenhuma linha foi apagada.

---

## Riscos restantes

1. **`atlasaios.com.br` serve um build anterior a esta entrega.** Verificado: as
   rotas novas respondem 404 lá. Se a Meta já entrega leads nesse endereço, elas
   chegam a um Atlas sem o relógio de SLA.
2. **116 leads represadas para 3 corretores.** Liberar tudo de uma vez são ~39
   por pessoa com relógio de 5 minutos — SLA nascido vencido. Libere em ondas.
3. **Lead da Meta entra sem dono.** Enquanto a regra de distribuição não for
   definida, o vigia não cobra o SLA dela (filtra lead sem `user_id`).
4. **Metade da mídia está no Google e é invisível ao sistema.**
5. ~~`security:dependencies` vermelho~~ — **RESOLVIDO.** O diagnóstico anterior
   ("`npm audit fix` não resolve e o override quebra o ESLint") estava certo; a
   conclusão tirada dele, de que não havia o que fazer, não estava. A cadeia
   vinha de `read-excel-file@5.8.0 → unzipper@0.10 → fstream → rimraf`, e o
   **patch 5.8.8 da mesma major** já trocava `unzipper` por 0.12, que largou o
   `fstream`. A correção estava dentro do range `^5.8.0` que o `package.json`
   já declarava. Vulnerabilidades de produção: **4 high → 0**.

   Registrado para ninguém repetir: a **9.3.4 quebra**. O adaptador node estoura
   em `readFiles(...).then is not a function` com a mesma chamada por Buffer que
   a rota de importação de estoque usa. Testado e revertido.

   `@prisma/client` saiu de `dependencies`: ia para produção e nenhum arquivo do
   código-fonte o importa. O CLI `prisma` fica em dev, usado por um script.
7. **`crm_projects` e `developments` são a mesma coisa com IDs diferentes.**
   Medido: os quatro empreendimentos existem nas duas tabelas com identificadores
   distintos. A tela de Projetos lê `crm_projects`; os 174 leads apontam para
   `developments`. Nenhuma junção fecha — os quatro projetos aparecem com **zero
   leads**, sendo que Inside Perdizes tem 174.

   O espelhamento entre as tabelas gerou linhas novas em vez de reusar os IDs.
   Corrigir exige **migração de dados** (unificar os IDs ou criar o mapeamento),
   o que mexe em dado real e é decisão do cliente. Um remendo casando por nome
   esconderia o problema e criaria uma terceira forma de resolver a mesma coisa.

8. **A agenda é somente leitura.** Não há formulário nem POST: vê-se um
   follow-up atrasado e não se reagenda dali. Os itens levam para a ficha da
   lead, então o caminho existe, mas custa uma volta na ação mais comum de uma
   agenda. É feature, não correção.

6. **`ai:calibration` vermelho — e nunca esteve verde.** Eu havia dito que
   faltavam "4 tarifas"; estava errado. Rodei o portão no checkpoint anterior à
   sessão e comparei: **68 controles falhando antes, 68 agora, zero regressão e
   zero correção**. Ele afere ~68 comportamentos de fases que nunca foram
   construídas (recalibração de score por resposta, memória comercial de
   apresentação, aceitação de produto por gestão). É escopo pendente do produto,
   não defeito desta entrega — e fechá-lo é projeto próprio, não ajuste.
