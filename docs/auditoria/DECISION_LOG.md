# REGISTRO DE DECISÕES

Cada linha é uma escolha que poderia ter sido outra. Registra-se o **porquê**, para
que quem discordar depois discuta o critério e não a preferência.

| # | data | decisão | alternativa recusada | por quê |
|---|---|---|---|---|
| D-01 | 30/07 | **Não** alterar a assinatura de `move_pipeline_lead`; gravar o motivo do descarte num `update` próprio | `DROP`+`CREATE` com parâmetro novo | `CREATE OR REPLACE` com assinatura nova cria sobrecarga e o PostgREST erra por ambiguidade. O arquivo já resolvera isso para `sale_value_brl`, com o motivo escrito |
| D-02 | 30/07 | **Inverter** a asserção de `check-evolution-phase-051` em vez de removê-la | remover a linha para o portão passar | ela proibia a rota de ler `opportunities`, e essa proibição **produzia** o defeito. Inverter deixou o portão **mais forte** |
| D-03 | 30/07 | Não desenhar série temporal na sala de comando | gráfico de evolução semanal | `pipeline_stage_moves` cabe em 4 dias; a linha seria reta e não significaria nada |
| D-04 | 30/07 | Deletar a seção "Matching Atlas" em vez de alimentá-la | preencher `properties` | ela duplicaria o painel de compatibilidade — duas respostas para a mesma pergunta na mesma tela |
| D-05 | 31/07 | **Desativar** as contas de teste, não apagar | apagar os 17 perfis | `audit_logs.actor_id` os referencia; apagar exigiria destruir trilha de auditoria, que é outra categoria de dado |
| D-06 | 31/07 | Comparar migrations por **nome**, não por versão | manter versão | `version` é o carimbo de aplicação, nunca coincide com o prefixo do arquivo → falso vermelho permanente |
| D-07 | 31/07 | **Equivalências declaradas**, não casamento por sufixo | `x` casa com `x_algo` | a heurística esconderia migration ausente cujo nome fosse prefixo de outra: falso verde |
| D-08 | 31/07 | Reivindicação atômica no **banco** | manter SELECT+UPDATE com tolerância de relógio | tolerância trata sintoma; o problema era **dois relógios**. Com `now()` do banco não há o que tolerar |
| D-09 | 31/07 | Kill switch **visível** na prontidão | pausa silenciosa | pausa invisível é indistinguível de pane — foi assim que 44h49m passaram |
| D-10 | 31/07 | Precedência **pausa vence parado** | parado vence | sistema pausado acumula fila por construção; a ordem inversa transformaria toda pausa em incidente |
| D-11 | 31/07 | **Não** remover os 414 arquivos vazios neste checkpoint | limpar junto | misturaria limpeza com auditoria; quem revertesse a auditoria os ressuscitaria |
| D-12 | 31/07 | **Não** mockar os 9 testes de PostGIS | fixtures para "zerar" os pulados | transformaria 9 provas reais em 9 provas de mentira. Pulo declarado é honesto; mock que finge é pior que pulo |
| D-13 | 31/07 | Fase 4 entregue como **desenho**, sem código | implementar as flags | a regra da rodada é não iniciar a Fase 3; criar `ATLAS_IA_PARADA` sem consumidor seria interruptor que não desliga nada |
| D-14 | 31/07 | `promptRef` em vez de `prompt` no registro futuro | gravar o prompt inteiro | copiaria dado de cliente para uma segunda tabela, com outra retenção e outros leitores |
| D-15 | 31/07 | **Não** reprocessar os 2 eventos falhados | reprocessar para limpar a fila | os IDs são sintéticos; reprocessar é seguro e inútil, e só os levaria ao dead-letter |
| D-16 | 31/07 | Recomendar **A** (compartilhar a página) e não B (migrar 19 anúncios) | migrar os anúncios | B reinicia aprendizado, exige nova revisão e destrói prova social. A depende de terceiro — e é a hora de tentar isso, não depois |

## DECISÕES QUE NÃO SÃO MINHAS

Registradas aqui porque bloqueiam trabalho e só o dono resolve:

| assunto | o que falta |
|---|---|
| Página Meta `1115087091694606` | o proprietário compartilhar o ativo com o BM `488439536919148` |
| Acesso SSH | instalar cron, publicar build, provar execução automática |
| Os 31 registros de auditoria das contas de teste | decidir se podem ser removidos para liberar os 17 perfis |
| Política de SLA de primeiro contato | hoje convivem 15 min (469 leads), 1440 (10) e 5 (3) |
| Os 414 arquivos vazios | autorizar a remoção em commit próprio |
